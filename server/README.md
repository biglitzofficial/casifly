# FinLedger API

Node.js + Express backend with SQLite.

## Setup

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
