
let _dbInstance: import('./database').LocalDatabaseService | null = null;

export function getDatabaseService(): import('./database').LocalDatabaseService {
  if (!_dbInstance) {
    throw new Error('DatabaseService henüz başlatılmadı. initDatabaseService() çağrılmamış.');
  }
  return _dbInstance;
}

export function initDatabaseService(
  ...args: ConstructorParameters<typeof import('./database').LocalDatabaseService>
): import('./database').LocalDatabaseService {
  const { LocalDatabaseService } = require('./database') as typeof import('./database');
  _dbInstance = new LocalDatabaseService(...args);
  return _dbInstance;
}
