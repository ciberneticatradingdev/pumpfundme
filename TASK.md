# PumpFundMe — Admin vs User Role Separation

## Context
PumpFundMe collects ALL fees into a single wallet (HrA44R). The PumpFundMe admin (Quin) manually donates to GoFundMe from the Kolo card. Users only create campaigns and register tokens — they never handle donations.

The current code incorrectly lets any connected wallet access donation recording and pipeline management. We need to separate admin and user roles.

## Admin Wallet(s)
Define an admin wallet list. For now, hardcode:
```
ADMIN_WALLETS = ["HrA44RKEy2xs5RxVTKZcPgx5hCrmW12nkLhFW55Us3Mw"]
```
Also check `ADMIN_WALLETS` env var (comma-separated) so more can be added later without code changes.

## BACKEND CHANGES

### 1. Add admin auth middleware/helper
- Create `src/lib/admin.ts` — exports `isAdminWallet(wallet: string): boolean`
- Checks against hardcoded list + `ADMIN_WALLETS` env var

### 2. Protect admin-only endpoints
- `POST /api/donations/record` — require admin wallet in request (add `walletAddress` field, verify it's admin)
- `GET /api/notifications/ready` — admin only
- `GET /api/pipeline/status` — admin only
- Return 403 if non-admin wallet tries to access these

### 3. Keep public endpoints public
- `GET /api/transactions` — public (transparency)
- `GET /api/transactions/summary` — public (transparency)
- `GET /api/campaigns` and `/api/campaigns/[id]` — public
- All fee balance/history endpoints — public

## FRONTEND CHANGES

### 1. Dashboard — split into admin vs user views
The dashboard (`src/app/dashboard/page.tsx`) should detect if the connected wallet is an admin:

**If admin wallet:**
- Show pipeline status (wallet balances: SOL in HrA44R, USDT in HrA44R, USDT in Kolo)
- Show "Ready to Donate" section — campaigns with USDT transferred but not yet donated
- Show "Record Donation" form (campaign selector, amount USD, receipt URL, notes)
- Show all campaigns across all users
- Show recent donations recorded

**If regular user wallet:**
- Show only THEIR campaigns (filtered by connected wallet = creatorWallet)
- Show their registered tokens and how much fees each has generated
- Show donation status per campaign (how much was donated by PumpFundMe for their campaign)
- NO pipeline status, NO record donation form, NO wallet balances

### 2. Admin indicator
- Small badge or indicator showing "Admin" when connected with admin wallet
- Don't expose admin wallet addresses to non-admin users

### 3. Public pages stay the same
- Landing page: real stats, transparency section — NO CHANGES
- Campaign detail: transparency timeline — NO CHANGES  
- Transactions page: all transactions with Solscan links — NO CHANGES
- Terminal: real-time events — NO CHANGES

## IMPORTANT
- Use the existing wallet auth (Solana wallet adapter) — no new auth system needed
- Admin check is simply: is the connected wallet in the admin list?
- The admin wallet list should be easy to extend (env var)
- Theme: white/light with emerald-500 green accents, shadcn/ui
- Backend URL: `NEXT_PUBLIC_BACKEND_URL` env var, fallback to `https://pumpfundme-production.up.railway.app`

## When done
Run: `openclaw system event --text "Done: PumpFundMe admin/user role separation — admin-only donation recording, user dashboard shows their campaigns only, public transparency unchanged" --mode now`
