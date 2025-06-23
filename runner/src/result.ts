export type Result<T, E = Error> =
  | { ok: true; data: T }
  | { ok: false; error: E };

/**
 * A namespace of functions allowing us to more easily work with the `Result` type.
 */
export const Result = {
  /**
   * Create a new Result with a value.
   * @param value
   * @returns Result
   */
  ok: <T, E = Error>(data: T): Result<T, E> => ({ ok: true, data }),

  /**
   * Create a new Result with an error.
   * @param error
   * @returns Result
   */
  error: <T, E = Error>(error: E): Result<T, E> => ({ ok: false, error }),

  /**
   * Apply a function to the ok value of a result, returning a new result.
   */
  map: <T, E, New>(
    result: Result<T, E>,
    fn: (value: T) => New,
  ): Result<New, E> => {
    if (result.ok) {
      return Result.ok(fn(result.data));
    }
    return Result.error(result.error);
  },

  /**
   * Apply a function to the error of a result, if it's Err, returning a new result.
   */
  mapErr: <T, E, New>(
    result: Result<T, E>,
    fn: (error: E) => New,
  ): Result<T, New> => {
    if (result.ok) {
      return Result.ok(result.data);
    }
    return Result.error(fn(result.error));
  },

  /**
   * Throw a custom message if the Result is an Err, or return the value if it is an Ok.
   * @param message
   * @returns T
   * @throws Error
   */
  expect: <T, E>(result: Result<T, E>, message: string): T => {
    if (!result.ok) {
      throw new Error(message);
    }
    return result.data;
  },

  /**
   * Throw the error value if the Result is an Err, or return the value if it is an Ok.
   * @returns T
   * @throws E
   */
  unwrap: <T, E>(result: Result<T, E>): T => {
    if (!result.ok) {
      throw result.error;
    }
    return result.data;
  },

  /**
   * Returns the value if the Result is an Ok, or a default value if it is an Err.
   * @param defaultValue
   * @returns T
   */
  unwrapOr: <T, E>(result: Result<T, E>, defaultValue: T): T => {
    if (!result.ok) {
      return defaultValue;
    }
    return result.data;
  },

  /**
   * Try to execute a function and return a Result
   * @param func
   * @returns Result<T>
   */
  try: <T>(func: () => T): Result<T, Error> => {
    try {
      const result = func();
      return Result.ok(result);
    } catch (error) {
      return Result.error(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  },

  /**
   * Try to execute an asynchronous function and return a Result.
   * @param func
   * @returns Promise<Result<T>>
   */
  tryAsync: async <T>(func: () => Promise<T>): Promise<Result<T, Error>> => {
    try {
      const result = await func();
      return Result.ok(result);
    } catch (error) {
      return Result.error(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  },

  /**
   * Split a list of results of the same type into two lists, one containing the Ok values and one containing the Err values.
   */
  partition<T, E>(results: Result<T, E>[]): [T[], E[]] {
    const okValues: T[] = [];
    const errValues: E[] = [];

    for (const result of results) {
      if (result.ok) {
        okValues.push(result.data);
      } else {
        errValues.push(result.error);
      }
    }

    return [okValues, errValues];
  },

  /**
   * Flatten a nested result into a single result, provided they have the same error type.
   */
  flatten<T, E>(result: Result<Result<T, E>, E>): Result<T, E> {
    if (!result.ok) {
      return result;
    }

    return result.data;
  },

  /**
   * Add context to a result's error message.
   */
  context<T, E>(result: Result<T, E>, context: string): Result<T, Error> {
    if (result.ok) {
      return result;
    }

    const error = new Error(
      `${context}: ${result.error instanceof Error ? result.error.message : String(result.error)}`,
      { cause: result.error },
    );

    return Result.error(error);
  },
};

export class MultiError<E extends Error = Error> extends Error {
  public readonly errors: E[];

  constructor(errors: E[]) {
    super(
      `Multiple errors occurred: ${errors.map((error) => error.message).join(", ")}`,
    );
    this.name = "MultiError";
    this.errors = errors;
  }
}
