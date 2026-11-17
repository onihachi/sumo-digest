export const BASHO_MONTHS = {
  一月: "01",
  三月: "03",
  五月: "05",
  七月: "07",
  九月: "09",
  十一月: "11",
  九州: "11",
};

export function validTimestamp(value) {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function tournamentId(tournament) {
  const month = BASHO_MONTHS[tournament?.basho];
  return Number.isInteger(tournament?.eraYear) && month
    ? `${tournament.eraYear + 2018}-${month}`
    : null;
}

function validateVideos(errors, videos, context) {
  if (!Array.isArray(videos)) {
    errors.push(`${context} のvideosが配列ではありません`);
    return;
  }
  const ids = new Set();
  for (const video of videos) {
    if (!/^[\w-]{11}$/.test(video?.id || "")) errors.push(`${context} の動画IDが不正です: ${video?.id}`);
    if (ids.has(video?.id)) errors.push(`${context} に動画IDの重複があります: ${video.id}`);
    if (!video?.displayTitle) errors.push(`${video?.id || context} の表示タイトルがありません`);
    ids.add(video?.id);
  }
}

export function validateArchiveCollection(archives, { currentId = null, requireNonEmpty = true } = {}) {
  const errors = [];
  if (!validTimestamp(archives?.generatedAt)) errors.push("アーカイブのgeneratedAtが不正です");
  if (!Array.isArray(archives?.tournaments)) {
    errors.push("アーカイブ場所データが配列ではありません");
    return errors;
  }
  if (requireNonEmpty && archives.tournaments.length === 0) {
    errors.push("アーカイブ場所データがありません");
  }

  const archiveIds = new Set();
  for (const tournament of archives.tournaments) {
    const expectedId = tournamentId(tournament);
    if (!/^\d{4}-\d{2}$/.test(tournament?.id || "") || tournament.id !== expectedId) {
      errors.push(`アーカイブIDが不正です: ${tournament?.id}`);
    }
    if (archiveIds.has(tournament.id)) errors.push(`アーカイブIDが重複しています: ${tournament.id}`);
    if (currentId && tournament.id === currentId) errors.push(`現在場所がアーカイブに含まれています: ${tournament.id}`);
    if (!tournament.displayLabel) errors.push(`${tournament.id} の表示名がありません`);
    if (!validDate(tournament.startDate)) errors.push(`${tournament.id} のstartDateが不正です`);
    if (!Array.isArray(tournament.days) || tournament.days.length !== 15) {
      errors.push(`${tournament.id} は15日分のデータが必要です`);
    }
    archiveIds.add(tournament.id);

    const days = new Set();
    for (const day of tournament.days || []) {
      if (!Number.isInteger(day.day) || day.day < 1 || day.day > 15) {
        errors.push(`${tournament.id} の日数が不正です: ${day.day}`);
      }
      if (days.has(day.day)) errors.push(`${tournament.id} の日数が重複しています: ${day.day}`);
      if (!validDate(day.date)) errors.push(`${tournament.id} ${day.day}日目の日付が不正です`);
      days.add(day.day);
      validateVideos(errors, day.videos, `${tournament.id} ${day.day}日目`);
    }
    for (let day = 1; day <= 15; day += 1) {
      if (!days.has(day)) errors.push(`${tournament.id} の${day}日目がありません`);
    }
  }
  return errors;
}

export function validateCurrentVideos(errors, videos, context) {
  validateVideos(errors, videos, context);
}
