import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// Wallet(s) that must appear as shareholders in the token's SharingConfig.
// Users must set HrA44R as 100% fee receiver on pump.fun for the token to be accepted.
const PUMPFUNDME_FEE_WALLETS = (
  process.env.PUMPFUNDME_FEE_WALLETS ||
  process.env.PUMPFUNDME_FEE_WALLET ||
  "HrA44RKEy2xs5RxVTKZcPgx5hCrmW12nkLhFW55Us3Mw"
)
  .split(",")
  .map((w) => w.trim())
  .filter(Boolean);

// PumpFees program
const PUMP_FEES_PROGRAM = new PublicKey(
  "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ"
);

// SharingConfig account discriminator
const SHARING_CONFIG_DISC = Buffer.from([216, 74, 9, 0, 56, 140, 93, 75]);

/**
 * SharingConfig account layout (after 8-byte discriminator):
 *   bump:          u8   (1)
 *   version:       u8   (1)
 *   status:        u8   (1)
 *   mint:          Pubkey (32)  ← offset 11
 *   admin:         Pubkey (32)  ← offset 43
 *   admin_revoked: bool  (1)
 *   shareholders:  Vec<Shareholder> ← offset 76
 *     count: u32 LE (4)
 *     each:  address(32) + share_bps(u16=2) = 34 bytes
 */

interface Shareholder {
  address: string;
  shareBps: number;
}

function parseSharingConfig(data: Buffer): {
  mint: string;
  admin: string;
  shareholders: Shareholder[];
} | null {
  if (data.length < 80) return null;

  // Verify discriminator
  if (!data.subarray(0, 8).equals(SHARING_CONFIG_DISC)) return null;

  const mint = new PublicKey(data.subarray(11, 43)).toBase58();
  const admin = new PublicKey(data.subarray(43, 75)).toBase58();

  const shareholderCount = data.readUInt32LE(76);
  const shareholders: Shareholder[] = [];

  let offset = 80;
  for (let i = 0; i < shareholderCount && offset + 34 <= data.length; i++) {
    const address = new PublicKey(data.subarray(offset, offset + 32)).toBase58();
    const shareBps = data.readUInt16LE(offset + 32);
    shareholders.push({ address, shareBps });
    offset += 34;
  }

  return { mint, admin, shareholders };
}

/**
 * Verify that a token's creator fees are directed to PumpFundMe.
 *
 * Checks the SharingConfig account in the PumpFees program for the token.
 * The SharingConfig stores the shareholders (wallets) that receive creator fees.
 * At least one of our configured wallets must be a shareholder.
 */
export async function verifyFeeRecipient(
  mintAddress: string
): Promise<{
  verified: boolean;
  shareholders?: Shareholder[];
  error?: string;
}> {
  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const mintPubkey = new PublicKey(mintAddress);

    // Find SharingConfig accounts for this mint
    const accounts = await connection.getProgramAccounts(PUMP_FEES_PROGRAM, {
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

    if (accounts.length === 0) {
      return {
        verified: false,
        error:
          "No fee sharing config found for this token. Make sure you set HrA44RKEy2xs5RxVTKZcPgx5hCrmW12nkLhFW55Us3Mw as 100% fee receiver on pump.fun before registering.",
      };
    }

    // Parse the SharingConfig
    const config = parseSharingConfig(accounts[0].account.data as Buffer);
    if (!config) {
      return {
        verified: false,
        error: "Could not decode fee sharing config",
      };
    }

    // Check if any of our wallets is a shareholder
    const ourWallets = new Set(PUMPFUNDME_FEE_WALLETS);
    const match = config.shareholders.find((s) => ourWallets.has(s.address));

    if (match) {
      return {
        verified: true,
        shareholders: config.shareholders,
      };
    }

    // Build error message showing who actually receives the fees
    const recipientList = config.shareholders
      .map(
        (s) =>
          `${s.address.slice(0, 6)}…${s.address.slice(-4)} (${s.shareBps / 100}%)`
      )
      .join(", ");

    return {
      verified: false,
      shareholders: config.shareholders,
      error: `Token fees are not directed to PumpFundMe. Current recipient(s): ${recipientList}. Set HrA44RKEy2xs5RxVTKZcPgx5hCrmW12nkLhFW55Us3Mw as 100% fee receiver on pump.fun.`,
    };
  } catch (err) {
    console.error("Fee recipient verification error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";

    if (message.includes("Invalid public key")) {
      return { verified: false, error: "Invalid token address" };
    }

    return {
      verified: false,
      error: `Fee verification failed: ${message}`,
    };
  }
}
