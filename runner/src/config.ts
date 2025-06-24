import * as path from "node:path";

export const DATA_DIRECTORY = path.join(__dirname, "../data");
export const PGN_DIRECTORY = path.join(DATA_DIRECTORY, "silversuite");
export const RESULTS_DIRECTORY = path.join(DATA_DIRECTORY, "results");
export const ROUND_ROBIN_RESULTS_DIRECTORY = path.join(
  RESULTS_DIRECTORY,
  "round-robin",
);
export const THIRD_PLACE_RESULTS_DIRECTORY = path.join(
  RESULTS_DIRECTORY,
  "third-place",
);
export const FINALS_RESULTS_DIRECTORY = path.join(RESULTS_DIRECTORY, "finals");

export const MOVE_TIMEOUT = 5000;
export const MAX_ATTEMPTS_PER_TURN = 3;
export const MAX_TIMEOUTS_PER_GAME = 15;
export const ROUND_ROBIN_STARTING_POSITIONS = 11;
export const NUM_FINALS_GAMES = 10;

export const POINTS_PER_WIN = 1;
export const POINTS_PER_DRAW = 0.5;
export const POINTS_PER_LOSS = 0;
