import { Connection, PublicKey } from "@solana/web3.js";
import { getConnection } from "./solana";

// ── Constants ────────────────────────────────────────────────────────────────

const PUMP_FUN_PROGRAM = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
);
const PUMP_FEES_PROGRAM = new PublicKey(
  "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ"
);

const SHARING_CONFIG_DISC = Buffer.from([216, 74, 9, 0, 56, 140, 93, 75]);
const RENT_EXEMPT_MIN = 890_880;
const MULTI_ACCT_CHUNK = 100;
const SHARING_CONFIG_TTL = 5 * 60 * 1000; // 5 min
const ALL_FEES_TTL = 30 * 1000; // 30 s

const PUMPFUNDME_FEE_WALLETS = (
  process.env.PUMPFUNDME_FEE_WALLETS ||
  "49GECbTo4z2FZx9s5XzYwxwQurALWGjsfR6wM5deKrVN"
)
  .split(",")
  .map((w) => w.trim())
  .filter(Boolean);

// ── Types ────────────────────────────────────────────────────────────────────

export interface Shareholder {
  address: string;
  shareBps: number;
}

export interface SharingConfig {
  configPubkey: string;
  mint: string;
  admin: string;
  shareholders: Shareholder[];
}

export interface TokenFeeBalance {
  mintAddress: string;
  campaignId?: string;
  campaignName?: string;
  sharingConfigAddress: string;
  vaultAddress: string;
  balanceLamports: number;
  balanceSol: number;
  claimableLamports: number;
  claimableSol: number;
}

export interface CampaignFees {
  campaignId: string;
  campaignName: string;
  tokens: TokenFeeBalance[];
  totalClaimableLamports: number;
  totalClaimableSol: number;
}

export interface AllFeesResult {
  tokens: TokenFeeBalance[];
  totalClaimableLamports: number;
  totalClaimableSol: number;
  byCampaign: Record<string, CampaignFees>;
}

// ── Cache ────────────────────────────────────────────────────────────────────

const sharingConfigCache = new Map<
  string,
  { data: SharingConfig | null; expiresAt: number }
>();

let allFeesCache: { data: AllFeesResult; expiresAt: number } | null = null;
let allFeesPending: Promise<AllFeesResult> | null = null;

export function invalidateFeeCache(): void {
  allFeesCache = null;
  allFeesPending = null;
  sharingConfigCache.clear();
}

// ── Retry ────────────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseMs = 500
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === retries) break;
      const is429 =
        err instanceof Error &&
        (err.message.includes("429") ||
          err.message.toLowerCase().includes("rate limit"));
      await new Promise((r) =>
        setTimeout(r, baseMs * Math.pow(2, i) * (is429 ? 3 : 1))
      );
    }
  }
  throw lastErr;
}

// ── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Layout (after 8-byte discriminator):
 *   bump: u8 (1), version: u8 (1), status: u8 (1)
 *   mint: Pubkey (32) @ offset 11
 *   admin: Pubkey (32) @ offset 43
 *   admin_revoked: bool (1)
 *   shareholders: Vec<Shareholder> @ offset 76
 *     count: u32 LE (4), each: address(32) + share_bps(u16) = 34 bytes
 */
function parseSharingConfig(
  data: Buffer
): { mint: string; admin: string; shareholders: Shareholder[] } | null {
  if (data.length < 80) return null;
  if (!data.subarray(0, 8).equals(SHARING_CONFIG_DISC)) return null;

  const mint = new PublicKey(data.subarray(11, 43)).toBase58();
  const admin = new PublicKey(data.subarray(43, 75)).toBase58();
  const count = data.readUInt32LE(76);
  const shareholders: Shareholder[] = [];

  let offset = 80;
  for (let i = 0; i < count && offset + 34 <= data.length; i++) {
    const address = new PublicKey(
      data.subarray(offset, offset + 32)
    ).toBase58();
    const shareBps = data.readUInt16LE(offset + 32);
    shareholders.push({ address, shareBps });
    offset += 34;
  }

  return { mint, admin, shareholders };
}

// ── Core Functions ───────────────────────────────────────────────────────────

