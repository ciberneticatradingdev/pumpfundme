import { Connection, PublicKey } from "@solana/web3.js";
import { getConnection } from "./solana";

// ── Constants ────────────────────────────────────────────────────────────────

const PUMP_FUN_PROGRAM = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
);
const PUMP_FEES_PROGRAM = new PublicKey(
  "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ"
);

/** SharingConfig account discriminator (first 8 bytes) */
const SHARING_CONFIG_DISC = Buffer.from([216, 74, 9, 0, 56, 140, 93, 75]);

/** Rent-exempt minimum for a 0-data account (lamports) */
const RENT_EXEMPT_MIN = 890_880;

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

// ── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Parse a SharingConfig account's data buffer.
 *
 * Layout (after 8-byte discriminator):
 *   bump:           u8   (1)
 *   version:        u8   (1)
 *   status:         u8   (1)
 *   mint:           Pubkey (32) — offset 11
 *   admin:          Pubkey (32) — offset 43
 *   admin_revoked:  bool  (1)
 *   shareholders:   Vec<Shareholder> — offset 76
 *     count: u32 LE (4)
 *     each:  address(32) + share_bps(u16) = 34 bytes
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
    const address = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
    const shareBps = data.readUInt16LE(offset + 32);
    shareholders.push({ address, shareBps });
    offset += 34;
  }

  return { mint, admin, shareholders };
}

// ── Core Functions ───────────────────────────────────────────────────────────

/**
 * Find the SharingConfig account for a given mint address.
 * Queries PumpFees program accounts filtered by discriminator + mint.
 */
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

/**
 * Derive the creator-vault PDA where fees accumulate.
 * Seeds: ["creator-vault", sharingConfigPDA] on pump.fun program.
 */
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

/**
 * Get claimable SOL for a single token.
 * Returns vault balance minus rent-exempt minimum.
 */
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

/**
 * Get claimable balances for multiple tokens.
 * Batches RPC requests with delays to avoid rate limits.
 */
export async function getClaimableBalances(
  tokens: { mintAddress: string; campaignId?: string; campaignName?: string }[],
  connection?: Connection
): Promise<TokenFeeBalance[]> {
  const conn = connection ?? getConnection();
  const results: TokenFeeBalance[] = [];

  // Process in batches of 3 with 200ms delay between batches
  const BATCH_SIZE = 3;
  const BATCH_DELAY = 200;

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map(async (token) => {
        const balance = await getClaimableBalance(token.mintAddress, conn);
        if (balance) {
          balance.campaignId = token.campaignId;
          balance.campaignName = token.campaignName;
        }
        return balance;
      })
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value) {
        results.push(result.value);
      }
    }

    // Delay between batches (skip after last batch)
    if (i + BATCH_SIZE < tokens.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY));
    }
  }

  return results;
}

/**
 * Get total claimable SOL for a specific campaign.
 * Fetches all tokens linked to the campaign and sums their vault balances.
 */
export async function getClaimableByCampaign(
  campaignTokens: { mintAddress: string }[],
  connection?: Connection
): Promise<{ tokens: TokenFeeBalance[]; totalClaimableLamports: number; totalClaimableSol: number }> {
  const conn = connection ?? getConnection();
  const tokens = await getClaimableBalances(
    campaignTokens.map((t) => ({ mintAddress: t.mintAddress })),
    conn
  );

  const totalClaimableLamports = tokens.reduce(
    (sum, t) => sum + t.claimableLamports,
    0
  );

  return {
    tokens,
    totalClaimableLamports,
    totalClaimableSol: totalClaimableLamports / 1e9,
  };
}

/**
 * Find ALL SharingConfig accounts that have one of our wallets as a shareholder.
 * Filters by our wallet at offset 80 (first shareholder position).
 * Returns token configs even if not yet registered in our DB.
 */
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

/** Format lamports to a human-readable SOL string */
export function formatSol(lamports: number, decimals = 6): string {
  return (lamports / 1e9).toFixed(decimals);
}
