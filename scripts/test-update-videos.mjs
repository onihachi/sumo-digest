import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const outputDir = await mkdtemp(join(tmpdir(), "sumo-update-test-"));
process.env.SUMO_OUTPUT_DIR = outputDir;

const {
  existingArchives,
  preserveCompletedTournament,
  resolveStartDate,
  rolloverDirection,
  selectActiveTournament,
  tournamentIdentity,
} = await import(`./update-videos.mjs?test=${Date.now()}`);
const { validateData } = await import("./check-data.mjs");

function tournament(eraYear, basho, startDate, extra = {}) {
  return {
    label: `令和${eraYear}年 ${basho}場所`,
    eraYear,
    basho,
    startDate,
    days: [],
    ...extra,
  };
}

function archiveDays(startDate) {
  return Array.from({ length: 15 }, (_, index) => {
    const date = new Date(`${startDate}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return { day: index + 1, date: date.toISOString().slice(0, 10), complete: false, videos: [] };
  });
}

try {
  const kyushu = tournament(8, "九州", "2026-11-08");
  const autumn = tournament(8, "九月", "2099-01-01");
  const january = tournament(9, "一月", "2027-01-10");

  assert.equal(tournamentIdentity(autumn), "2026-09", "identity must not depend on mutable startDate");
  assert.equal(
    tournamentIdentity(selectActiveTournament([
      { info: autumn },
      { info: kyushu },
    ])),
    "2026-11",
    "stale uploads must not become the active tournament",
  );
  assert.equal(
    resolveStartDate({ tournament: kyushu }, { eraYear: 8, basho: "九州" }, "2026-11-09"),
    "2026-11-08",
    "a same-basho refresh must preserve the known corrected start date",
  );
  assert.equal(rolloverDirection({ tournament: kyushu }, { tournament: autumn }), "stale");
  assert.equal(rolloverDirection({ tournament: kyushu }, { tournament: january }), "forward");

  assert.deepEqual(await existingArchives(), { generatedAt: null, tournaments: [] });
  await writeFile(join(outputDir, "archives.json"), "{", "utf8");
  await assert.rejects(existingArchives(), /読み込めません/, "malformed JSON must fail closed");
  await writeFile(join(outputDir, "archives.json"), "{}\n", "utf8");
  await assert.rejects(existingArchives(), /形式が不正/, "invalid schema must fail closed");

  const presentEmpty = { generatedAt: "2026-11-17T00:00:00.000Z", tournaments: [] };
  const emptyBytes = `${JSON.stringify(presentEmpty)}\n`;
  await writeFile(join(outputDir, "archives.json"), emptyBytes, "utf8");
  await writeFile(join(outputDir, "archives.js"), "sentinel\n", "utf8");
  await assert.rejects(
    preserveCompletedTournament({ tournament: kyushu }, { tournament: january }),
    /場所データがありません/,
    "a present empty archive must be rejected rather than initialized",
  );
  assert.equal(await readFile(join(outputDir, "archives.json"), "utf8"), emptyBytes);
  assert.equal(await readFile(join(outputDir, "archives.js"), "utf8"), "sentinel\n");

  const initialArchives = {
    generatedAt: "2026-11-17T00:00:00.000Z",
    tournaments: [
      { ...tournament(8, "九月", "2026-09-13", { days: archiveDays("2026-09-13") }), id: "2026-09", displayLabel: "2026年 秋場所" },
      { ...tournament(8, "七月", "2026-07-12", { days: archiveDays("2026-07-12") }), id: "2026-07", displayLabel: "2026年 名古屋場所" },
      { ...tournament(8, "五月", "2026-05-10", { days: archiveDays("2026-05-10") }), id: "2026-05", displayLabel: "2026年 夏場所" },
    ],
  };
  await writeFile(join(outputDir, "archives.json"), `${JSON.stringify(initialArchives)}\n`, "utf8");

  assert.equal(
    await preserveCompletedTournament({ tournament: kyushu }, { tournament: january }),
    true,
    "a forward rollover must archive the completed tournament",
  );
  const afterForward = JSON.parse(await readFile(join(outputDir, "archives.json"), "utf8"));
  assert.deepEqual(
    afterForward.tournaments.map((item) => item.id),
    ["2026-11", "2026-09", "2026-07", "2026-05"],
    "rollover must retain existing archives and add the completed tournament exactly once",
  );
  assert.equal(afterForward.tournaments[0].days.length, 15, "missing days must be materialized in the snapshot");
  const januaryData = {
    generatedAt: "2027-01-10T12:00:00.000Z",
    tournament: {
      ...january,
      days: [{ day: 1, date: "2027-01-10", complete: false, videos: [] }],
    },
  };
  assert.deepEqual(
    validateData(januaryData, afterForward),
    [],
    "a generated rollover must pass the production validator",
  );
  const forwardBytes = await readFile(join(outputDir, "archives.json"), "utf8");
  assert.equal(
    await preserveCompletedTournament({ tournament: january }, { tournament: january }),
    false,
    "a same-tournament rerun must not rewrite archives",
  );
  assert.equal(await readFile(join(outputDir, "archives.json"), "utf8"), forwardBytes);

  await assert.rejects(
    preserveCompletedTournament({ tournament: kyushu }, { tournament: autumn }),
    /古いため更新を中止/,
    "a stale feed must be rejected",
  );
  assert.equal(
    await readFile(join(outputDir, "archives.json"), "utf8"),
    forwardBytes,
    "a stale feed must leave archives unchanged",
  );

  console.log("OK: 更新処理の場所判定・開始日維持・アーカイブ保全");
} finally {
  await rm(outputDir, { recursive: true, force: true });
}
