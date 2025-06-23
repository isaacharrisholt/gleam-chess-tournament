import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Chess, type Color } from "chess.js";
import entries from "../data/entries.json" with { type: "json" };
import { Result } from "./result";

const PORTS: Record<Player, number> = {
  white: 8000,
  black: 8001,
};
const MOVE_TIMEOUT = 5000;
const PGN_DIRECTORY = path.join(__dirname, "../data", "silversuite");
const MAX_ATTEMPTS_PER_TURN = 3;
const MAX_TIMEOUTS_PER_GAME = 15;

type Player = "white" | "black";
type Players = Record<Player, string>;

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
  await Bun.$`docker run -d --memory="512m" --cpus="2" --rm --name ${containerName} -p ${{ raw: PORTS[player].toString() }}:8000 ${dockerImage(name)}`.quiet();
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

type InvalidResponseError = {
  type: "INVALID_RESPONSE";
  message: string;
  status: number;
};

type MoveError = { type: "TIMEOUT" } | { type: "INVALID_MOVE"; move: string };

type MoveResponse = {
  move: string | null;
  player: Player;
  errors: MoveError[];
};

async function makeMove(
  chess: Chess,
): Promise<Result<MoveResponse, InvalidResponseError>> {
  const player = colourToPlayer(chess.turn());
  const fen = chess.fen();

  let attempt = 0;
  const failedMoves: string[] = [];
  const errors: MoveError[] = [];

  while (attempt < MAX_ATTEMPTS_PER_TURN) {
    const responseResult = await Result.tryAsync(
      async () =>
        await fetch(`http://localhost:${PORTS[player]}/move`, {
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

    return Result.ok({ player, move, errors });
  }

  return Result.ok({ player, move: null, errors });
}

async function playGame(
  players: Players,
  pgnPath: string,
): Promise<
  Result<
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
        reason: "OPPONENT_TIMEOUT" | "CHECKMATE";
      }
  >
> {
  const pgn = await Bun.file(pgnPath).text();
  const chess = new Chess();
  chess.loadPgn(pgn, { strict: false });

  console.log("\nStarting position");
  console.log(chess.ascii());

  await dockerStartAll(players);

  await new Promise((resolve) => setTimeout(resolve, 1000));

  let currentPlayer: Player = "white";
  const timeouts: Record<Player, number> = {
    white: 0,
    black: 0,
  };

  while (!chess.isGameOver()) {
    currentPlayer = colourToPlayer(chess.turn());
    const otherPlayer = currentPlayer === "white" ? "black" : "white";
    const moveResult = await makeMove(chess);
    if (!moveResult.ok) {
      return Result.error(
        new Error(
          `Invalid response from ${players[currentPlayer]} as ${currentPlayer}: ${moveResult.error.status} ${moveResult.error.message}`,
        ),
      );
    }

    const { move, errors } = moveResult.data;

    const timeoutsOccurred = errors.filter((err) => err.type === "TIMEOUT");
    timeouts[currentPlayer] += timeoutsOccurred.length;

    if (timeouts[currentPlayer] >= MAX_TIMEOUTS_PER_GAME) {
      return Result.ok({
        type: "WIN",
        winner: players[otherPlayer],
        reason: "OPPONENT_TIMEOUT",
      });
    }

    console.log(
      `\nMove ${move} by ${players[currentPlayer]} as ${currentPlayer}`,
    );
    console.log(chess.ascii());
  }

  await dockerStopAll(players);

  if (chess.isDraw()) {
    if (chess.isStalemate()) {
      return Result.ok({
        type: "DRAW",
        reason: "STALEMATE",
      });
    }
    if (chess.isInsufficientMaterial()) {
      return Result.ok({
        type: "DRAW",
        reason: "INSUFFICIENT_MATERIAL",
      });
    }
    if (chess.isDrawByFiftyMoves()) {
      return Result.ok({
        type: "DRAW",
        reason: "FIFTY_MOVES",
      });
    }
    if (chess.isThreefoldRepetition()) {
      return Result.ok({
        type: "DRAW",
        reason: "THREEFOLD_REPETITION",
      });
    }
    return Result.ok({
      type: "DRAW",
      reason: "OTHER",
    });
  }

  if (chess.isCheckmate()) {
    return Result.ok({
      type: "WIN",
      winner: players[currentPlayer],
      reason: "CHECKMATE",
    });
  }

  return Result.error(new Error("unknown game state"));
}

async function main() {
  console.log("Downloading repositories and building images...");
  await downloadAndBuild();

  console.log("Calculating game pairs...");
  const _pairs = permutations(entries.map((e) => e.name));

  console.log("Fetching starting positions...");
  const startingPositions = await listPgnFiles();

  const [white, black] = ["girlchesser", "girlchesser"];
  console.log(`Playing game between ${white} and ${black}...`);
  const gameResult = await playGame(
    { white, black },
    startingPositions[0] as string,
  );

  if (!gameResult.ok) {
    console.error(
      `Game between ${white} and ${black} failed: ${gameResult.error.message}`,
    );
    process.exit(1);
  }

  const outcome = gameResult.data;
  if (outcome.type === "WIN") {
    console.log(
      `Game between ${white} and ${black} won by ${outcome.winner} for reason ${outcome.reason}`,
    );
  } else if (outcome.type === "DRAW") {
    console.log(
      `Game between ${white} and ${black} ended in a draw for reason ${outcome.reason}`,
    );
  }
}

await main();
