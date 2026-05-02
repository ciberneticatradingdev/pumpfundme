function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  databaseUrl: requireEnv('DATABASE_URL'),
  solanaRpcUrl: process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com',
  // Not used in Phase 1 (fee monitoring only), needed for Phase 2 SOL transfers
  deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY,
  feeWallet: process.env.PUMPFUNDME_FEE_WALLETS ?? '49GECbTo4z2FZx9s5XzYwxwQurALWGjsfR6wM5deKrVN',
  koloWallet: process.env.KOLO_WALLET_ADDRESS ?? 'vcKapasn5HfXpXvdxjBLqrR35rQLb1WrEKZrM3MZiKi',
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS ?? '30000', 10),
  pumpFeesProgramId: 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ',
} as const;
