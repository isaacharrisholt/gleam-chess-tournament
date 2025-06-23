import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Chess, type Move as ChessJsMove, type Color } from "chess.js";
import entries from "../data/entries.json" with { type: "json" };
import { Result } from "./result";

const PORTS: Record<string, number> = {};
const MOVE_TIMEOUT = 5000;
const PGN_DIRECTORY = path.join(__dirname, "../data", "silversuite");
const RESULTS_DIRECTORY = path.join(__dirname, "../data", "results");
const MAX_ATTEMPTS_PER_TURN = 3;
const MAX_TIMEOUTS_PER_GAME = 15;

type Player = "white" | "black";
type Players = Record<Player, string>;

interface Move extends ChessJsMove {
  durationMs: number;
}

function colourToPlayer(colour: Color): Player {
  return colour === "w" ? "white" : "black";
}

function dockerImage(name: string) {
  return `chess-bot-2025:${name}`;
}

function dockerContainerName(name: string, player: Player) {
  return `${name}-${player}`;
}

async function dockerStart(name: string, player: Player) {
  const containerName = dockerContainerName(name, player);
  console.log(`Starting ${dockerImage(name)} as ${containerName}...`);
  await Bun.$`docker run -d --memory="512m" --cpus="2" --rm --name ${containerName} -p ${{ raw: PORTS[name]?.toString() ?? "" }}:8000 ${dockerImage(name)}`.quiet();
  console.log(`Started ${dockerImage(name)}`);
}

async function dockerStop(name: string, player: Player) {
  const containerName = dockerContainerName(name, player);
  console.log(`Stopping ${dockerImage(name)} as ${containerName}...`);
  await Bun.$`docker stop ${containerName}`.quiet();
  console.log(`Stopped ${dockerImage(name)}`);
}

async function dockerStartAll(players: Players) {
  await Promise.all(
    Object.entries(players).map(async ([player, name]) => {
      await dockerStart(name, player as Player);
    }),
  );
}

async function dockerStopAll(players: Players) {
  await Promise.all(
    Object.entries(players).map(async ([player, name]) => {
      await dockerStop(name, player as Player);
    }),
  );
}

async function downloadAndBuild() {
  await fs.mkdir("repos", { recursive: true });
  await Promise.all(
    entries.map(async (entry) => {
      const { name, repo } = entry;

      if (!(await fs.exists(path.join("repos", name)))) {
        console.log(`Downloading ${name}...`);
        await Bun.$`git clone ${repo} ${name}`.cwd("repos").quiet();
        console.log(`Downloaded ${name}`);
      }

      console.log(`Building image for ${name}...`);
      try {
        await Bun.$`docker build -t ${dockerImage(name)} .`
          .cwd(path.join("repos", name))
          .quiet();
      } catch (error) {
        console.error(`Failed to build image for ${name}:`, error);
        throw error;
      }
      console.log(`Built image for ${name}`);
    }),
  );
}

function permutations(array: string[]): [string, string][] {
  return array.reduce(
    (acc, v, i) =>
      acc.concat(array.slice(i + 1).map((w) => [v, w] as [string, string])),
    [] as [string, string][],
  );
}

async function listPgnFiles() {
  const files = await fs.readdir(PGN_DIRECTORY);
  return files.toSorted().map((file) => path.join(PGN_DIRECTORY, file));
}

async function getRoundRobinPgns() {
  return (await listPgnFiles()).slice(0, 31);
}

type InvalidResponseError = {
  type: "INVALID_RESPONSE";
  message: string;
  status: number;
};

type MoveError = { type: "TIMEOUT" } | { type: "INVALID_MOVE"; move: string };

type MoveResponse = {
  move: Move | null;
  player: Player;
  errors: MoveError[];
};

async function makeMove(
  chess: Chess,
  players: Players,
): Promise<Result<MoveResponse, InvalidResponseError>> {
  const player = colourToPlayer(chess.turn());
  const fen = chess.fen();

  let attempt = 0;
  const failedMoves: string[] = [];
  const errors: MoveError[] = [];

  while (attempt < MAX_ATTEMPTS_PER_TURN) {
    const startTime = performance.now();
    const responseResult = await Result.tryAsync(
      async () =>
        await fetch(`http://localhost:${PORTS[players[player]]}/move`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fen,
            turn: player,
            failed_moves: failedMoves,
          }),
          signal: AbortSignal.timeout(MOVE_TIMEOUT),
        }),
    );
    const durationMs = performance.now() - startTime;

    if (!responseResult.ok) {
      console.log(responseResult);
      errors.push({ type: "TIMEOUT" });
      attempt++;
      continue;
    }

    const response = responseResult.data;
    if (!response.ok) {
      return Result.error({
        type: "INVALID_RESPONSE",
        message: await response.text(),
        status: response.status,
      });
    }
    const move = await response.text();

    const moveResult = Result.try(() => chess.move(move));
    if (!moveResult.ok) {
      errors.push({
        type: "INVALID_MOVE",
        move,
      });
      failedMoves.push(move);
      attempt++;
      continue;
    }

    return Result.ok({
      player,
      move: {
        ...moveResult.data,
        durationMs,
      } as Move,
      errors,
    });
  }

  return Result.ok({ player, move: null, errors });
}

