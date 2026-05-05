# PumpFundMe — Frontend + Backend Cleanup for Semi-Manual Donation Flow

## Context
GoFundMe automation was ABANDONED (enterprise anti-bot). The pipeline now works:
claim fees → swap SOL→USDT (Jupiter) → transfer USDT to Kolo card wallet.
Donations to GoFundMe are done MANUALLY by the owner. We need the app to reflect this.

## BACKEND CHANGES (in backend/src/)

### 1. Remove GoFundMe automation:
- Delete `gofundme-donor.ts` and `captcha-solver.ts` (dead code)
- Remove `donation-pipeline.ts` (the auto-donation logic)
- In `index.ts`: remove `startDonationPipeline` import/call, remove `/api/donations/trigger` and `/api/donations/process` endpoints
- In `config.ts`: remove koloCard*, headlessBrowser, twoCaptchaApiKey, donationIntervalMs, donationMinUsd configs
- Keep `/api/donations/pending` and `/api/donations/history` endpoints (still useful)

### 2. Add manual donation recording endpoint:
- `POST /api/donations/record` — body: `{ campaignId, amountUsd, receiptUrl?, notes? }`
- Creates a DONATION transaction with status CONFIRMED
- Updates `campaign.totalDonatedUsd`
- Returns the created transaction
- This is for the owner to record after manually donating on GoFundMe

### 3. Add notification endpoint:
- `GET /api/notifications/ready` — returns campaigns that have USDT_TRANSFER confirmed but no corresponding DONATION yet
- Shows how much is available to donate per campaign
- Simple: just query the DB, no push notifications needed

## FRONTEND CHANGES (in src/app/)

### 1. Landing page (src/app/page.tsx):
- Replace hardcoded $0.00 placeholders with real stats from `/api/transactions/summary`
- Show: total SOL claimed, total USDT swapped, total USDT donated
- Add a transparency section showing the pipeline flow visually

### 2. Transactions page (src/app/transactions/page.tsx):
- Fetch from backend `/api/transactions` endpoint
- Show each transaction with: type badge (FEE_RECEIVED/SOL_SWAP/USDT_TRANSFER/DONATION), amount, date, Solscan link
- Color-coded by type, filterable
- Each tx links to `solscan.io/tx/{signature}`

### 3. Dashboard (src/app/dashboard/page.tsx):
- Add pipeline status section (fetch `/api/pipeline/status`)
- Show wallet balances (SOL in HrA44R, USDT in HrA44R, USDT in Kolo)
- Add "Ready to Donate" section showing campaigns with undonated USDT
- Add "Record Donation" form: select campaign, enter amount, receipt URL, submit to `/api/donations/record`
- Keep existing campaign management

### 4. Campaign detail (src/app/campaign/[id]/page.tsx):
- Add transparency timeline showing all transactions for this campaign
- Show pipeline progress: fees claimed → swapped → transferred → donated
- Each step with Solscan links

## IMPORTANT
- Backend URL for API calls from frontend: use `NEXT_PUBLIC_BACKEND_URL` or `BACKEND_URL` env var, fallback to `https://pumpfundme-production.up.railway.app`
- The theme is white/light with emerald-500 green accents, using shadcn/ui components
- Keep the existing wallet auth flow for dashboard
- All monetary values should show proper formatting (SOL with 4-6 decimals, USD with 2)
- The app uses Next.js 15 App Router with server components where possible

## When done
Run: `openclaw system event --text "Done: PumpFundMe frontend+backend cleanup — removed GoFundMe automation, added manual donation recording, updated all frontend pages with real stats and Solscan transparency" --mode now`
