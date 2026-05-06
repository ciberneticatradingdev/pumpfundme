<p align="center">
  <img src="public/banner.jpg" alt="PumpFundMe Banner" width="100%" />
</p>

<p align="center">
  <img src="public/logo.jpg" alt="PumpFundMe Logo" width="120" />
</p>

<h1 align="center">PumpFundMe</h1>

<p align="center">
  <strong>Turn memecoins into real-world donations — 0% commission, fully transparent.</strong>
</p>

<p align="center">
  <a href="https://pumpfundme.org">Website</a> •
  <a href="https://pumpfundme.org/terminal">Live Terminal</a> •
  <a href="https://x.com/PumpFundMe">Twitter</a>
</p>

---

## What is PumpFundMe?

PumpFundMe bridges pump.fun creator fees to real-world GoFundMe campaigns. Anyone can create a campaign, launch a token, and have every SOL earned from trading fees automatically collected and converted into donations — with zero commission.

Pump.fun recently introduced charity support through [donate.gg](https://donate.gg), but it only covers verified nonprofit organizations. Smaller, equally deserving causes — medical bills, disaster relief, community projects — are left out.

**PumpFundMe fills that gap.**

## How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   1. Create campaign    →  Link a GoFundMe page on PumpFundMe       │
│   2. Launch token       →  Deploy on pump.fun, set our wallet       │
│                            as 100% fee receiver                     │
│   3. Fees auto-claimed  →  SOL collected every 5 minutes            │
│   4. SOL → USDT         →  Swapped via Jupiter on-chain             │
│   5. USDT → Fiat        →  Transferred to crypto card               │
│   6. Fiat → GoFundMe    →  Donated to the campaign                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### On-Chain Verification (3 checks)

When a token is registered to a campaign, we verify on-chain:

1. **Deployer check** — Your connected wallet must be the token deployer
2. **Fee recipient check** — The token's `SharingConfig` must have our wallet as shareholder
3. **Duplicate check** — Same deployer can't register the same token twice

No trust required. Everything is verifiable on Solana.

## The Challenges

Building this is harder than it sounds. Here's what we're solving:

### 💳 GoFundMe Has No API

GoFundMe doesn't offer any programmatic way to donate. There's no API, no webhook, no integration. This means the final step — converting USDT to fiat and donating — requires manual execution. We're transparent about this: the entire pipeline from fee collection to USDT conversion is fully automated and on-chain, but the GoFundMe donation itself is recorded manually with proof.

### 🔐 Fee Claiming Mechanics

Pump.fun's creator fee system uses `SharingConfig` accounts in the PumpFees program. Users set our wallet as 100% fee receiver, and we call `distribute_creator_fees` to move SOL from creator vaults directly to our wallet. This required reverse-engineering the on-chain account layouts — discriminators, shareholder structs, vault PDAs — since none of this is publicly documented.

### 💱 SOL → Fiat Pipeline

Collected SOL needs to become dollars on GoFundMe. The pipeline:
- **SOL → USDT** via Jupiter swaps (on-chain, verifiable)
- **USDT → Crypto card** via SPL transfer (on-chain, verifiable)
- **Card → GoFundMe** manual donation (recorded with receipts)

Every automated step is tracked in our database and visible in the [live terminal](https://pumpfundme.org/terminal).

### 📊 Multi-Campaign Accounting

One wallet serves all campaigns. When fees come in, we need to attribute them to the correct campaign based on which token generated them. Each token is mapped to a campaign, and every transaction is tracked per-campaign — not per-wallet.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│   Next.js    │────▶│  PostgreSQL  │
│   (Vercel)   │     │   API Routes │     │   (Neon)     │
└─────────────┘     └──────────────┘     └──────────────┘
                           │
                           ▼
                    ┌──────────────┐     ┌──────────────┐
                    │   Backend    │────▶│   Solana      │
                    │  (Railway)   │     │   Mainnet     │
                    └──────────────┘     └──────────────┘
                      │         │
                      ▼         ▼
               ┌──────────┐ ┌──────────┐
               │ Jupiter  │ │ Pump.fun │
               │  Swaps   │ │  Fees    │
               └──────────┘ └──────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), Tailwind CSS, shadcn/ui |
| Auth | Solana Wallet Adapter (Phantom, Solflare, etc.) |
| Database | PostgreSQL (Neon) with Prisma 6 |
| Backend | Node.js on Railway |
| Blockchain | Solana mainnet, Jupiter v6, Pump.fun programs |
| Hosting | Vercel (frontend) + Railway (backend) |

### Key Components

| Component | Description |
|-----------|-------------|
| `fee-claimer.ts` | Auto-claims creator fees via `distribute_creator_fees` every 5 min |
| `jupiter-swap.ts` | Swaps SOL → USDT through Jupiter aggregator |
| `kolo-transfer.ts` | Transfers USDT to crypto card wallet |
| `pipeline.ts` | Orchestrates the full claim → swap → transfer pipeline |
| `fee-monitor.ts` | Reads on-chain vault balances and SharingConfig accounts |
| `verify-fee-recipient.ts` | On-chain verification of token fee configuration |
| `verify-deployer.ts` | On-chain verification of token deployer |

## Transparency

Every step of the pipeline is tracked:

- **Fee claims** — On-chain transactions, visible on Solscan
- **Jupiter swaps** — On-chain transactions with exact amounts
- **USDT transfers** — On-chain SPL token transfers
- **GoFundMe donations** — Manually recorded with receipts in the dashboard

The [live terminal](https://pumpfundme.org/terminal) shows every event in real-time via SSE.

## Development

### Prerequisites

- Node.js 18+
- PostgreSQL (or Neon account)
- Solana RPC endpoint

### Frontend

```bash
npm install
npm run dev
```

### Backend

```bash
cd backend
npm install
npm run dev
```

### Environment Variables

**Frontend (Vercel):**
```env
DATABASE_URL=postgresql://...
NEXT_PUBLIC_PUMPFUNDME_FEE_WALLET=<fee-receiver-wallet>
ADMIN_WALLETS=<comma-separated-admin-wallets>
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
BACKEND_URL=<railway-backend-url>
```

**Backend (Railway):**
```env
DATABASE_URL=postgresql://...
DEPLOYER_PRIVATE_KEY=<base58-private-key>
PUMPFUNDME_FEE_WALLETS=<fee-receiver-wallet>
SOLANA_RPC_URL=<rpc-url>
KOLO_WALLET=<crypto-card-wallet>
SWAP_THRESHOLD_SOL=0.05
```

## Roadmap

- [x] Campaign creation & token registration
- [x] On-chain fee verification (3 checks)
- [x] Automated fee claiming (every 5 min)
- [x] SOL → USDT swaps via Jupiter
- [x] USDT → crypto card transfers
- [x] Live terminal (SSE real-time events)
- [x] Admin dashboard with pipeline status
- [x] Manual donation recording with proof
- [ ] Landing page live stats from on-chain data
- [ ] Automated GoFundMe donation flow
- [ ] Multi-wallet support
- [ ] Campaign verification badges

## License

MIT

---

<p align="center">
  <strong>0% commission. 100% transparent. Every SOL goes to the cause.</strong>
</p>