type GameOutcome = { pgn: string; durationMs: number; moves: ChessJsMove[] } & (
  | {
      type: "DRAW";
      reason:
        | "STALEMATE"
        | "INSUFFICIENT_MATERIAL"
        | "FIFTY_MOVES"
        | "THREEFOLD_REPETITION"
        | "OTHER";
    }
  | {
      type: "WIN";
      winner: string;
      reason:
        | "OPPONENT_TIMEOUT"
        | "OPPONENT_EXCEEDED_MAX_ATTEMPTS"
        | "CHECKMATE";
    }
);

async function saveResult(
  players: Players,
  outcome: GameOutcome,
  pgnPath: string,
) {
  const pgnNumber = pgnPath.split(path.sep).pop()?.split("-")[0] as string;
  await Bun.file(
    path.join(
      RESULTS_DIRECTORY,
      `${players.white}-${players.black}-${pgnNumber}.json`,
    ),
  ).write(JSON.stringify(outcome, null, 2));
}

async function gameLoop(
  players: Players,
  pgnPath: string,
): Promise<Result<GameOutcome>> {
  console.log(`Playing game between ${players.white} and ${players.black}...`);

  const pgn = await Bun.file(pgnPath).text();
  const chess = new Chess();
  chess.loadPgn(pgn, { strict: false });

  console.log("\nStarting position");
  console.log(chess.ascii());

  await new Promise((resolve) => setTimeout(resolve, 1000));

  let currentPlayer: Player = "white";
  const timeouts: Record<Player, number> = {
    white: 0,
    black: 0,
  };

  const startTime = performance.now();
  const moves: Move[] = [];

  while (!chess.isGameOver()) {
    currentPlayer = colourToPlayer(chess.turn());
    const otherPlayer = currentPlayer === "white" ? "black" : "white";
    const moveResult = await makeMove(chess, players);
    if (!moveResult.ok) {
      return Result.error(
        new Error(
          `Invalid response from ${players[currentPlayer]} as ${currentPlayer}: ${moveResult.error.status} ${moveResult.error.message}`,
        ),
      );
    }

    const { move, errors } = moveResult.data;

    if (!move) {
      return Result.ok({
        type: "WIN",
        winner: players[otherPlayer],
        reason: "OPPONENT_EXCEEDED_MAX_ATTEMPTS",
        pgn: chess.pgn(),
        moves,
        durationMs: performance.now() - startTime,
      });
    }

    const timeoutsOccurred = errors.filter((err) => err.type === "TIMEOUT");
    timeouts[currentPlayer] += timeoutsOccurred.length;

    if (timeouts[currentPlayer] >= MAX_TIMEOUTS_PER_GAME) {
      return Result.ok({
        type: "WIN",
        pgn: chess.pgn(),
        winner: players[otherPlayer],
        reason: "OPPONENT_TIMEOUT",
        moves,
        durationMs: performance.now() - startTime,
      });
    }

    moves.push(move);
    console.log(
      `\nMove ${move.san} by ${players[currentPlayer]} as ${currentPlayer}`,
    );
    console.log(chess.ascii());
  }

  const durationMs = performance.now() - startTime;
  const finalPgn = chess.pgn();

  if (chess.isDraw()) {
    if (chess.isStalemate()) {
      return Result.ok({
        type: "DRAW",
        reason: "STALEMATE",
        pgn: finalPgn,
        moves,
        durationMs,
      });
    }
    if (chess.isInsufficientMaterial()) {
      return Result.ok({
        type: "DRAW",
        reason: "INSUFFICIENT_MATERIAL",
        pgn: finalPgn,
        moves,
        durationMs,
      });
    }
    if (chess.isDrawByFiftyMoves()) {
      return Result.ok({
        type: "DRAW",
        reason: "FIFTY_MOVES",
        pgn: finalPgn,
        moves,
        durationMs,
      });
    }
    if (chess.isThreefoldRepetition()) {
      return Result.ok({
        type: "DRAW",
        reason: "THREEFOLD_REPETITION",
        pgn: finalPgn,
        moves,
        durationMs,
      });
    }
    return Result.ok({
      type: "DRAW",
      reason: "OTHER",
      pgn: finalPgn,
      moves,
      durationMs,
    });
  }

  if (chess.isCheckmate()) {
    return Result.ok({
      type: "WIN",
      winner: players[currentPlayer],
      reason: "CHECKMATE",
      pgn: finalPgn,
      moves,
      durationMs,
    });
  }

  return Result.error(new Error("unknown game state"));
}

