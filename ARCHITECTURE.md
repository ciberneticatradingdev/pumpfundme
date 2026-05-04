# PumpFundMe — Architecture

## Stack
- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS + shadcn/ui
- **DB:** PostgreSQL (Prisma ORM)
- **Real-time:** Server-Sent Events (SSE) for live terminal feed
- **Solana:** @solana/web3.js for on-chain monitoring
- **Browser Automation:** Playwright (GoFundMe donations)
- **Runtime:** Node.js 22+
- **Deploy:** TBD (Railway probable)

## Pages

### Landing (`/`)
- Hero: PumpFundMe logo + tagline
- How it works (3 steps)
- Live stats (total raised, campaigns active, donations made)
- Create campaign CTA

### Dashboard (`/dashboard`)
- Campaign list with stats (SOL received, donated, pending)
- Create new campaign form
- Campaign detail view

### Terminal (`/terminal`)
- Real-time feed of ALL system events:
  - Incoming fees detected (token, amount, campaign)
  - SOL → Kolo card transfers
  - GoFundMe donations executed
  - Campaign registrations
  - Errors/retries
- Filterable by campaign
- Public for full transparency

### Campaign Page (`/campaign/[id]`)
- Campaign info + GoFundMe link
- Associated tokens
- SOL raised / donated
- Live activity feed (filtered terminal)

## Backend Services

### 1. Chain Monitor (`/api/services/monitor`)
- Polls/subscribes to deployer wallet for incoming SOL
- Identifies source token from transaction data
- Maps token → campaign via DB
- Logs event to terminal feed
- Triggers conversion pipeline

### 2. Conversion Pipeline (`/api/services/convert`)
- Takes SOL from deployer wallet
- Sends to Kolo card address: `vcKapasn5HfXpXvdxjBLqrR35rQLb1WrEKZrM3MZiKi`
- Records transfer in DB
- Triggers donation bot

### 3. Donation Bot (`/api/services/donate`)
- Playwright browser automation
- Navigates to GoFundMe donate page
- Fills amount, payment method (Kolo card)
- Executes donation
- Screenshots for proof
- Records in DB + terminal feed

### 4. Event Bus
- SSE endpoint (`/api/events`)
- All services publish events here
- Terminal page subscribes
- Events stored in DB for history

## Database Schema (Prisma)

### Campaign
- id, name, description, goFundMeUrl
- status (active/paused/completed)
- totalSolReceived, totalDonated
- createdAt, updatedAt

### Token
- id, mintAddress, campaignId (FK)
- deployerWallet (the user's wallet)
- createdAt

### Transaction
- id, type (fee_received/sol_transfer/donation)
- campaignId (FK), tokenId (FK nullable)
- amount, txSignature
- status (pending/confirmed/failed)
- metadata (JSON — GoFundMe receipt, screenshot URL, etc.)
- createdAt

### Event
- id, type, campaignId (FK nullable)
- message, data (JSON)
- createdAt

## Security
- Private key: env var only (DEPLOYER_PRIVATE_KEY)
- Kolo address: env var (KOLO_WALLET_ADDRESS)
- No private keys in code or DB
- GoFundMe card details: env vars

## Test Credentials (dev only)
- GitHub: ciberneticatradingdev
- Deployer wallet: vcKapasn5HfXpXvdxjBLqrR35rQLb1WrEKZrM3MZiKi
