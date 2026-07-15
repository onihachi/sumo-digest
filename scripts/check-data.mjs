import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const path = resolve("data/bouts.json");
const data = JSON.parse(await readFile(path, "utf8"));
const errors = [];

if (!data.generatedAt || Number.isNaN(Date.parse(data.generatedAt))) errors.push("generatedAt が不正です");
if (!data.tournament?.startDate) errors.push("startDate がありません");
if (!data.tournament?.days?.length) errors.push("日別データがありません");

for (const day of data.tournament?.days || []) {
  if (!Number.isInteger(day.day) || day.day < 1 || day.day > 15) errors.push(`日数が不正です: ${day.day}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) errors.push(`${day.day}日目の日付が不正です`);
  const ids = new Set();
  for (const video of day.videos || []) {
    if (!/^[\w-]{11}$/.test(video.id)) errors.push(`${day.day}日目の動画IDが不正です: ${video.id}`);
    if (ids.has(video.id)) errors.push(`${day.day}日目に動画IDの重複があります: ${video.id}`);
    if (!video.displayTitle) errors.push(`${video.id} の表示タイトルがありません`);
    ids.add(video.id);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const total = data.tournament.days.reduce((sum, day) => sum + day.videos.length, 0);
console.log(`OK: ${data.tournament.label} ${data.tournament.days.length}日分 / ${total}取組`);
