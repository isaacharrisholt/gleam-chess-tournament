import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  DATA_DIRECTORY,
  FINALS_RESULTS_DIRECTORY,
  POINTS_PER_DRAW,
  POINTS_PER_LOSS,
  POINTS_PER_WIN,
  ROUND_ROBIN_RESULTS_DIRECTORY,
  THIRD_PLACE_RESULTS_DIRECTORY,
} from "./config";
import type { GameOutcome } from "./game";

async function getGameOutcomes(dir: string): Promise<GameOutcome[]> {
  const outcomes: GameOutcome[] = [];

  for (const file of await fs.readdir(dir)) {
    const outcome = (await Bun.file(
      path.join(dir, file),
    ).json()) as GameOutcome;
    outcomes.push(outcome);
  }

  return outcomes;
}

async function saveToCsv<T extends object>(
  objects: T[],
  filePath: string,
): Promise<void> {
  if (!objects[0]) {
    throw new Error("No objects provided");
  }
  const headers = Object.keys(objects[0]);
  const rows = objects.map((obj) =>
    headers.map((header) => obj[header as keyof typeof obj]).join(","),
  );
  const content = [headers.join(","), ...rows].join("\n");
  await Bun.file(filePath).write(content);
}

type PointTotals = {
  bot: string;
  wins: number;
  draws: number;
  losses: number;
  points: number;
};

function calculatePoints(outcomes: GameOutcome[]): Array<PointTotals> {
  const totals: Record<string, PointTotals> = {};

  for (const outcome of outcomes) {
    const white = outcome.players.white;
    const black = outcome.players.black;

    if (!totals[white]) {
      totals[white] = {
        bot: white,
        wins: 0,
        draws: 0,
        losses: 0,
        points: 0,
      };
    }

    if (!totals[black]) {
      totals[black] = {
        bot: black,
        wins: 0,
        draws: 0,
        losses: 0,
        points: 0,
      };
    }

    if (outcome.type === "WIN") {
      if (outcome.winner === white) {
        totals[white].wins += 1;
        totals[white].points += POINTS_PER_WIN;

        totals[black].losses += 1;
        totals[black].points += POINTS_PER_LOSS;
      } else {
        totals[black].wins += 1;
        totals[black].points += POINTS_PER_WIN;

        totals[white].losses += 1;
        totals[white].points += POINTS_PER_LOSS;
      }
    } else {
      // Draw
      totals[white].draws += 1;
      totals[white].points += POINTS_PER_DRAW;

      totals[black].draws += 1;
      totals[black].points += POINTS_PER_DRAW;
    }
  }

  return Object.values(totals).toSorted((a, b) => b.points - a.points);
}

async function main() {
  const rrOutcomes = await getGameOutcomes(ROUND_ROBIN_RESULTS_DIRECTORY);
  const rrTotals = calculatePoints(rrOutcomes);
  await saveToCsv(
    rrTotals,
    path.join(DATA_DIRECTORY, "round-robin-results.csv"),
  );

  const thirdPlaceOutcomes = await getGameOutcomes(
    THIRD_PLACE_RESULTS_DIRECTORY,
  );
  const thirdPlaceTotals = calculatePoints(thirdPlaceOutcomes);
  await saveToCsv(
    thirdPlaceTotals,
    path.join(DATA_DIRECTORY, "third-place-results.csv"),
  );

  const finalsOutcomes = await getGameOutcomes(FINALS_RESULTS_DIRECTORY);
  const finalsTotals = calculatePoints(finalsOutcomes);
  await saveToCsv(
    finalsTotals,
    path.join(DATA_DIRECTORY, "finals-results.csv"),
  );
}

await main();
