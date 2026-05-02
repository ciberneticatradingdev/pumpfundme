import { Connection, PublicKey } from '@solana/web3.js';
import { config } from './config';
import { db } from './db';
import { parseSharingConfig, SharingConfig } from './utils';

const connection = new Connection(config.solanaRpcUrl, 'confirmed');
const PUMP_FEES_PROGRAM = new PublicKey(config.pumpFeesProgramId);
const SHARING_CONFIG_DISC = Buffer.from([216, 74, 9, 0, 56, 140, 93, 75]);

export interface CachedSharingConfig extends SharingConfig {
  address: string;
}

// Maps: SharingConfig address → parsed config
const cacheByAddress = new Map<string, CachedSharingConfig>();
// Maps: mint → SharingConfig address
const cacheByMint = new Map<string, string>();

let lastRefresh = 0;

/**
 * Find SharingConfig for a specific mint address.
 * Filters by discriminator + mint (offset 11) so the RPC only returns 1 result.
 */
async function findSharingConfigForMint(mintAddress: string): Promise<CachedSharingConfig | null> {
  const mintPubkey = new PublicKey(mintAddress);

  const accounts = await connection.getProgramAccounts(PUMP_FEES_PROGRAM, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: SHARING_CONFIG_DISC.toString('base64'),
          encoding: 'base64',
        },
      },
      {
        memcmp: {
          offset: 11,
          bytes: mintPubkey.toBase58(),
        },
      },
    ],
  });

  if (accounts.length === 0) return null;

  const { pubkey, account } = accounts[0];
  const parsed = parseSharingConfig(account.data as Buffer);
  if (!parsed) return null;

  return { ...parsed, address: pubkey.toBase58() };
}

/**
 * Refresh cache by looking up SharingConfigs only for tokens registered in our DB.
 */
export async function refreshCache(): Promise<void> {
  console.log('[cache] refreshing SharingConfig cache from registered tokens...');

  try {
    // Get all registered tokens from DB
    const tokens = await db.token.findMany({
      select: { mintAddress: true, name: true, symbol: true },
    });

    if (tokens.length === 0) {
      console.log('[cache] no tokens registered in DB');
      lastRefresh = Date.now();
      return;
    }

    console.log(`[cache] looking up SharingConfigs for ${tokens.length} registered token(s)...`);
    const feeWallets = new Set(config.feeWallet.split(',').map(w => w.trim()));
    let found = 0;

    for (const token of tokens) {
      // Skip if already cached
      if (cacheByMint.has(token.mintAddress)) {
        found++;
        continue;
      }

      try {
        const cfg = await findSharingConfigForMint(token.mintAddress);
        if (!cfg) {
          console.log(`[cache]   ${token.symbol || token.mintAddress.slice(0, 10)}... — no SharingConfig found`);
          continue;
        }

        const isOurs = cfg.shareholders.some(s => feeWallets.has(s.address));
        if (!isOurs) {
          console.log(`[cache]   ${token.symbol || token.mintAddress.slice(0, 10)}... — SharingConfig exists but we're not a shareholder`);
          continue;
        }

        cacheByAddress.set(cfg.address, cfg);
        cacheByMint.set(cfg.mint, cfg.address);
        found++;

        const ourShare = cfg.shareholders.find(s => feeWallets.has(s.address));
        console.log(`[cache]   ✅ ${token.symbol || token.mintAddress.slice(0, 10)}... config=${cfg.address.slice(0, 10)}... share=${ourShare ? ourShare.shareBps / 100 + '%' : '?'}`);
      } catch (err: any) {
        console.warn(`[cache]   error looking up ${token.mintAddress.slice(0, 10)}...: ${err.message}`);
      }

      // Small delay between RPC calls
      await new Promise(r => setTimeout(r, 500));
    }

    lastRefresh = Date.now();
    console.log(`[cache] done — ${found}/${tokens.length} tokens have valid SharingConfigs`);
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
 * Try to find a mint for a claim tx by matching tx accounts against cached SharingConfig addresses.
 */
export function findMintFromTxAccounts(accountKeys: string[]): string | null {
  for (const key of accountKeys) {
    const cached = cacheByAddress.get(key);
    if (cached) return cached.mint;
  }
  return null;
}

export function needsRefresh(): boolean {
  return Date.now() - lastRefresh > config.cacheRefreshMs;
}
