import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_JSON = resolve(ROOT, "data/bouts.json");
const OUTPUT_JS = resolve(ROOT, "data/bouts.js");
const CHANNEL_URL = "https://www.youtube.com/@sumo-video/videos?hl=ja&gl=JP";
const CHANNEL_ID = "UC6ZZhovRZpUA4VafgBdECZQ";
const MAX_PAGES = 14;
const REQUEST_HEADERS = {
  "accept-language": "ja-JP,ja;q=0.9",
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
};

function parseBalancedJson(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`YouTube応答内に ${marker} が見つかりません`);
  const start = markerIndex + marker.length;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}" && --depth === 0) return JSON.parse(source.slice(start, index + 1));
  }

  throw new Error(`YouTube応答内の ${marker} を解析できません`);
}

function configValue(html, key) {
  const match = html.match(new RegExp(`"${key}":"([^"]+)"`));
  if (!match) throw new Error(`${key} が見つかりません`);
  return JSON.parse(`"${match[1]}"`);
}

function textFromRuns(value) {
  return value?.simpleText || value?.runs?.map((item) => item.text).join("") || "";
}

function parseVideo(content) {
  const legacy = content?.videoRenderer;
  if (legacy) {
    return {
      id: legacy.videoId,
      title: textFromRuns(legacy.title),
      thumbnail: legacy.thumbnail?.thumbnails?.at(-1)?.url,
      duration: textFromRuns(legacy.lengthText),
    };
  }

  const modern = content?.lockupViewModel;
  if (modern?.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") return null;
  const badges = modern.contentImage?.thumbnailViewModel?.overlays || [];
  const duration = badges
    .map((item) => item.thumbnailBottomOverlayViewModel?.badges?.[0]?.thumbnailBadgeViewModel?.text)
    .find(Boolean);

  return {
    id: modern.contentId,
    title: modern.metadata?.lockupMetadataViewModel?.title?.content || "",
    thumbnail: modern.contentImage?.thumbnailViewModel?.image?.sources?.at(-1)?.url,
    duration,
  };
}

function scan(value, result = { videos: [], continuations: [] }) {
  if (!value || typeof value !== "object") return result;

  const content = value.richItemRenderer?.content;
  const video = parseVideo(content);
  if (video?.id && video.title) result.videos.push(video);

  const token = value.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token;
  if (token) result.continuations.push(token);

  for (const child of Object.values(value)) scan(child, result);
  return result;
}

function toAsciiDigits(value) {
  return value.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
}

function tournamentInfo(title) {
  const normalized = toAsciiDigits(title);
  const match = normalized.match(/[＜<]令和(\d+)年(.+?)場所・(?:(\d+)日目|(初日|中日|千秋楽))[＞>]/);
  if (!match) return null;
  const namedDays = { 初日: 1, 中日: 8, 千秋楽: 15 };
  return { eraYear: Number(match[1]), basho: match[2], day: match[3] ? Number(match[3]) : namedDays[match[4]] };
}

function displayTitle(title) {
  const withoutPrefix = title.replace(/^大相撲[\s　]*/, "");
  return withoutPrefix
    .replace(/[＜<]令和[０-９0-9]+年.+?場所・(?:[０-９0-9]+日目|初日|中日|千秋楽)[＞>].*$/, "")
    .trim();
}

async function getUploadDate(videoId) {
  const response = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=ja`, { headers: REQUEST_HEADERS });
  if (!response.ok) throw new Error(`動画 ${videoId} の公開日を取得できません (${response.status})`);
  const html = await response.text();
  return html.match(/"uploadDate":"(\d{4}-\d{2}-\d{2})/)?.[1] || null;
}

async function fetchVideos() {
  const response = await fetch(CHANNEL_URL, { headers: REQUEST_HEADERS });
  if (!response.ok) throw new Error(`YouTube一覧を取得できません (${response.status})`);
  const html = await response.text();
  const initialData = parseBalancedJson(html, "var ytInitialData = ");
  const apiKey = configValue(html, "INNERTUBE_API_KEY");
  const clientVersion = configValue(html, "INNERTUBE_CLIENT_VERSION");
  const visitorData = configValue(html, "VISITOR_DATA");

  const selectedTab = initialData.contents?.twoColumnBrowseResultsRenderer?.tabs?.find(
    (item) => item.tabRenderer?.selected,
  )?.tabRenderer;
  const initialVideoGrid = selectedTab?.content?.richGridRenderer || initialData;
  const first = scan(initialVideoGrid);
  const allVideos = [...first.videos];
  let continuation = first.continuations.at(-1);
  let dayOneWasAlreadySeen = first.videos.some((video) => tournamentInfo(video.title)?.day === 1);

  for (let page = 1; continuation && page < MAX_PAGES; page += 1) {
    const continuationResponse = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
      method: "POST",
      headers: {
        ...REQUEST_HEADERS,
        "content-type": "application/json",
        "x-youtube-client-name": "1",
        "x-youtube-client-version": clientVersion,
      },
      body: JSON.stringify({
        context: {
          client: { clientName: "WEB", clientVersion, visitorData, hl: "ja", gl: "JP" },
        },
        continuation,
      }),
    });
    if (!continuationResponse.ok) throw new Error(`YouTube続きページを取得できません (${continuationResponse.status})`);
    const pageData = await continuationResponse.json();
    const scanned = scan(pageData);
    allVideos.push(...scanned.videos);
    continuation = scanned.continuations.at(-1);

    const parsed = allVideos.map((video) => tournamentInfo(video.title)).filter(Boolean);
    const maxDay = Math.max(0, ...parsed.map((item) => item.day));
    const minDay = Math.min(99, ...parsed.map((item) => item.day));
    if (maxDay >= 3 && minDay === 1) {
      if (dayOneWasAlreadySeen) break;
      dayOneWasAlreadySeen = true;
    }
  }

  return [...new Map(allVideos.map((video) => [video.id, video])).values()];
}

async function existingData() {
  try {
    return JSON.parse(await readFile(OUTPUT_JSON, "utf8"));
  } catch {
    return null;
  }
}

async function buildData() {
  const videosNewestFirst = await fetchVideos();
  const relevant = videosNewestFirst
    .map((video, newestIndex) => ({ ...video, newestIndex, info: tournamentInfo(video.title) }))
    .filter(
      (video) => video.info && !/#shorts/i.test(video.title) && !video.title.includes("幕下上位五番"),
    );

  if (!relevant.length) throw new Error("現在の本場所取組動画が見つかりませんでした");

  const active = relevant[0].info;
  const activeVideos = relevant.filter(
    (video) => video.info.eraYear === active.eraYear && video.info.basho === active.basho,
  );
  const grouped = Map.groupBy(activeVideos, (video) => video.info.day);
  const representative = grouped.get(Math.max(...grouped.keys()))?.[0];
  const representativeDate = representative ? await getUploadDate(representative.id) : null;
  const representativeDay = representative?.info.day;
  let startDate = representativeDate;

  if (representativeDate && representativeDay) {
    const start = new Date(`${representativeDate}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - representativeDay + 1);
    startDate = start.toISOString().slice(0, 10);
  } else {
    startDate = (await existingData())?.tournament?.startDate;
  }
  if (!startDate) throw new Error("本場所の開始日を特定できませんでした");

  const days = [...grouped.entries()]
    .map(([day, items]) => {
      const ordered = [...items].sort((a, b) => b.newestIndex - a.newestIndex);
      const videos = ordered.map(({ id, title, thumbnail, duration }) => ({
        id,
        title,
        displayTitle: displayTitle(title),
        thumbnail: thumbnail?.replace(/\?.*$/, "") || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        duration: duration || "",
      }));
      const date = new Date(`${startDate}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + day - 1);
      return {
        day,
        date: date.toISOString().slice(0, 10),
        complete: videos.at(-1)?.title.includes("横綱") || false,
        videos,
      };
    })
    .sort((a, b) => a.day - b.day);

  return {
    generatedAt: new Date().toISOString(),
    source: {
      channelId: CHANNEL_ID,
      channelName: "日本相撲協会公式チャンネル",
      url: "https://www.youtube.com/@sumo-video/videos",
    },
    tournament: {
      label: `令和${active.eraYear}年 ${active.basho}場所`,
      eraYear: active.eraYear,
      basho: active.basho,
      startDate,
      days,
    },
  };
}

try {
  const data = await buildData();
  const serialized = JSON.stringify(data, null, 2);
  await mkdir(dirname(OUTPUT_JSON), { recursive: true });
  await writeFile(OUTPUT_JSON, `${serialized}\n`, "utf8");
  await writeFile(OUTPUT_JS, `window.SUMO_DIGEST_DATA = ${serialized};\n`, "utf8");
  const total = data.tournament.days.reduce((sum, day) => sum + day.videos.length, 0);
  console.log(`${data.tournament.label}: ${data.tournament.days.length}日分、${total}取組を更新しました`);
} catch (error) {
  console.error(`更新失敗: ${error.message}`);
  process.exitCode = 1;
}
