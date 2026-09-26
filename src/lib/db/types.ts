export interface Db {
  /** Run one parameterized statement ($1, $2, ...) and return its rows. */
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Run one or more statements without parameters (used for migrations). */
  exec(text: string): Promise<void>;
  /** Run fn inside a transaction. Nested calls reuse the outer transaction. */
  transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R>;
}
