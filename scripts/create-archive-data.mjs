import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAY_DATA = process.env.SUMO_MAY_DATA;

if (!MAY_DATA) {
  throw new Error("SUMO_MAY_DATA に五月場所の bouts.json を指定してください");
}

const sources = [
  {
    id: "2026-05",
    displayLabel: "2026年 夏場所",
    startDate: "2026-05-10",
    data: JSON.parse(await readFile(MAY_DATA, "utf8")),
  },
  {
    id: "2026-07",
    displayLabel: "2026年 名古屋場所",
    startDate: "2026-07-12",
    data: JSON.parse(
      execFileSync(
        "git",
        ["show", "0b6d8928b656d0a1e190dfa27e7356a073f89ed8:data/bouts.json"],
        { cwd: ROOT, encoding: "utf8", maxBuffer: 20_000_000 },
      ),
    ),
  },
  {
    id: "2026-09",
    displayLabel: "2026年 秋場所",
    startDate: "2026-09-13",
    data: JSON.parse(
      execFileSync(
        "git",
        ["show", "dc82e9fedf70b5f714ca6fff4a7569e4256d2b1b:data/bouts.json"],
        { cwd: ROOT, encoding: "utf8", maxBuffer: 20_000_000 },
      ),
    ),
  },
];

function normalizeTournament(source) {
  const tournament = structuredClone(source.data.tournament);
  tournament.id = source.id;
  tournament.displayLabel = source.displayLabel;
  tournament.startDate = source.startDate;

  for (const day of tournament.days) {
    const date = new Date(`${source.startDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + day.day - 1);
    day.date = date.toISOString().slice(0, 10);
  }

  return tournament;
}

const outputJson = resolve(ROOT, "data", "archives.json");
const outputJs = resolve(ROOT, "data", "archives.js");
let existing = { generatedAt: null, tournaments: [] };
try {
  existing = JSON.parse(await readFile(outputJson, "utf8"));
  if (!Array.isArray(existing.tournaments)) throw new Error("tournaments が配列ではありません");
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw new Error(`既存の archives.json を安全に読み込めません: ${error.message}`);
  }
}

const seeded = sources.map(normalizeTournament);
const seededIds = new Set(seeded.map((tournament) => tournament.id));
const archiveData = {
  generatedAt: new Date().toISOString(),
  tournaments: [
    ...seeded,
    ...existing.tournaments.filter((tournament) => !seededIds.has(tournament.id)),
  ].sort((a, b) => b.startDate.localeCompare(a.startDate)),
};
const serialized = JSON.stringify(archiveData, null, 2);

await mkdir(dirname(outputJson), { recursive: true });
await writeFile(outputJson, `${serialized}\n`, "utf8");
await writeFile(outputJs, `window.SUMO_DIGEST_ARCHIVES = ${serialized};\n`, "utf8");

for (const tournament of archiveData.tournaments) {
  const total = tournament.days.reduce((sum, day) => sum + day.videos.length, 0);
  console.log(`${tournament.displayLabel}: ${tournament.days.length}日分 / ${total}取組`);
}