export async function getSharingConfigForMint(
  mintAddress: string,
  connection?: Connection
): Promise<SharingConfig | null> {
  const conn = connection ?? getConnection();
  const mintPubkey = new PublicKey(mintAddress);

  const accounts = await conn.getProgramAccounts(PUMP_FEES_PROGRAM, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: SHARING_CONFIG_DISC.toString("base64"),
          encoding: "base64",
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

  return {
    configPubkey: pubkey.toBase58(),
    mint: parsed.mint,
    admin: parsed.admin,
    shareholders: parsed.shareholders,
  };
}

export function getCreatorVaultPDA(sharingConfigPubkey: string): string {
  const [vault] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("creator-vault"),
      new PublicKey(sharingConfigPubkey).toBuffer(),
    ],
    PUMP_FUN_PROGRAM
  );
  return vault.toBase58();
}

// ── Cached Config Lookup ─────────────────────────────────────────────────────

async function getSharingConfigCached(
  mintAddress: string,
  conn: Connection
): Promise<SharingConfig | null> {
  const now = Date.now();
  const hit = sharingConfigCache.get(mintAddress);
  if (hit && hit.expiresAt > now) return hit.data;

  const data = await withRetry(() => getSharingConfigForMint(mintAddress, conn));
  sharingConfigCache.set(mintAddress, {
    data,
    expiresAt: now + SHARING_CONFIG_TTL,
  });
  return data;
}

// ── Batched Vault Balance Reads ──────────────────────────────────────────────

async function getVaultBalancesBatched(
  vaultAddresses: string[],
  conn: Connection
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (let i = 0; i < vaultAddresses.length; i += MULTI_ACCT_CHUNK) {
    const chunk = vaultAddresses.slice(i, i + MULTI_ACCT_CHUNK);
    const pubkeys = chunk.map((a) => new PublicKey(a));
    const infos = await withRetry(() => conn.getMultipleAccountsInfo(pubkeys));
    for (let j = 0; j < chunk.length; j++) {
      result.set(chunk[j], infos[j]?.lamports ?? 0);
    }
  }
  return result;
}

// ── getAllFeesWithCache ───────────────────────────────────────────────────────

/**
 * Fetch fee balances for all given tokens with caching and deduplication.
 *
 * - SharingConfig lookups cached 5 min per mint
 * - Full result cached 30 s; concurrent callers share one in-flight promise
 * - Vault balances fetched in a single batched RPC call
 */
export async function getAllFeesWithCache(
  tokens: { mintAddress: string; campaignId?: string; campaignName?: string }[],
  connection?: Connection
): Promise<AllFeesResult> {
  const now = Date.now();
  if (allFeesCache && allFeesCache.expiresAt > now) return allFeesCache.data;
  if (allFeesPending) return allFeesPending;

  const promise = (async (): Promise<AllFeesResult> => {
    try {
      const conn = connection ?? getConnection();

      // Phase 1: resolve SharingConfigs (cached per mint, retried on failure)
      const configResults = await Promise.allSettled(
        tokens.map(async (token) => ({
          token,
          config: await getSharingConfigCached(token.mintAddress, conn),
        }))
      );

      type Entry = {
        token: (typeof tokens)[0];
        config: SharingConfig;
        vaultAddress: string;
      };
      const entries: Entry[] = [];
      for (const r of configResults) {
        if (r.status === "fulfilled" && r.value.config) {
          entries.push({
            token: r.value.token,
            config: r.value.config,
            vaultAddress: getCreatorVaultPDA(r.value.config.configPubkey),
          });
        }
      }

      // Phase 2: batch fetch all vault balances in one RPC call (chunked at 100)
      const vaultBalances = await getVaultBalancesBatched(
        entries.map((e) => e.vaultAddress),
        conn
      );

      // Phase 3: assemble result
      const tokenFees: TokenFeeBalance[] = [];
      const byCampaign: Record<string, CampaignFees> = {};

      for (const { token, config, vaultAddress } of entries) {
        const balanceLamports = vaultBalances.get(vaultAddress) ?? 0;
        const claimableLamports = Math.max(0, balanceLamports - RENT_EXEMPT_MIN);

        const fee: TokenFeeBalance = {
          mintAddress: token.mintAddress,
          campaignId: token.campaignId,
          campaignName: token.campaignName,
          sharingConfigAddress: config.configPubkey,
          vaultAddress,
          balanceLamports,
          balanceSol: balanceLamports / 1e9,
          claimableLamports,
          claimableSol: claimableLamports / 1e9,
        };
        tokenFees.push(fee);

        if (token.campaignId) {
          if (!byCampaign[token.campaignId]) {
            byCampaign[token.campaignId] = {
              campaignId: token.campaignId,
              campaignName: token.campaignName ?? "",
              tokens: [],
              totalClaimableLamports: 0,
              totalClaimableSol: 0,
            };
          }
          const bucket = byCampaign[token.campaignId];
          bucket.tokens.push(fee);
          bucket.totalClaimableLamports += claimableLamports;
          bucket.totalClaimableSol = bucket.totalClaimableLamports / 1e9;
        }
      }

      const totalClaimableLamports = tokenFees.reduce(
        (s, t) => s + t.claimableLamports,
        0
      );
      const result: AllFeesResult = {
        tokens: tokenFees,
        totalClaimableLamports,
        totalClaimableSol: totalClaimableLamports / 1e9,
        byCampaign,
      };

      allFeesCache = { data: result, expiresAt: Date.now() + ALL_FEES_TTL };
      return result;
    } finally {
      allFeesPending = null;
    }
  })();

  allFeesPending = promise;
  return promise;
}

