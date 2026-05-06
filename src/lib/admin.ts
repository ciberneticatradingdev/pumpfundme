import { PUMPFUNDME_FEE_WALLETS } from "./config";

export function isAdminWallet(wallet: string): boolean {
  if (!wallet) return false;
  const envWallets = process.env.ADMIN_WALLETS
    ? process.env.ADMIN_WALLETS.split(",").map((w) => w.trim()).filter(Boolean)
    : [];
  // Fee wallets are always admin + any extra from ADMIN_WALLETS env
  return [...PUMPFUNDME_FEE_WALLETS, ...envWallets].includes(wallet);
}
