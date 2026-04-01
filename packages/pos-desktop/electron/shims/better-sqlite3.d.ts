declare module 'better-sqlite3' {
  interface RunResult {
    changes?: number | bigint;
    lastInsertRowid?: number | bigint;
  }

  interface Statement {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): RunResult;
  }

  interface DatabaseInstance {
    close(): void;
    exec(sql: string): void;
    pragma(command: string): unknown;
    prepare(sql: string): Statement;
    transaction<T extends (...args: never[]) => unknown>(fn: T): T;
  }

  interface DatabaseConstructor {
    new (filename: string): DatabaseInstance;
  }

  const Database: DatabaseConstructor;

  namespace Database {
    export type Database = DatabaseInstance;
  }

  export default Database;
}
