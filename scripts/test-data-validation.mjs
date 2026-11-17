import assert from "node:assert/strict";
import { validateData } from "./check-data.mjs";

function video(id = "abcdefghijk") {
  return { id, displayTitle: "取組" };
}

function days(startDate) {
  return Array.from({ length: 15 }, (_, index) => {
    const date = new Date(`${startDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return { day: index + 1, date: date.toISOString().slice(0, 10), complete: false, videos: [video()] };
  });
}

const current = {
  generatedAt: "2026-11-17T00:00:00.000Z",
  tournament: {
    label: "令和8年 九州場所",
    eraYear: 8,
    basho: "九州",
    startDate: "2026-11-08",
    days: [{ day: 1, date: "2026-11-08", complete: true, videos: [video()] }],
  },
};
const archives = {
  generatedAt: "2026-11-17T00:00:00.000Z",
  tournaments: [{
    id: "2026-09",
    displayLabel: "2026年 秋場所",
    label: "令和8年 九月場所",
    eraYear: 8,
    basho: "九月",
    startDate: "2026-09-13",
    days: days("2026-09-13"),
  }],
};
const jsAssets = {
  boutsJs: `window.SUMO_DIGEST_DATA = ${JSON.stringify(current)};\n`,
  archivesJs: `window.SUMO_DIGEST_ARCHIVES = ${JSON.stringify(archives)};\n`,
};

assert.deepEqual(validateData(current, archives, jsAssets), [], "valid JSON and JS assets must pass");

let broken = structuredClone(archives);
broken.tournaments = [];
assert(validateData(current, broken).some((error) => error.includes("場所データがありません")));

broken = structuredClone(archives);
broken.tournaments[0].days.push(structuredClone(broken.tournaments[0].days[0]));
assert(validateData(current, broken).some((error) => error.includes("日数が重複")));

broken = structuredClone(archives);
broken.generatedAt = "not-a-date";
assert(validateData(current, broken).some((error) => error.includes("generatedAt")));

broken = structuredClone(archives);
broken.tournaments[0] = {
  ...broken.tournaments[0],
  id: "2026-11",
  eraYear: 8,
  basho: "九州",
  startDate: "2026-11-08",
  days: days("2026-11-08"),
};
assert(validateData(current, broken).some((error) => error.includes("現在場所がアーカイブ")));

assert(
  validateData(current, archives, { ...jsAssets, archivesJs: "window.SUMO_DIGEST_ARCHIVES = {};\n" })
    .some((error) => error.includes("archives.js がJSONデータと一致")),
);

console.log("OK: データ検証の異常系フィクスチャ");
