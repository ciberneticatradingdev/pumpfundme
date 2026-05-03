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
import crypto from 'crypto';
import { config } from './config';
import { getCacheByAddress, getCacheByMint, refreshCache } from './sharing-config-cache';
import { withRetry } from './utils';

const connection = new Connection(config.solanaRpcUrl, 'confirmed');
const PUMP_FUN_PROGRAM = new PublicKey(config.pumpFunProgramId);
const PUMP_FEES_PROGRAM = new PublicKey(config.pumpFeesProgramId);

const MIN_CLAIM_LAMPORTS = 20_000_000; // 0.02 SOL
const RENT_EXEMPT = 890_880;

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

function discriminator(name: string): Buffer {
  return crypto.createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

const DISTRIBUTE_CREATOR_FEES_DISC = discriminator('distribute_creator_fees');
const CLAIM_SOCIAL_FEE_PDA_DISC = discriminator('claim_social_fee_pda');

function getBondingCurvePDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mint.toBuffer()],
    PUMP_FUN_PROGRAM,
  );
  return pda;
}

function getCreatorVaultPDA(sharingConfig: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('creator-vault'), sharingConfig.toBuffer()],
    PUMP_FUN_PROGRAM,
  );
  return pda;
}

function getPumpFunEventAuthority(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('__event_authority')],
    PUMP_FUN_PROGRAM,
  );
  return pda;
}

function getPumpFeesEventAuthority(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('__event_authority')],
    PUMP_FEES_PROGRAM,
  );
  return pda;
}

export interface ClaimResult {
  mintAddress: string;
  txSignature: string;
  amountSol: number;
  success: boolean;
  error?: string;
}

export async function getCreatorVaultBalance(sharingConfigAddr: string): Promise<number> {
  const sharingConfig = new PublicKey(sharingConfigAddr);
  const creatorVault = getCreatorVaultPDA(sharingConfig);
  const balance = await connection.getBalance(creatorVault, 'confirmed');
  return Math.max(0, balance - RENT_EXEMPT);
}

export async function claimForMint(mintAddress: string, sharingConfigAddr: string): Promise<ClaimResult> {
  const keypair = getKeypair();
  const mint = new PublicKey(mintAddress);
  const sharingConfig = new PublicKey(sharingConfigAddr);
  const feeWallet = new PublicKey(config.feeWallet);
  const claimWallet = new PublicKey(config.claimWallet);
  const globalConfigPubkey = new PublicKey(config.globalConfig);

  // Check claimable balance before sending tx
  const claimableLamports = await getCreatorVaultBalance(sharingConfigAddr);
  if (claimableLamports < MIN_CLAIM_LAMPORTS) {
    const sol = claimableLamports / LAMPORTS_PER_SOL;
    return {
      mintAddress,
      txSignature: '',
      amountSol: 0,
      success: false,
      error: `Below minimum: ${sol.toFixed(6)} SOL (need 0.02 SOL)`,
    };
  }

  const bondingCurve = getBondingCurvePDA(mint);
  const creatorVault = getCreatorVaultPDA(sharingConfig);
  const pumpFunEventAuth = getPumpFunEventAuthority();
  const pumpFeesEventAuth = getPumpFeesEventAuthority();

  // Instruction 1: distribute_creator_fees (pump.fun) — moves SOL from creator vault → fee wallet
  const distributeIx = new TransactionInstruction({
    programId: PUMP_FUN_PROGRAM,
    keys: [
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: bondingCurve, isSigner: false, isWritable: true },
      { pubkey: sharingConfig, isSigner: false, isWritable: false },
      { pubkey: creatorVault, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: pumpFunEventAuth, isSigner: false, isWritable: false },
      { pubkey: PUMP_FUN_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: feeWallet, isSigner: false, isWritable: true },
    ],
    data: DISTRIBUTE_CREATOR_FEES_DISC,
  });

  // Instruction 2: claim_social_fee_pda (PumpFees) — moves SOL from fee wallet → claim wallet
  const claimIx = new TransactionInstruction({
    programId: PUMP_FEES_PROGRAM,
    keys: [
      { pubkey: claimWallet, isSigner: false, isWritable: true },
      { pubkey: feeWallet, isSigner: false, isWritable: true },
      { pubkey: globalConfigPubkey, isSigner: false, isWritable: false },
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: pumpFeesEventAuth, isSigner: false, isWritable: false },
      { pubkey: PUMP_FEES_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: CLAIM_SOCIAL_FEE_PDA_DISC,
  });

  try {
    const blockhash = await connection.getLatestBlockhash('confirmed');
    const message = new TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: blockhash.blockhash,
      instructions: [distributeIx, claimIx],
    }).compileToV0Message();

    const tx = new VersionedTransaction(message);
    tx.sign([keypair]);

    const txSig = await withRetry(() =>
      connection.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 }),
    );

    await connection.confirmTransaction(
      { signature: txSig, blockhash: blockhash.blockhash, lastValidBlockHeight: blockhash.lastValidBlockHeight },
      'confirmed',
    );

    const amountSol = claimableLamports / LAMPORTS_PER_SOL;
    console.log(`[claimer] ✅ claimed ${amountSol.toFixed(6)} SOL for mint ${mintAddress.slice(0, 10)}... tx: ${txSig.slice(0, 20)}...`);
    return { mintAddress, txSignature: txSig, amountSol, success: true };
  } catch (err: any) {
    const error = err?.message || String(err);
    console.error(`[claimer] failed to claim for ${mintAddress.slice(0, 10)}...:`, error);
    return { mintAddress, txSignature: '', amountSol: 0, success: false, error };
  }
}