async function playAndSaveGame(
  players: Players,
  pgnPath: string,
): Promise<Result<GameOutcome>> {
  await dockerStartAll(players);

  const gameResult = await gameLoop(players, pgnPath);
  if (!gameResult.ok) {
    return gameResult;
  }

  await saveResult(players, gameResult.data, pgnPath);

  await dockerStopAll(players);
  return Result.ok(gameResult.data);
}

function printOutcome(players: Players, gameOutcome: GameOutcome) {
  console.log("\n\n\n");
  console.log(
    `Game between ${players.white} as white and ${players.black} as black`,
  );
  console.log(`Game outcome: ${gameOutcome.type}`);
  if (gameOutcome.type === "WIN") {
    console.log(`Winner: ${gameOutcome.winner}`);
  }
  console.log(`Game duration: ${gameOutcome.durationMs} seconds`);
  console.log(`Total moves: ${gameOutcome.moves.length}`);
  console.log("\n\n\n");
}

async function playMatch(
  player1: string,
  player2: string,
  pgnPaths: string[],
): Promise<Result<null>> {
  // Play all games twice - once with each player as white and once as black
  // Games must be played sequentially

  for (const pgnPath of pgnPaths) {
    const game1Players = { white: player1, black: player2 };
    const game1Result = await playAndSaveGame(game1Players, pgnPath);

    if (!game1Result.ok) {
      return Result.error(
        new Error(
          `Game between ${player1} and ${player2} failed: ${game1Result.error.message}`,
        ),
      );
    }
    printOutcome(game1Players, game1Result.data);

    const game2Players = { white: player2, black: player1 };
    const game2Result = await playAndSaveGame(game2Players, pgnPath);

    if (!game2Result.ok) {
      return Result.error(
        new Error(
          `Game between ${player2} and ${player1} failed: ${game2Result.error.message}`,
        ),
      );
    }
    printOutcome(game2Players, game2Result.data);
  }
  return Result.ok(null);
}

function setupPorts() {
  let port = 8000;
  for (const { name } of entries) {
    PORTS[name] = port;
    port++;
  }
}

async function main() {
  try {
    await fs.rm(RESULTS_DIRECTORY, { recursive: true, force: true });
  } catch {}
  await fs.mkdir(RESULTS_DIRECTORY, { recursive: true });

  console.log("Downloading repositories and building images...");
  await downloadAndBuild();
  setupPorts();

  console.log("Calculating game pairs...");
  const pairs = permutations(entries.map((e) => e.name));
  console.log(pairs.length);

  // Each container gets 2 CPUs. Calculate the maximum number of pairs of
  // containers we can run simultaneously while still having 2 CPUs left.
  const pairsPerGroup = Math.floor((os.cpus().length - 2) / 4);

  // Create groups of games from pairs where the same player can't be in
  // the same group twice
  const groups: [string, string][][] = [];
  for (const pair of pairs) {
    const availableGroup = groups.find((group) => {
      return (
        group.length < pairsPerGroup &&
        !group.some((p) => pair.includes(p[0]) || pair.includes(p[1]))
      );
    });

    if (!availableGroup) {
      groups.push([pair]);
    } else {
      availableGroup.push(pair);
    }
  }

  console.log("Fetching starting positions...");
  const startingPositions = await getRoundRobinPgns();

  for (const group of groups) {
    await Promise.all(
      group.map(async ([player1, player2]) => {
        console.log(
          `\n\n\nSTARTING MATCH BETWEEN ${player1} AND ${player2}\n\n\n`,
        );
        const matchResult = await playMatch(
          player1,
          player2,
          startingPositions,
        );
        if (!matchResult.ok) {
          console.error(matchResult.error.message);
          process.exit(1);
        }
        console.log(
          `\n\n\nFINISHED MATCH BETWEEN ${player1} AND ${player2}\n\n\n`,
        );
      }),
    );
  }
}

await main();