// ── Legacy helpers (kept for fee-claimer / scripts) ──────────────────────────

export async function getClaimableBalance(
  mintAddress: string,
  connection?: Connection
): Promise<TokenFeeBalance | null> {
  const conn = connection ?? getConnection();
  const config = await getSharingConfigForMint(mintAddress, conn);
  if (!config) return null;

  const vaultAddress = getCreatorVaultPDA(config.configPubkey);
  const vaultInfo = await conn.getAccountInfo(new PublicKey(vaultAddress));

  const balanceLamports = vaultInfo?.lamports ?? 0;
  const claimableLamports = Math.max(0, balanceLamports - RENT_EXEMPT_MIN);

  return {
    mintAddress,
    sharingConfigAddress: config.configPubkey,
    vaultAddress,
    balanceLamports,
    balanceSol: balanceLamports / 1e9,
    claimableLamports,
    claimableSol: claimableLamports / 1e9,
  };
}

export async function getClaimableBalances(
  tokens: { mintAddress: string; campaignId?: string; campaignName?: string }[],
  connection?: Connection
): Promise<TokenFeeBalance[]> {
  const conn = connection ?? getConnection();
  const result = await getAllFeesWithCache(tokens, conn);
  return result.tokens;
}

export async function getClaimableByCampaign(
  campaignTokens: { mintAddress: string }[],
  connection?: Connection
): Promise<{
  tokens: TokenFeeBalance[];
  totalClaimableLamports: number;
  totalClaimableSol: number;
}> {
  const conn = connection ?? getConnection();
  const result = await getAllFeesWithCache(campaignTokens, conn);
  return {
    tokens: result.tokens,
    totalClaimableLamports: result.totalClaimableLamports,
    totalClaimableSol: result.totalClaimableSol,
  };
}

export async function findAllOurSharingConfigs(
  connection?: Connection
): Promise<SharingConfig[]> {
  const conn = connection ?? getConnection();
  const results: SharingConfig[] = [];

  for (const wallet of PUMPFUNDME_FEE_WALLETS) {
    const walletPubkey = new PublicKey(wallet);

    const accounts = await conn.getProgramAccounts(PUMP_FEES_PROGRAM, {
      filters: [
        {
          memcmp: {
            offset: 0,
            bytes: SHARING_CONFIG_DISC.toString("base64"),
            encoding: "base64",
          },
        },
        {
          memcmp: {
            offset: 80,
            bytes: walletPubkey.toBase58(),
          },
        },
      ],
    });

    for (const { pubkey, account } of accounts) {
      const parsed = parseSharingConfig(account.data as Buffer);
      if (parsed) {
        results.push({
          configPubkey: pubkey.toBase58(),
          mint: parsed.mint,
          admin: parsed.admin,
          shareholders: parsed.shareholders,
        });
      }
    }
  }

  return results;
}

export function formatSol(lamports: number, decimals = 6): string {
  return (lamports / 1e9).toFixed(decimals);
}
