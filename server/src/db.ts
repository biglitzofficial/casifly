import { initFirestore, USE_FIRESTORE } from './firestore.js';
import { sqliteDb, rawDb } from './db-sqlite.js';
import { firestoreDb } from './db-firestore.js';

if (USE_FIRESTORE) {
  initFirestore();
}

export const db = USE_FIRESTORE ? firestoreDb : sqliteDb;
export { rawDb };
