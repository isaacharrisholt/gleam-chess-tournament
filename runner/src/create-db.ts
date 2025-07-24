import { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { RESULTS_DIRECTORY } from "./config";
import type { GameOutcome } from "./game";

const DB_PATH = path.join(RESULTS_DIRECTORY, "results.db");

function createTables(db: Database) {
  db.query(`
create table if not exists game (
  id integer primary key autoincrement,
  white_player text not null,
  black_player text not null,
  opening integer not null,
  outcome text not null,
  outcome_reason text not null,
  winner text,
  opponent_error text,
  duration_ms real not null
);
  `).run();

  db.query(`
create table if not exists move (
  id integer primary key autoincrement,
  game_id integer not null,
  move_number integer not null,
  colour text not null,
  player text not null,
  from_square text not null,
  to_square text not null,
  san text not null,
  duration_ms real not null,
  foreign key (game_id) references game(id)
);
  `).run();
}

async function getAllGameOutcomes() {
  const outcomes: { outcome: GameOutcome; opening: number }[] = [];

  for (const dirent of await fs.readdir(RESULTS_DIRECTORY, {
    recursive: true,
    withFileTypes: true,
  })) {
    const file = dirent.name;

    if (!file.endsWith(".json")) {
      continue;
    }

    const fullPath = path.join(dirent.parentPath, file);

    const openingNumberString = file.match(/-(\d+)\./)?.[1];
    if (!openingNumberString) {
      throw new Error(`Invalid file name: ${file}`);
    }
    const openingNumber = Number.parseInt(openingNumberString);
    const outcome = (await Bun.file(fullPath).json()) as GameOutcome;
    outcomes.push({ outcome, opening: openingNumber });
  }

  return outcomes;
}

function saveToDb(
  db: Database,
  { outcome, opening }: { outcome: GameOutcome; opening: number },
) {
  const gameInsert = db
    .query(`
insert into game (
  white_player,
  black_player,
  opening,
  outcome,
  outcome_reason,
  winner,
  opponent_error,
  duration_ms
)
values (
  $white_player,
  $black_player,
  $opening,
  $outcome,
  $outcome_reason,
  $winner,
  $opponent_error,
  $duration_ms
)
returning id
    `)
    .all({
      white_player: outcome.players.white,
      black_player: outcome.players.black,
      opening,
      outcome: outcome.type,
      outcome_reason: outcome.reason,
      winner: outcome.type === "WIN" ? outcome.winner : null,
      opponent_error:
        outcome.reason === "OPPONENT_EXCEEDED_MAX_ATTEMPTS"
          ? (outcome.opponentErrors[outcome.opponentErrors.length - 1]?.type ??
            null)
          : null,
      duration_ms: outcome.durationMs,
    });

  const game = (gameInsert[0] as { id: number }).id;

  for (const [idx, move] of outcome.moves.entries()) {
    db.query(`
insert into move (
  game_id,
  move_number,
  colour,
  player,
  from_square,
  to_square,
  san,
  duration_ms
)
values (
  $game_id,
  $move_number,
  $colour,
  $player,
  $from_square,
  $to_square,
  $san,
  $duration_ms
)
    `).run({
      game_id: game,
      move_number: idx + 1,
      colour: move.color === "w" ? "white" : "black",
      player:
        move.color === "w" ? outcome.players.white : outcome.players.black,
      from_square: move.from,
      to_square: move.to,
      san: move.san,
      duration_ms: move.durationMs,
    });
  }
}

async function main() {
  const dbFile = Bun.file(DB_PATH);
  if (await dbFile.exists()) {
    await Bun.file(DB_PATH).unlink();
  }
  const db = new Database(DB_PATH, { create: true, strict: true });

  createTables(db);
  const gameOutcomes = await getAllGameOutcomes();

  for (const outcome of gameOutcomes) {
    saveToDb(db, outcome);
  }
}

await main();
