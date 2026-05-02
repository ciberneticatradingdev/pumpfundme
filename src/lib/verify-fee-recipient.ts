import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

// The GitHub-linked wallet that should receive all fees
// Change this when switching from test to production GitHub
const PUMPFUNDME_FEE_WALLET = process.env.PUMPFUNDME_FEE_WALLET || "vcKapasn5HfXpXvdxjBLqrR35rQLb1WrEKZrM3MZiKi";

// PumpSwap program ID
const PUMPSWAP_PROGRAM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");

// Pool discriminator from the Codama-generated struct
const POOL_DISCRIMINATOR = Buffer.from([241, 154, 109, 4, 17, 177, 109, 188]);

/**
 * Decode the coin_creator field from a PumpSwap pool account.
 * Pool struct layout (after 8-byte discriminator):
 *   pool_bump: u8 (1)
 *   index: u16 (2)
 *   creator: Pubkey (32)
 *   base_mint: Pubkey (32)
 *   quote_mint: Pubkey (32)
 *   lp_mint: Pubkey (32)
 *   pool_base_token_account: Pubkey (32)
 *   pool_quote_token_account: Pubkey (32)
 *   lp_supply: u64 (8)
 *   coin_creator: Pubkey (32) <-- this is the fee recipient
 */
function decodeCoinCreator(data: Buffer): PublicKey | null {
  if (data.length < 8 + 1 + 2 + 32 * 6 + 8 + 32) return null;

  // Verify discriminator
  if (!data.subarray(0, 8).equals(POOL_DISCRIMINATOR)) return null;

  // coin_creator offset: 8 (disc) + 1 (bump) + 2 (index) + 32*6 (6 pubkeys) + 8 (lp_supply) = 211
  const offset = 8 + 1 + 2 + 32 * 6 + 8;
  return new PublicKey(data.subarray(offset, offset + 32));
}

/**
 * Find the PumpSwap pool for a given token mint.
 * The pool PDA is derived from [base_mint, quote_mint(SOL), index].
 * Since we don't know the index, we search pool accounts by the token mint.
 */
async function findPoolForMint(
  connection: Connection,
  mintAddress: PublicKey
): Promise<{ poolAddress: PublicKey; data: Buffer } | null> {
  // Search for pool accounts owned by PumpSwap that contain this mint
  const accounts = await connection.getProgramAccounts(PUMPSWAP_PROGRAM, {
    filters: [
      { dataSize: 211 + 32 + 1 + 1 }, // Expected pool account size: 245 bytes
      { memcmp: { offset: 8 + 1 + 2 + 32, bytes: mintAddress.toBase58() } }, // base_mint at offset 43
    ],
  });

  if (accounts.length === 0) {
    // Try with mint as quote (unlikely for pump.fun tokens, but just in case)
    const accounts2 = await connection.getProgramAccounts(PUMPSWAP_PROGRAM, {
      filters: [
        { dataSize: 211 + 32 + 1 + 1 },
        { memcmp: { offset: 8 + 1 + 2 + 32 + 32, bytes: mintAddress.toBase58() } },
      ],
    });
    if (accounts2.length === 0) return null;
    return { poolAddress: accounts2[0].pubkey, data: accounts2[0].account.data as Buffer };
  }

  return { poolAddress: accounts[0].pubkey, data: accounts[0].account.data as Buffer };
}

/**
 * Verify that a token's creator fees are directed to PumpFundMe's wallet.
 * This checks the `coin_creator` field in the PumpSwap pool for the token.
 */
export async function verifyFeeRecipient(
  mintAddress: string
): Promise<{ verified: boolean; coinCreator?: string; error?: string }> {
  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const mintPubkey = new PublicKey(mintAddress);

    // Find the PumpSwap pool for this token
    const poolResult = await findPoolForMint(connection, mintPubkey);

    if (!poolResult) {
      return {
        verified: false,
        error: "No PumpSwap pool found for this token. Make sure it graduated from pump.fun.",
      };
    }

    // Decode the coin_creator (fee recipient)
    const coinCreator = decodeCoinCreator(poolResult.data);

    if (!coinCreator) {
      return {
        verified: false,
        error: "Could not decode pool data",
      };
    }

    const coinCreatorAddr = coinCreator.toBase58();
    const expectedWallet = PUMPFUNDME_FEE_WALLET;

    if (coinCreatorAddr === expectedWallet) {
      return { verified: true, coinCreator: coinCreatorAddr };
    }

    return {
      verified: false,
      coinCreator: coinCreatorAddr,
      error: `Token fees are not directed to PumpFundMe. Fee recipient: ${coinCreatorAddr.slice(0, 6)}…${coinCreatorAddr.slice(-4)}`,
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
