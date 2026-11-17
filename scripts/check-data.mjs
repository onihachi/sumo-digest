import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  tournamentId,
  validDate,
  validTimestamp,
  validateArchiveCollection,
  validateCurrentVideos,
} from "./archive-schema.mjs";

export function parseWindowData(source, variableName) {
  const prefix = `window.${variableName} = `;
  if (!source.startsWith(prefix) || !/;\s*$/.test(source)) {
    throw new Error(`${variableName} のJavaScript形式が不正です`);
  }
  return JSON.parse(source.slice(prefix.length).replace(/;\s*$/, ""));
}

export function validateData(data, archives, assets = {}) {
  const errors = [];

  if (!validTimestamp(data?.generatedAt)) errors.push("generatedAt が不正です");
  if (!validDate(data?.tournament?.startDate)) errors.push("startDate が不正です");
  if (!Array.isArray(data?.tournament?.days) || data.tournament.days.length === 0) {
    errors.push("日別データがありません");
  }

  const currentDays = new Set();
  for (const day of data?.tournament?.days || []) {
    if (!Number.isInteger(day.day) || day.day < 1 || day.day > 15) errors.push(`日数が不正です: ${day.day}`);
    if (currentDays.has(day.day)) errors.push(`日数が重複しています: ${day.day}`);
    if (!validDate(day.date)) errors.push(`${day.day}日目の日付が不正です`);
    currentDays.add(day.day);
    validateCurrentVideos(errors, day.videos, `${day.day}日目`);
  }

  const currentId = tournamentId(data?.tournament);
  errors.push(...validateArchiveCollection(archives, { currentId }));

  for (const [source, variableName, expected, label] of [
    [assets.boutsJs, "SUMO_DIGEST_DATA", data, "bouts.js"],
    [assets.archivesJs, "SUMO_DIGEST_ARCHIVES", archives, "archives.js"],
  ]) {
    if (source === undefined) continue;
    try {
      const actual = parseWindowData(source, variableName);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push(`${label} がJSONデータと一致しません`);
    } catch (error) {
      errors.push(`${label} を解析できません: ${error.message}`);
    }
  }

  return errors;
}

export async function runValidation() {
  const [dataText, archiveText, boutsJs, archivesJs] = await Promise.all([
    readFile(resolve("data/bouts.json"), "utf8"),
    readFile(resolve("data/archives.json"), "utf8"),
    readFile(resolve("data/bouts.js"), "utf8"),
    readFile(resolve("data/archives.js"), "utf8"),
  ]);
  const data = JSON.parse(dataText);
  const archives = JSON.parse(archiveText);
  const errors = validateData(data, archives, { boutsJs, archivesJs });

  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
    return;
  }

  const total = data.tournament.days.reduce((sum, day) => sum + day.videos.length, 0);
  const archiveTotal = archives.tournaments.reduce(
    (sum, tournament) => sum + tournament.days.reduce((daySum, day) => daySum + day.videos.length, 0),
    0,
  );
  console.log(
    `OK: ${data.tournament.label} ${data.tournament.days.length}日分 / ${total}取組、` +
      `過去${archives.tournaments.length}場所 / ${archiveTotal}取組`,
  );
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) await runValidation();
