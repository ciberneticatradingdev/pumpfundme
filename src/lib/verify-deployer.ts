import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

/**
 * Verify that a wallet is the deployer of a token by checking:
 * 1. Mint authority matches the wallet
 * 2. If mint authority is revoked (common on pump.fun), check the first transaction
 *    on the mint account to see if the wallet was a signer
 */
export async function verifyTokenDeployer(
  mintAddress: string,
  walletAddress: string
): Promise<{ verified: boolean; error?: string }> {
  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const mintPubkey = new PublicKey(mintAddress);
    const walletPubkey = new PublicKey(walletAddress);

    // Step 1: Check mint account info
    const accountInfo = await connection.getAccountInfo(mintPubkey);
    if (!accountInfo) {
      return { verified: false, error: "Token not found on-chain" };
    }

    // Parse mint data (SPL Token mint layout)
    // Mint layout: 4 bytes (coption) + 32 bytes (mint authority) + 8 bytes (supply) + 1 byte (decimals) + 1 byte (is_initialized) + 4 bytes (coption) + 32 bytes (freeze authority)
    const data = accountInfo.data;
    
    // Check mint authority (offset 0: 4 bytes coption, offset 4: 32 bytes pubkey)
    const hasMintAuthority = data.readUInt32LE(0) === 1;
    if (hasMintAuthority) {
      const mintAuthority = new PublicKey(data.subarray(4, 36));
      if (mintAuthority.equals(walletPubkey)) {
        return { verified: true };
      }
    }

    // Step 2: Mint authority revoked or doesn't match — check first transaction
    // Get the oldest signatures for this mint
    const signatures = await connection.getSignaturesForAddress(mintPubkey, {
      limit: 1,
    });

    if (signatures.length === 0) {
      return { verified: false, error: "No transactions found for this token" };
    }

    // For pump.fun tokens, we need the OLDEST transaction (the deploy tx)
    // getSignaturesForAddress returns newest first, so we need to paginate to find the oldest
    // But for efficiency, let's try getting signatures in order
    let oldestSig = signatures[signatures.length - 1];
    
    // Keep fetching older signatures until we reach the first one
    let lastSig = oldestSig.signature;
    let hasMore = true;
    while (hasMore) {
      const olderSigs = await connection.getSignaturesForAddress(mintPubkey, {
        limit: 1000,
        before: lastSig,
      });
      if (olderSigs.length === 0) {
        hasMore = false;
      } else {
        oldestSig = olderSigs[olderSigs.length - 1];
        lastSig = oldestSig.signature;
        if (olderSigs.length < 1000) {
          hasMore = false;
        }
      }
    }

    // Fetch the oldest (deploy) transaction
    const tx = await connection.getTransaction(oldestSig.signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { verified: false, error: "Could not fetch deploy transaction" };
    }

    // Check if the wallet was a signer in the deploy transaction
    const accountKeys = tx.transaction.message.getAccountKeys();
    const signers: string[] = [];
    
    // In versioned transactions, the first N accounts are signers (N = numRequiredSignatures)
    const numSigners = tx.transaction.message.header.numRequiredSignatures;
    for (let i = 0; i < numSigners; i++) {
      const key = accountKeys.get(i);
      if (key) {
        signers.push(key.toBase58());
      }
    }

    if (signers.includes(walletAddress)) {
      return { verified: true };
    }

    return {
      verified: false,
      error: "Your wallet is not the deployer of this token",
    };
  } catch (err) {
    console.error("Token verification error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    
    if (message.includes("Invalid public key")) {
      return { verified: false, error: "Invalid token address" };
    }
    
    return {
      verified: false,
      error: `On-chain verification failed: ${message}`,
    };
  }
}
