import admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USE_FIRESTORE = process.env.USE_FIRESTORE !== 'false' && process.env.USE_FIRESTORE !== '0';
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'casifly-14574';

// Default: look for service account JSON in server folder (*-firebase-adminsdk-*.json)
const SERVER_DIR = path.join(__dirname, '..');
const defaultCredsFile = () => {
  try {
    const files = fs.readdirSync(SERVER_DIR);
    const match = files.find((f) => f.endsWith('.json') && f.includes('firebase-adminsdk'));
    return match ? path.join(SERVER_DIR, match) : null;
  } catch {
    return null;
  }
};

let firestore: admin.firestore.Firestore | null = null;

export function initFirestore(): admin.firestore.Firestore | null {
  if (!USE_FIRESTORE) return null;
  if (firestore) return firestore;

  try {
    const credsJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    let credsPath: string | null | undefined = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credsPath) credsPath = defaultCredsFile();

    if (credsJson) {
      const creds = JSON.parse(credsJson);
      admin.initializeApp({
        credential: admin.credential.cert(creds),
        projectId: creds.project_id || PROJECT_ID,
      });
    } else if (credsPath && fs.existsSync(credsPath)) {
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
      admin.initializeApp({
        credential: admin.credential.cert(creds),
        projectId: creds.project_id || PROJECT_ID,
      });
    } else {
      console.warn('Firestore: No credentials. Set FIREBASE_SERVICE_ACCOUNT (JSON string) or GOOGLE_APPLICATION_CREDENTIALS (path to JSON file).');
      return null;
    }

    firestore = admin.firestore();
    console.log('Firestore connected:', PROJECT_ID);
    return firestore;
  } catch (err) {
    console.error('Firestore init failed:', err);
    return null;
  }
}

export function getFirestore(): admin.firestore.Firestore | null {
  if (!firestore && USE_FIRESTORE) initFirestore();
  return firestore;
}

export { USE_FIRESTORE };
