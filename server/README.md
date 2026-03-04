# FinLedger API

Node.js + Express backend with **Firestore** (default) or **SQLite**.

## Firestore Setup

1. **Create Firebase project**  
   Go to [Firebase Console](https://console.firebase.google.com/) → Your Project → Project Settings → Service Accounts.

2. **Generate service account key**  
   Click "Generate new private key" and save the JSON file.

3. **Add credentials**
   - Copy the JSON file to the `server` folder, or
   - Set env vars in `server/.env`:
     ```
     USE_FIRESTORE=true
     GOOGLE_APPLICATION_CREDENTIALS=./your-firebase-adminsdk-xxxxx.json
     ```
     Or for serverless, set `FIREBASE_SERVICE_ACCOUNT` to the full JSON string.

4. **Seed Firestore**
   ```bash
   cd server
   npm install
   npm run seed:firestore   # Creates master admin + initial data
   npm run dev              # Start on port 3001
   ```

## SQLite Setup

Set `USE_FIRESTORE=false` and run:

```bash
cd server
npm install
npm run seed   # Seed master admin + initial accounts
npm run dev    # Start on port 3001
```

## API

- `POST /api/auth/login` - { email, password } → { token, user }
- `GET /api/auth/me` - Bearer token required
- `GET/POST/PUT/DELETE /api/products` - Master Admin only
- `GET/POST/PUT/DELETE /api/products/:id/users` - Master Admin only
- `GET /api/erp/accounts`
- `GET/POST/PUT/DELETE /api/erp/customers`
- `GET/POST /api/erp/wallets`
- `GET/POST /api/erp/transactions`
- `GET /api/erp/balance/:accountId`

## Default credentials

- **Master Admin:** admin@finledger.com / Admin@123

## Frontend

Create `.env` in project root:

```
VITE_USE_API=true
VITE_API_URL=http://localhost:3001/api
```

Run full stack: `npm run dev:full` (from project root)
