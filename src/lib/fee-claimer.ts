import {
  Connection,
  PublicKey,
  Keypair,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import crypto from "crypto";
import { getConnection } from "./solana";
import { getSharingConfigForMint, invalidateFeeCache } from "./fee-monitor";

// ── Constants ────────────────────────────────────────────────────────────────

const PUMP_FUN_PROGRAM = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
);
const PUMP_FEES_PROGRAM = new PublicKey(
  "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ"
);
const SYSTEM_PROGRAM = new PublicKey("11111111111111111111111111111111");

/** PumpFees global config singleton */
const GLOBAL_CONFIG = new PublicKey(
  "CHqnuTkj6sXDFknM652aEFPECZh9qVsBXWkhPohmV9dA"
);

/** Our shareholder wallet (fees accumulate here via distribute_creator_fees) */
const FEE_WALLET = new PublicKey(
  "49GECbTo4z2FZx9s5XzYwxwQurALWGjsfR6wM5deKrVN"
);

/** Claim wallet — we have the private key, receives SOL from claim_social_fee_pda */
const CLAIM_WALLET = new PublicKey(
  "HrA44RKEy2xs5RxVTKZcPgx5hCrmW12nkLhFW55Us3Mw"
);

// ── Discriminators ───────────────────────────────────────────────────────────

function getDiscriminator(name: string): Buffer {
  return crypto
    .createHash("sha256")
    .update(`global:${name}`)
    .digest()
    .subarray(0, 8);
}

const DISTRIBUTE_CREATOR_FEES_DISC = getDiscriminator("distribute_creator_fees");
const CLAIM_SOCIAL_FEE_PDA_DISC = getDiscriminator("claim_social_fee_pda");

// ── PDA derivations ──────────────────────────────────────────────────────────

function getBondingCurvePDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mint.toBuffer()],
    PUMP_FUN_PROGRAM
  );
  return pda;
}

function getCreatorVaultPDA(sharingConfig: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("creator-vault"), sharingConfig.toBuffer()],
    PUMP_FUN_PROGRAM
  );
  return pda;
}

function getPumpFunEventAuthority(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")],
    PUMP_FUN_PROGRAM
  );
  return pda;
}

function getPumpFeesEventAuthority(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("__event_authority")],
    PUMP_FEES_PROGRAM
  );
  return pda;
}

// ── Signer ───────────────────────────────────────────────────────────────────

function getSignerKeypair(): Keypair {
  const key = process.env.CLAIM_SIGNER_PRIVATE_KEY;
  if (!key) throw new Error("CLAIM_SIGNER_PRIVATE_KEY not set");
  return Keypair.fromSecretKey(bs58.decode(key));
}

// ── Build claim transaction ──────────────────────────────────────────────────

export interface ClaimResult {
  mintAddress: string;
  txSignature: string;
  success: boolean;
  error?: string;
}

/**
 * Build the 2-instruction claim transaction for a single token.
 *
 * Instruction 1: distribute_creator_fees (pump.fun)
 *   Moves SOL from creator vault → fee wallet (49GEC...)
 *
 * Instruction 2: claim_social_fee_pda (PumpFees)
 *   Moves SOL from fee wallet → claim wallet (HrA44R...)
 */
export async function buildClaimTransaction(
  mintAddress: string,
  signerPubkey: PublicKey,
  connection?: Connection
): Promise<VersionedTransaction> {
  const conn = connection ?? getConnection();
  const mint = new PublicKey(mintAddress);

  // Resolve SharingConfig for this token
  const config = await getSharingConfigForMint(mintAddress, conn);
  if (!config) {
    throw new Error(`No SharingConfig found for mint ${mintAddress}`);
  }

  const sharingConfig = new PublicKey(config.configPubkey);
  const bondingCurve = getBondingCurvePDA(mint);
  const creatorVault = getCreatorVaultPDA(sharingConfig);
  const pumpFunEventAuth = getPumpFunEventAuthority();
  const pumpFeesEventAuth = getPumpFeesEventAuthority();

  // Instruction 1: distribute_creator_fees
  const distributeIx = new TransactionInstruction({
    programId: PUMP_FUN_PROGRAM,
    keys: [
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: bondingCurve, isSigner: false, isWritable: true },
      { pubkey: sharingConfig, isSigner: false, isWritable: false },
      { pubkey: creatorVault, isSigner: false, isWritable: true },
      { pubkey: SYSTEM_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: pumpFunEventAuth, isSigner: false, isWritable: false },
      { pubkey: PUMP_FUN_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: FEE_WALLET, isSigner: false, isWritable: true },
    ],
    data: DISTRIBUTE_CREATOR_FEES_DISC,
  });

  // Instruction 2: claim_social_fee_pda
  const claimIx = new TransactionInstruction({
    programId: PUMP_FEES_PROGRAM,
    keys: [
      { pubkey: CLAIM_WALLET, isSigner: false, isWritable: true },
      { pubkey: FEE_WALLET, isSigner: false, isWritable: true },
      { pubkey: GLOBAL_CONFIG, isSigner: false, isWritable: false },
      { pubkey: signerPubkey, isSigner: true, isWritable: true },
      { pubkey: pumpFeesEventAuth, isSigner: false, isWritable: false },
      { pubkey: PUMP_FEES_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: CLAIM_SOCIAL_FEE_PDA_DISC,
  });

  // Build versioned transaction
  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const messageV0 = new TransactionMessage({
    payerKey: signerPubkey,
    recentBlockhash: blockhash,
    instructions: [distributeIx, claimIx],
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}

/**
 * Claim fees for a single token: build, sign, send.
 */
export async function claimFeesForToken(
  mintAddress: string,
  connection?: Connection
): Promise<ClaimResult> {
  const conn = connection ?? getConnection();
  const signer = getSignerKeypair();

  try {
    const tx = await buildClaimTransaction(mintAddress, signer.publicKey, conn);
    tx.sign([signer]);

    const txSignature = await conn.sendTransaction(tx, {
      skipPreflight: false,
      maxRetries: 3,
    });

    // Wait for confirmation
    const confirmation = await conn.confirmTransaction(txSignature, "confirmed");
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    // Invalidate fee cache so dashboard refreshes
    invalidateFeeCache();

    return {
      mintAddress,
      txSignature,
      success: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[fee-claimer] Claim failed for ${mintAddress}:`, message);
    return {
      mintAddress,
      txSignature: "",
      success: false,
      error: message,
    };
  }
}

/**
 * Claim fees for all tokens in a campaign, sequentially.
 */
export async function claimFeesForCampaign(
  tokens: { mintAddress: string }[],
  connection?: Connection
): Promise<ClaimResult[]> {
  const conn = connection ?? getConnection();
  const results: ClaimResult[] = [];

  for (const token of tokens) {
    const result = await claimFeesForToken(token.mintAddress, conn);
    results.push(result);
    // Small delay between claims to avoid rate limits
    if (tokens.indexOf(token) < tokens.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}
