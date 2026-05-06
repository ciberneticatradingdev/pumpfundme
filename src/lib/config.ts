/**
 * Central config — single source of truth for wallets and settings.
 *
 * Uses NEXT_PUBLIC_ prefix so the fee wallet is available in both
 * server components and client components without duplication.
 *
 * Set in Vercel:
 *   NEXT_PUBLIC_PUMPFUNDME_FEE_WALLET = C9edELq7XNKm7rfLsDLSoZBFzNYg1WoybCZdWtg2xxzt
 *   ADMIN_WALLETS = C9edELq7XNKm7rfLsDLSoZBFzNYg1WoybCZdWtg2xxzt  (comma-separated)
 */

/** The wallet that must be set as 100% fee receiver on pump.fun */
export const PUMPFUNDME_FEE_WALLET =
  process.env.NEXT_PUBLIC_PUMPFUNDME_FEE_WALLET ||
  process.env.PUMPFUNDME_FEE_WALLETS ||
  process.env.PUMPFUNDME_FEE_WALLET ||
  "C9edELq7XNKm7rfLsDLSoZBFzNYg1WoybCZdWtg2xxzt";

/** All accepted fee wallets (supports comma-separated for future multi-wallet) */
export const PUMPFUNDME_FEE_WALLETS = PUMPFUNDME_FEE_WALLET
  .split(",")
  .map((w) => w.trim())
  .filter(Boolean);

/** Shortened wallet for display (e.g. "C9ed…xxzt") */
export function shortWallet(wallet: string, chars = 4): string {
  if (wallet.length <= chars * 2 + 1) return wallet;
  return `${wallet.slice(0, chars)}…${wallet.slice(-chars)}`;
}

/** Display-friendly fee wallet */
export const FEE_WALLET_SHORT = shortWallet(PUMPFUNDME_FEE_WALLET);
