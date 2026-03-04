import { initFirestore, USE_FIRESTORE } from './firestore.js';
import { firestoreDb } from './db-firestore.js';

if (USE_FIRESTORE) {
  initFirestore();
}

// Only load SQLite when not using Firestore (avoids better-sqlite3 native build when using Firestore)
let _sqliteDb: Awaited<typeof import('./db-sqlite.js')>['sqliteDb'] | null = null;
let _rawDb: Awaited<typeof import('./db-sqlite.js')>['rawDb'] | null = null;

if (!USE_FIRESTORE) {
  const sqlite = await import('./db-sqlite.js');
  _sqliteDb = sqlite.sqliteDb;
  _rawDb = sqlite.rawDb;
}

export const db = USE_FIRESTORE ? firestoreDb : _sqliteDb!;
export const rawDb = _rawDb;
