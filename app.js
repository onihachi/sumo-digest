const els = {
  bashoLabel: document.querySelector("#basho-label"),
  dateLabel: document.querySelector("#date-label"),
  countLabel: document.querySelector("#count-label"),
  daySelect: document.querySelector("#day-select"),
  currentNumber: document.querySelector("#current-number"),
  totalNumber: document.querySelector("#total-number"),
  statusPill: document.querySelector("#status-pill"),
  player: document.querySelector("#video-player"),
  emptyState: document.querySelector("#empty-state"),
  boutInfo: document.querySelector("#bout-info"),
  boutEyebrow: document.querySelector("#bout-eyebrow"),
  boutTitle: document.querySelector("#bout-title"),
  progressBar: document.querySelector("#progress-bar"),
  previousButton: document.querySelector("#previous-button"),
  nextButton: document.querySelector("#next-button"),
  updatedLabel: document.querySelector("#updated-label"),
};

const state = {
  data: null,
  days: [],
  selectedDay: null,
  currentIndex: 0,
};

const DAY_NAMES = { 1: "初日", 8: "中日", 15: "千秋楽" };

function tokyoDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function todayInTokyo() {
  const { year, month, day } = tokyoDateParts();
  return `${year}-${month}-${day}`;
}

function daysBetween(start, end) {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.round((endMs - startMs) / 86_400_000);
}

function dateForDay(start, day) {
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + day - 1);
  return date.toISOString().slice(0, 10);
}

function displayDayName(day) {
  return DAY_NAMES[day] || `${day}日目`;
}

function displayDate(value, includeYear = false) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "UTC",
    ...(includeYear ? { year: "numeric" } : {}),
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${value}T00:00:00Z`));
}

function withTodayPlaceholder(data) {
  const days = [...data.tournament.days];
  const offset = daysBetween(data.tournament.startDate, todayInTokyo());
  const dayNumber = offset + 1;

  if (dayNumber >= 1 && dayNumber <= 15 && !days.some((item) => item.day === dayNumber)) {
    days.push({
      day: dayNumber,
      date: dateForDay(data.tournament.startDate, dayNumber),
      complete: false,
      videos: [],
    });
  }

  return days.sort((a, b) => a.day - b.day);
}

function buildDayPicker() {
  els.daySelect.replaceChildren();

  for (const day of [...state.days].reverse()) {
    const option = document.createElement("option");
    option.value = String(day.day);
    option.textContent = displayDayName(day.day);
    els.daySelect.append(option);
  }
}

function selectedVideos() {
  return state.selectedDay?.videos || [];
}

function updateVideo({ autoplay = false } = {}) {
  const videos = selectedVideos();
  const video = videos[state.currentIndex];
  const hasVideo = Boolean(video);

  els.player.hidden = !hasVideo;
  els.emptyState.hidden = hasVideo;
  els.boutInfo.hidden = !hasVideo;
  els.currentNumber.textContent = hasVideo ? String(state.currentIndex + 1).padStart(2, "0") : "—";
  els.totalNumber.textContent = videos.length ? String(videos.length).padStart(2, "0") : "—";
  els.progressBar.style.width = hasVideo ? `${((state.currentIndex + 1) / videos.length) * 100}%` : "0%";

  if (hasVideo) {
    const params = new URLSearchParams({
      rel: "0",
      playsinline: "1",
      modestbranding: "1",
      ...(autoplay ? { autoplay: "1" } : {}),
    });
    els.player.src = `https://www.youtube-nocookie.com/embed/${video.id}?${params}`;
    els.boutEyebrow.textContent = state.currentIndex === videos.length - 1 ? "結びの一番" : `第${state.currentIndex + 1}取組`;
    els.boutTitle.textContent = video.displayTitle;
    document.title = `${displayDayName(state.selectedDay.day)} ${video.displayTitle}｜大相撲 取組ダイジェスト`;
  } else {
    els.player.removeAttribute("src");
    document.title = `${displayDayName(state.selectedDay.day)} 取組ダイジェスト｜大相撲`;
  }

  els.previousButton.disabled = !hasVideo || state.currentIndex === 0;
  els.nextButton.disabled = !hasVideo || state.currentIndex === videos.length - 1;
  els.nextButton.querySelector("span:first-child").textContent =
    hasVideo && state.currentIndex === videos.length - 1 ? "本日の結びです" : "次の取組";
}

function selectDay(dayNumber) {
  state.selectedDay = state.days.find((item) => item.day === Number(dayNumber)) || state.days.at(-1);
  state.currentIndex = 0;
  const { day, date, videos, complete } = state.selectedDay;

  els.daySelect.value = String(day);
  els.dateLabel.textContent = displayDate(date, true);
  els.countLabel.textContent = videos.length ? `${videos.length}取組を収録` : "動画の公開待ち";
  els.statusPill.textContent = complete ? "全取組 公開済み" : videos.length ? "順次更新中" : "18時・19時 更新";
  els.statusPill.classList.toggle("complete", complete);
  updateVideo();

  try {
    const url = new URL(window.location.href);
    url.searchParams.set("day", String(day));
    history.replaceState(null, "", url);
  } catch (error) {
    console.warn("選択日のURL保存を省略しました", error);
  }
}

function moveBy(amount) {
  const next = state.currentIndex + amount;
  if (next < 0 || next >= selectedVideos().length) return;
  state.currentIndex = next;
  updateVideo({ autoplay: true });
  document.querySelector(".viewer-shell").scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindEvents() {
  const handleDaySelection = (event) => {
    const selected = Number(event.currentTarget.value);
    if (state.selectedDay?.day !== selected) selectDay(selected);
  };
  els.daySelect.addEventListener("change", handleDaySelection);
  els.daySelect.addEventListener("input", handleDaySelection);
  els.previousButton.addEventListener("click", () => moveBy(-1));
  els.nextButton.addEventListener("click", () => moveBy(1));

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("select, button, input, textarea")) return;
    if (event.key === "ArrowLeft") moveBy(-1);
    if (event.key === "ArrowRight") moveBy(1);
  });

  let touchStartX = null;
  const playerFrame = document.querySelector("#player-frame");
  playerFrame.addEventListener("touchstart", (event) => {
    touchStartX = event.changedTouches[0].clientX;
  }, { passive: true });
  playerFrame.addEventListener("touchend", (event) => {
    if (touchStartX === null) return;
    const distance = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(distance) > 70) moveBy(distance > 0 ? -1 : 1);
    touchStartX = null;
  }, { passive: true });
}

async function init() {
  try {
    if (window.SUMO_DIGEST_DATA) {
      state.data = window.SUMO_DIGEST_DATA;
    } else {
      const response = await fetch("data/bouts.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`データ取得エラー: ${response.status}`);
      state.data = await response.json();
    }
    state.days = withTodayPlaceholder(state.data);

    els.bashoLabel.textContent = state.data.tournament.label;
    els.updatedLabel.textContent = `最終更新 ${new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(state.data.generatedAt))}`;

    buildDayPicker();
    bindEvents();
    const requestedDay = Number(new URLSearchParams(location.search).get("day"));
    const availableRequestedDay = state.days.some(
      (item) => item.day === requestedDay && item.videos.length > 0,
    );
    const latestDayWithVideos = [...state.days].reverse().find((item) => item.videos.length);
    selectDay(availableRequestedDay ? requestedDay : latestDayWithVideos?.day || state.days.at(-1).day);
  } catch (error) {
    console.error(error);
    els.countLabel.textContent = "読み込みエラー";
    els.emptyState.hidden = false;
    els.player.hidden = true;
    els.boutInfo.hidden = true;
  }
}

init();
