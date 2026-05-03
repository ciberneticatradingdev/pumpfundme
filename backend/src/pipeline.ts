import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from './config';
import { swapSolToUsdt, getUsdtBalance as getSwapUsdtBalance } from './jupiter-swap';
import { transferUsdtToKolo, getUsdtBalance as getTransferUsdtBalance } from './kolo-transfer';

const connection = new Connection(config.solanaRpcUrl, 'confirmed');

const GAS_RESERVE_LAMPORTS = 10_000_000; // 0.01 SOL reserved for transaction fees

let signerKeypair: Keypair | null = null;

function getKeypair(): Keypair {
  if (signerKeypair) return signerKeypair;
  if (!config.deployerPrivateKey) {
    throw new Error('DEPLOYER_PRIVATE_KEY not set — cannot run pipeline');
  }
  signerKeypair = Keypair.fromSecretKey(bs58.decode(config.deployerPrivateKey));
  return signerKeypair;
}

export interface PipelineStatus {
  solBalanceHrA44R: number;
  usdtBalanceHrA44R: number;
  usdtBalanceKolo: number;
  swapThresholdSol: number;
  lastRunAt: string | null;
  lastSwapAt: string | null;
  lastTransferAt: string | null;
}

let lastRunAt: Date | null = null;
let lastSwapAt: Date | null = null;
let lastTransferAt: Date | null = null;

/**
 * Get current pipeline status — balances + last run times.
 */
export async function getPipelineStatus(): Promise<PipelineStatus> {
  const keypair = getKeypair();
  const koloWallet = new PublicKey(config.koloWallet);

  const solBalance = await connection.getBalance(keypair.publicKey, 'confirmed');
  const usdtHrA44R = await getSwapUsdtBalance(keypair.publicKey);
  const usdtKolo = await getTransferUsdtBalance(koloWallet);

  return {
    solBalanceHrA44R: solBalance / LAMPORTS_PER_SOL,
    usdtBalanceHrA44R: usdtHrA44R,
    usdtBalanceKolo: usdtKolo,
    swapThresholdSol: config.swapThresholdSol,
    lastRunAt: lastRunAt?.toISOString() ?? null,
    lastSwapAt: lastSwapAt?.toISOString() ?? null,
    lastTransferAt: lastTransferAt?.toISOString() ?? null,
  };
}

/**
 * Run one pipeline cycle:
 * 1. Check SOL balance → swap to USDT if above threshold
 * 2. Check USDT balance → transfer to Kolo if > 0
 */
async function runPipelineCycle(): Promise<void> {
  const keypair = getKeypair();
  lastRunAt = new Date();

  console.log(`[pipeline] --- cycle start ---`);

  // Step 1: Check SOL balance and swap if enough
  const solBalance = await connection.getBalance(keypair.publicKey, 'confirmed');
  const availableLamports = solBalance - GAS_RESERVE_LAMPORTS;
  const availableSol = availableLamports / LAMPORTS_PER_SOL;
  const thresholdLamports = config.swapThresholdSol * LAMPORTS_PER_SOL;

  console.log(`[pipeline] SOL balance: ${(solBalance / LAMPORTS_PER_SOL).toFixed(6)} (available: ${availableSol.toFixed(6)}, threshold: ${config.swapThresholdSol})`);

  if (availableLamports >= thresholdLamports) {
    console.log(`[pipeline] above threshold — swapping ${availableSol.toFixed(6)} SOL → USDT`);
    const swapResult = await swapSolToUsdt(availableLamports);
    if (swapResult.success) {
      lastSwapAt = new Date();
      console.log(`[pipeline] swap OK: ${swapResult.amountUsdt.toFixed(2)} USDT received`);
    } else {
      console.error(`[pipeline] swap failed: ${swapResult.error}`);
      // Don't return — still try to transfer any existing USDT
    }
  } else {
    console.log(`[pipeline] below threshold — skipping swap`);
  }

  // Step 2: Check USDT balance and transfer to Kolo
  const usdtBalance = await getSwapUsdtBalance(keypair.publicKey);
  console.log(`[pipeline] USDT balance in HrA44R: ${usdtBalance.toFixed(2)}`);

  if (usdtBalance > 0) {
    console.log(`[pipeline] transferring ${usdtBalance.toFixed(2)} USDT → Kolo`);
    const transferResult = await transferUsdtToKolo();
    if (transferResult.success) {
      lastTransferAt = new Date();
      console.log(`[pipeline] transfer OK: ${transferResult.amountUsdt.toFixed(2)} USDT sent to Kolo`);
    } else {
      console.error(`[pipeline] transfer failed: ${transferResult.error}`);
    }
  } else {
    console.log(`[pipeline] no USDT to transfer — skipping`);
  }

  console.log(`[pipeline] --- cycle end ---`);
}

/**
 * Start the pipeline: run immediately, then on interval.
 */
export async function startPipeline(): Promise<void> {
  try {
    getKeypair();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[pipeline] disabled: ${msg}`);
    return;
  }

  console.log(`[pipeline] interval: ${config.pipelineIntervalMs}ms | threshold: ${config.swapThresholdSol} SOL | kolo: ${config.koloWallet.slice(0, 10)}...`);

  // Run first cycle
  try {
    await runPipelineCycle();
  } catch (err) {
    console.error('[pipeline] first cycle failed:', err);
  }

  // Then on interval
  setInterval(() => {
    runPipelineCycle().catch(err => console.error('[pipeline] unhandled:', err));
  }, config.pipelineIntervalMs);
}
