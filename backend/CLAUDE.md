# PumpFundMe Backend Service

## What This Is
Backend service for PumpFundMe — monitors Solana fees, maps to campaigns, transfers SOL, and automates GoFundMe donations.

## Current Task: Build Phase 1 — Fee Monitor

### Architecture
- Node.js/TypeScript service, runs as persistent process on Railway
- Shares Prisma schema with the frontend app (copy from `../app/prisma/schema.prisma`)
- Polls Solana RPC for transactions on the fee wallet

### How It Works
1. Poll `getSignaturesForAddress` on wallet `49GECbTo4z2FZx9s5XzYwxwQurALWGjsfR6wM5deKrVN` every ~30s
2. For each new transaction, parse to find the SOL amount received
3. Look up the SharingConfig from PumpFees program (`pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ`) to find the token mint
4. Match mint → `Token.mintAddress` in DB → find the Campaign
5. Record a `Transaction` (type: FEE_RECEIVED) and emit an `Event`
6. Track last processed signature to avoid reprocessing

### Key Details

#### SharingConfig Layout (PumpFees program)
```
Discriminator: [216, 74, 9, 0, 56, 140, 93, 75] (8 bytes)
bump:          u8   (1)  
version:       u8   (1)
status:        u8   (1)
mint:          Pubkey (32) ← offset 11
admin:         Pubkey (32) ← offset 43
admin_revoked: bool  (1)
shareholders:  Vec<Shareholder> ← offset 76
  count: u32 LE (4)
  each:  address(32) + share_bps(u16) = 34 bytes
```

#### Wallets
- **Fee wallet (shareholder in SharingConfig):** `49GECbTo4z2FZx9s5XzYwxwQurALWGjsfR6wM5deKrVN`
- **Kolo card wallet (SOL destination):** `vcKapasn5HfXpXvdxjBLqrR35rQLb1WrEKZrM3MZiKi`
- **Private key env var:** `DEPLOYER_PRIVATE_KEY`

#### Database (Neon PostgreSQL, shared with frontend)
- `DATABASE_URL` env var — same Neon connection string as frontend
- Prisma schema in `prisma/schema.prisma` (copy from `../app/prisma/`)
- Relevant models: Campaign, Token, Transaction, Event

#### Transaction Types (enum)
- `FEE_RECEIVED` — SOL fee arrived from pump.fun
- `SOL_TRANSFER` — SOL sent to Kolo card
- `DONATION` — USD donated on GoFundMe

### Project Structure
```
src/
├── index.ts          # Entry point, starts the monitor loop
├── fee-monitor.ts    # Core: poll, parse, map, record
├── config.ts         # Env vars, constants
├── db.ts             # Prisma client singleton
└── utils.ts          # Helpers (SharingConfig parser, etc.)
```

### Environment Variables
```
DATABASE_URL=postgresql://...          # Neon PostgreSQL  
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
DEPLOYER_PRIVATE_KEY=<base58>          # Fee wallet private key
PUMPFUNDME_FEE_WALLETS=49GECbTo4z2FZx9s5XzYwxwQurALWGjsfR6wM5deKrVN
KOLO_WALLET_ADDRESS=vcKapasn5HfXpXvdxjBLqrR35rQLb1WrEKZrM3MZiKi
POLL_INTERVAL_MS=30000
```

### Requirements
- Use `@solana/web3.js` for RPC calls
- Use `@prisma/client` for DB
- Use `bs58` for key decoding
- Handle RPC rate limits gracefully (exponential backoff)
- Log clearly to stdout (Railway captures logs)
- Include Dockerfile for Railway deployment
- DO NOT hardcode private keys — use env vars only

### When Done
Run: `openclaw system event --text "Done: PumpFundMe backend Phase 1 (fee monitor) built" --mode now`
