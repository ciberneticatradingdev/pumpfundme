import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from './config';
import { getCacheByAddress, refreshCache } from './sharing-config-cache';
import { withRetry } from './utils';

const connection = new Connection(config.solanaRpcUrl, 'confirmed');
const PUMP_FEES_PROGRAM = new PublicKey(config.pumpFeesProgramId);

let signerKeypair: Keypair | null = null;

function getKeypair(): Keypair {
  if (signerKeypair) return signerKeypair;
  if (!config.deployerPrivateKey) {
    throw new Error('DEPLOYER_PRIVATE_KEY not set — cannot claim fees');
  }
  signerKeypair = Keypair.fromSecretKey(bs58.decode(config.deployerPrivateKey));
  console.log(`[claimer] signer wallet: ${signerKeypair.publicKey.toBase58()}`);
  return signerKeypair;
}

/**
 * Derive the PDA that PumpFees uses for fee accumulation.
 * Based on analyzing real claim txs, the PDA seems to be derived from
 * the SharingConfig address or mint. We try common seed patterns.
 */
async function findFeeAccount(sharingConfigAddr: PublicKey): Promise<PublicKey | null> {
  // Try to find PumpFees-owned accounts related to this SharingConfig
  // by checking known PDA derivations
  const seeds = [
    [sharingConfigAddr.toBytes()],
    [Buffer.from('fee'), sharingConfigAddr.toBytes()],
    [Buffer.from('claim'), sharingConfigAddr.toBytes()],
  ];

  for (const seed of seeds) {
    try {
      const [pda] = PublicKey.findProgramAddressSync(seed, PUMP_FEES_PROGRAM);
      const info = await connection.getAccountInfo(pda);
      if (info && info.owner.equals(PUMP_FEES_PROGRAM)) {
        return pda;
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Build the claim instruction based on the layout observed from real claim txs:
 * Accounts: [signer, feeWallet, systemProgram, sharingConfig, feePDA, pumpFeesProgram]
 * 
 * The instruction data discriminator needs to match. We extract it from known claim txs.
 */
async function buildClaimInstruction(
  signer: PublicKey,
  feeWallet: PublicKey,
  sharingConfigAddr: PublicKey,
): Promise<TransactionInstruction | null> {
  // Find the fee accumulation account (PDA)
  const feeAccount = await findFeeAccount(sharingConfigAddr);

  if (!feeAccount) {
    // Try without PDA — use just the SharingConfig
    // Some claim instructions might not need a separate fee account
    return null;
  }

  // Claim instruction data — discriminator from real tx
  // "gKcZsNUABfa6v2hUTdgm44A8mUsg6d" decoded from base58
  // We'll use the raw discriminator bytes
  const claimDiscriminator = bs58.decode('gKcZsNUABfa6v2hUTdgm44A8mUsg6d');

  return new TransactionInstruction({
    programId: PUMP_FEES_PROGRAM,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: feeWallet, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: sharingConfigAddr, isSigner: false, isWritable: true },
      { pubkey: feeAccount, isSigner: false, isWritable: true },
      { pubkey: PUMP_FEES_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(claimDiscriminator),
  });
}

async function claimForConfig(sharingConfigAddr: string, mint: string): Promise<boolean> {
  const keypair = getKeypair();
  const feeWallet = new PublicKey(config.feeWallet);
  const sharingConfigPubkey = new PublicKey(sharingConfigAddr);

  // Check if there's anything to claim by checking the SharingConfig balance
  const configInfo = await connection.getAccountInfo(sharingConfigPubkey);
  if (!configInfo) {
    console.log(`[claimer] SharingConfig ${sharingConfigAddr.slice(0, 10)}... not found`);
    return false;
  }

  const instruction = await buildClaimInstruction(
    keypair.publicKey,
    feeWallet,
    sharingConfigPubkey,
  );

  if (!instruction) {
    console.log(`[claimer] could not build claim instruction for ${mint.slice(0, 10)}...`);
    return false;
  }

  try {
    // Get balance before
    const balanceBefore = await connection.getBalance(feeWallet);

    // Build and send transaction
    const blockhash = await connection.getLatestBlockhash('confirmed');
    const message = new TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: blockhash.blockhash,
      instructions: [instruction],
    }).compileToV0Message();

    const tx = new VersionedTransaction(message);
    tx.sign([keypair]);

    const txSig = await withRetry(() =>
      connection.sendTransaction(tx, {
        skipPreflight: false,
        maxRetries: 3,
      }),
    );

    // Wait for confirmation
    await connection.confirmTransaction({
      signature: txSig,
      blockhash: blockhash.blockhash,
      lastValidBlockHeight: blockhash.lastValidBlockHeight,
    }, 'confirmed');

    // Check balance after
    const balanceAfter = await connection.getBalance(feeWallet);
    const claimed = (balanceAfter - balanceBefore) / LAMPORTS_PER_SOL;

    console.log(`[claimer] ✅ claimed ${claimed.toFixed(6)} SOL for mint ${mint.slice(0, 10)}... (tx: ${txSig.slice(0, 20)}...)`);
    return true;
  } catch (err: any) {
    // Don't log as error if it's just "nothing to claim"
    const msg = err?.message || String(err);
    if (msg.includes('custom program error') || msg.includes('InstructionError')) {
      console.log(`[claimer] nothing to claim for ${mint.slice(0, 10)}... (program error — likely zero balance)`);
    } else {
      console.error(`[claimer] failed to claim for ${mint.slice(0, 10)}...:`, msg);
    }
    return false;
  }
}

async function claimAll(): Promise<void> {
  const cache = getCacheByAddress();

  if (cache.size === 0) {
    console.log('[claimer] no SharingConfigs cached — refreshing...');
    await refreshCache();
  }

  const configs = getCacheByAddress();
  if (configs.size === 0) {
    console.log('[claimer] no SharingConfigs found where we are shareholder');
    return;
  }

  console.log(`[claimer] attempting claims for ${configs.size} token(s)...`);

  let claimed = 0;
  for (const [addr, cfg] of configs) {
    try {
      const success = await claimForConfig(addr, cfg.mint);
      if (success) claimed++;
    } catch (err) {
      console.error(`[claimer] error claiming ${cfg.mint.slice(0, 10)}...:`, err);
    }
    // Small delay between claims to avoid rate limits
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`[claimer] round complete — ${claimed}/${configs.size} claimed`);
}

export async function startClaimer(): Promise<void> {
  // Verify we have a key
  try {
    getKeypair();
  } catch (err: any) {
    console.warn(`[claimer] disabled: ${err.message}`);
    return;
  }

  console.log(`[claimer] claim interval: ${config.claimIntervalMs}ms`);

  // First claim immediately
  await claimAll();

  // Then on interval
  setInterval(() => {
    claimAll().catch(err => console.error('[claimer] unhandled:', err));
  }, config.claimIntervalMs);
}