export async function claimSingleToken(mintAddress: string): Promise<ClaimResult> {
  let cacheByMint = getCacheByMint();
  if (cacheByMint.size === 0) await refreshCache();
  cacheByMint = getCacheByMint();

  const sharingConfigAddr = cacheByMint.get(mintAddress);
  if (!sharingConfigAddr) {
    await refreshCache();
    const addr = getCacheByMint().get(mintAddress);
    if (!addr) {
      return {
        mintAddress,
        txSignature: '',
        amountSol: 0,
        success: false,
        error: `No SharingConfig found for mint ${mintAddress}`,
      };
    }
    return claimForMint(mintAddress, addr);
  }
  return claimForMint(mintAddress, sharingConfigAddr);
}

export async function claimAllTokens(): Promise<ClaimResult[]> {
  let cache = getCacheByAddress();
  if (cache.size === 0) {
    console.log('[claimer] no SharingConfigs cached — refreshing...');
    await refreshCache();
  }
  cache = getCacheByAddress();

  if (cache.size === 0) {
    console.log('[claimer] no SharingConfigs found where we are shareholder');
    return [];
  }

  console.log(`[claimer] attempting claims for ${cache.size} token(s)...`);

  const results: ClaimResult[] = [];
  for (const [addr, cfg] of cache) {
    try {
      const result = await claimForMint(cfg.mint, addr);
      results.push(result);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[claimer] error claiming ${cfg.mint.slice(0, 10)}...:`, error);
      results.push({ mintAddress: cfg.mint, txSignature: '', amountSol: 0, success: false, error });
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  const claimed = results.filter(r => r.success).length;
  console.log(`[claimer] round complete — ${claimed}/${cache.size} claimed`);
  return results;
}

export async function getVaultBalances(): Promise<Array<{ mintAddress: string; claimableLamports: number; claimableSol: number }>> {
  let cache = getCacheByAddress();
  if (cache.size === 0) await refreshCache();
  cache = getCacheByAddress();

  const results = [];
  for (const [addr, cfg] of cache) {
    try {
      const claimableLamports = await getCreatorVaultBalance(addr);
      results.push({
        mintAddress: cfg.mint,
        claimableLamports,
        claimableSol: claimableLamports / LAMPORTS_PER_SOL,
      });
    } catch (err) {
      results.push({ mintAddress: cfg.mint, claimableLamports: 0, claimableSol: 0 });
    }
  }
  return results;
}

export async function startClaimer(): Promise<void> {
  try {
    getKeypair();
  } catch (err: any) {
    console.warn(`[claimer] disabled: ${err.message}`);
    return;
  }

  console.log(`[claimer] claim interval: ${config.claimIntervalMs}ms`);

  await claimAllTokens();

  setInterval(() => {
    claimAllTokens().catch(err => console.error('[claimer] unhandled:', err));
  }, config.claimIntervalMs);
}
