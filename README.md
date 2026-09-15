# Casha — QR Digital Wallet Backend

Scan-to-pay wallet backend for the Nigerian market. Node.js + TypeScript + Express + MongoDB.

## Stack

- Express + TypeScript
- MongoDB / Mongoose
- JWT auth (access + refresh)
- Zod for request validation
- Pino for logging
- `qrcode` for QR image generation

## Project structure

```
src/
  config/        env, db connection, logger
  middlewares/   auth guard, validation, error handling
  modules/
    auth/        register, login, transaction PIN
    user/        User model
    wallet/      Wallet model + credit/debit primitives
    qr/          static & dynamic QR generation, resolution
    transaction/ QR payment execution, transaction history
  routes/        route aggregator
  app.ts         express app wiring
  server.ts      entry point
```

## Core domain model (v1)

- **User** — `consumer` or `merchant`, has one **Wallet**.
- **Wallet** — balance stored in kobo (integer) to avoid float rounding.
- **QrCode**
  - `static` — reusable, no fixed amount, owner enters nothing (payer enters amount at scan time). Meant for merchants ("storefront" QR).
  - `dynamic` — single-use, fixed amount, expires (`QR_DYNAMIC_TTL_SECONDS`). Meant for a specific bill/invoice, or a consumer requesting payment from a peer.
- **Transaction** — immutable record of a completed transfer between two wallets.

## QR payment flow

1. Payer scans a code → app calls `POST /qr/resolve` with the decoded string → gets back owner name/role + amount (if dynamic).
2. Payer confirms and calls `POST /transactions/pay` with the code, amount (required for static codes), and their 4-digit transaction PIN.
3. Server verifies the PIN, re-validates the QR, and atomically debits the payer / credits the recipient / records the transaction in a single Mongo session transaction. Dynamic codes are marked `used` afterward; static codes stay active for reuse.

**Important:** multi-document transactions require a replica-set-enabled MongoDB (MongoDB Atlas works out of the box; for local dev you need a single-node replica set — see below).

## Getting started

```bash
npm install
cp .env.example .env   # fill in real secrets before anything but local dev
npm run dev
```

### Local MongoDB with replica set (required for the payment transaction to work)

```bash
mongod --replSet rs0 --dbpath /path/to/data
# then, in a mongo shell:
rs.initiate()
```

Or just point `MONGO_URI` at a free MongoDB Atlas cluster — simplest for early development.

## API surface (v1)

| Method | Route | Auth | Notes |
|---|---|---|---|
| POST | `/api/v1/auth/register` | – | creates User + Wallet |
| POST | `/api/v1/auth/login` | – | returns access + refresh tokens |
| POST | `/api/v1/auth/pin` | ✓ | sets the 4-digit transaction PIN |
| GET | `/api/v1/wallets/me` | ✓ | current balance |
| POST | `/api/v1/wallets/mock-fund` | ✓ | dev-only top-up until a PSP is wired in |
| POST | `/api/v1/qr/static` | ✓ (merchant) | get/create the merchant's reusable QR |
| POST | `/api/v1/qr/dynamic` | ✓ | create a single-use, amount-fixed QR |
| POST | `/api/v1/qr/resolve` | ✓ | decode a scanned code before confirming payment |
| POST | `/api/v1/transactions/pay` | ✓ | execute a QR payment (requires PIN) |
| GET | `/api/v1/transactions` | ✓ | paginated transaction history |

## Not yet wired in (next decisions)

- Real money movement: which PSP/bank rail funds and withdraws from wallets (SafeHaven, Paystack, Providus, etc. — same question as Bucks/Riverly).
- OTP-based phone/email verification.
- Refresh token rotation + revocation store.
- KYC tiers and their transaction limits.
- Merchant settlement / payout flow.
