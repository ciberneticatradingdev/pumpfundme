const HARDCODED_ADMIN_WALLETS = ["HrA44RKEy2xs5RxVTKZcPgx5hCrmW12nkLhFW55Us3Mw"];

export function isAdminWallet(wallet: string): boolean {
  if (!wallet) return false;
  const envWallets = process.env.ADMIN_WALLETS
    ? process.env.ADMIN_WALLETS.split(",").map((w) => w.trim()).filter(Boolean)
    : [];
  return [...HARDCODED_ADMIN_WALLETS, ...envWallets].includes(wallet);
}
