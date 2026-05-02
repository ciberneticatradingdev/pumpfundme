import { Connection, PublicKey } from '@solana/web3.js';
import { config } from './config';
import { parseSharingConfig, SharingConfig } from './utils';

const connection = new Connection(config.solanaRpcUrl, 'confirmed');
const PUMP_FEES_PROGRAM = new PublicKey(config.pumpFeesProgramId);
const SHARING_CONFIG_DISC = Buffer.from([216, 74, 9, 0, 56, 140, 93, 75]);

export interface CachedSharingConfig extends SharingConfig {
  address: string; // The SharingConfig account address
}

// Maps: SharingConfig address → parsed config
const cacheByAddress = new Map<string, CachedSharingConfig>();
// Maps: mint → SharingConfig address
const cacheByMint = new Map<string, string>();
// All PumpFees-owned account addresses we've seen (any type)
const knownPumpFeesAccounts = new Map<string, string>(); // pumpfees account → associated sharingConfig address

let lastRefresh = 0;

/**
 * Find ALL SharingConfig accounts where our fee wallet is a shareholder.
 * Uses getProgramAccounts with the SharingConfig discriminator.
 */
export async function refreshCache(): Promise<void> {
  console.log('[cache] refreshing SharingConfig cache...');

  try {
    // Find all SharingConfig accounts by discriminator
    const accounts = await connection.getProgramAccounts(PUMP_FEES_PROGRAM, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: SHARING_CONFIG_DISC.toString('base64'),
            encoding: 'base64',
          },
        },
      ],
    });

    const feeWallets = new Set(config.feeWallet.split(',').map(w => w.trim()));
    let found = 0;

    for (const { pubkey, account } of accounts) {
      const parsed = parseSharingConfig(account.data as Buffer);
      if (!parsed) continue;

      // Only cache configs where we're a shareholder
      const isOurs = parsed.shareholders.some(s => feeWallets.has(s.address));
      if (!isOurs) continue;

      const address = pubkey.toBase58();
      const cached: CachedSharingConfig = { ...parsed, address };

      cacheByAddress.set(address, cached);
      cacheByMint.set(parsed.mint, address);
      found++;
    }

    lastRefresh = Date.now();
    console.log(`[cache] found ${found} SharingConfig(s) where we are shareholder (out of ${accounts.length} total)`);

    // Log each cached config
    for (const [addr, cfg] of cacheByAddress) {
      const ourShare = cfg.shareholders.find(s => feeWallets.has(s.address));
      console.log(`[cache]   mint=${cfg.mint.slice(0, 10)}... config=${addr.slice(0, 10)}... share=${ourShare ? ourShare.shareBps / 100 + '%' : '?'}`);
    }
  } catch (err) {
    console.error('[cache] failed to refresh:', err);
  }
}

export function getCacheByAddress(): Map<string, CachedSharingConfig> {
  return cacheByAddress;
}

export function getCacheByMint(): Map<string, string> {
  return cacheByMint;
}

/**
 * Try to find a mint for a claim transaction by matching any tx account
 * against our cached SharingConfig addresses.
 */
export function findMintFromTxAccounts(accountKeys: string[]): string | null {
  // Direct match: one of the tx accounts IS a SharingConfig we know
  for (const key of accountKeys) {
    const cached = cacheByAddress.get(key);
    if (cached) return cached.mint;
  }
  return null;
}

export function needsRefresh(): boolean {
  return Date.now() - lastRefresh > config.cacheRefreshMs;
}
