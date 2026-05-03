function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  databaseUrl: requireEnv('DATABASE_URL'),
  solanaRpcUrl: process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com',
  deployerPrivateKey: process.env.DEPLOYER_PRIVATE_KEY,
  // HrA44R is our wallet — it is the 100% shareholder in SharingConfig and receives SOL via distribute_creator_fees
  feeWallet: process.env.PUMPFUNDME_FEE_WALLETS ?? 'HrA44RKEy2xs5RxVTKZcPgx5hCrmW12nkLhFW55Us3Mw',
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS ?? '30000', 10),
  claimIntervalMs: parseInt(process.env.CLAIM_INTERVAL_MS ?? '300000', 10), // 5 min
  cacheRefreshMs: parseInt(process.env.CACHE_REFRESH_MS ?? '300000', 10), // 5 min
  pumpFeesProgramId: 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ',
  pumpFunProgramId: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  port: parseInt(process.env.PORT ?? '8000', 10),
} as const;
