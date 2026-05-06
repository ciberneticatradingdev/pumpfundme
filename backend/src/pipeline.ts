import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from './config';
import { db } from './db';
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
  solBalanceFeeWallet: number;
  usdtBalanceFeeWallet: number;
  usdtBalanceKolo: number;
  swapThresholdSol: number;
  pendingSwapSol: number;
  pendingTransferUsdt: number;
  lastRunAt: string | null;
  lastSwapAt: string | null;
  lastTransferAt: string | null;
}

let lastRunAt: Date | null = null;
let lastSwapAt: Date | null = null;
let lastTransferAt: Date | null = null;

/**
 * Calculate how much SOL from claims hasn't been swapped yet.
 * = sum(FEE_RECEIVED confirmed) - sum(SOL_SWAP confirmed)
 */
async function getPendingSwapSol(): Promise<number> {
  const [claimed, swapped] = await Promise.all([
    db.transaction.aggregate({
      where: { type: 'FEE_RECEIVED', status: 'CONFIRMED' },
      _sum: { amountSol: true },
    }),
    db.transaction.aggregate({
      where: { type: 'SOL_SWAP', status: 'CONFIRMED' },
      _sum: { amountSol: true },
    }),
  ]);

  const totalClaimed = claimed._sum.amountSol ?? 0;
  const totalSwapped = swapped._sum.amountSol ?? 0;
  return Math.max(0, totalClaimed - totalSwapped);
}

/**
 * Calculate how much USDT from swaps hasn't been transferred yet.
 * = sum(SOL_SWAP.amountUsd confirmed) - sum(USDT_TRANSFER.amountUsd confirmed)
 */
async function getPendingTransferUsdt(): Promise<number> {
  const [swapped, transferred] = await Promise.all([
    db.transaction.aggregate({
      where: { type: 'SOL_SWAP', status: 'CONFIRMED' },
      _sum: { amountUsd: true },
    }),
    db.transaction.aggregate({
      where: { type: 'USDT_TRANSFER', status: 'CONFIRMED' },
      _sum: { amountUsd: true },
    }),
  ]);

  const totalSwappedUsdt = swapped._sum.amountUsd ?? 0;
  const totalTransferred = transferred._sum.amountUsd ?? 0;
  return Math.max(0, totalSwappedUsdt - totalTransferred);
}

/**
 * Get current pipeline status — ledger-based + wallet balances + last run times.
 */
export async function getPipelineStatus(): Promise<PipelineStatus> {
  const keypair = getKeypair();
  const koloWallet = new PublicKey(config.koloWallet);

  const [solBalance, usdtFeeWallet, usdtKolo, pendingSwapSol, pendingTransferUsdt] = await Promise.all([
    connection.getBalance(keypair.publicKey, 'confirmed'),
    getSwapUsdtBalance(keypair.publicKey),
    getTransferUsdtBalance(koloWallet),
    getPendingSwapSol(),
    getPendingTransferUsdt(),
  ]);

  return {
    solBalanceFeeWallet: solBalance / LAMPORTS_PER_SOL,
    usdtBalanceFeeWallet: usdtFeeWallet,
    usdtBalanceKolo: usdtKolo,
    swapThresholdSol: config.swapThresholdSol,
    pendingSwapSol,
    pendingTransferUsdt,
    lastRunAt: lastRunAt?.toISOString() ?? null,
    lastSwapAt: lastSwapAt?.toISOString() ?? null,
    lastTransferAt: lastTransferAt?.toISOString() ?? null,
  };
}

/**
 * Run one pipeline cycle (LEDGER-BASED):
 * 1. Check how much SOL from claims hasn't been swapped → swap only that
 * 2. Check how much USDT from swaps hasn't been transferred → transfer only that
 */
async function runPipelineCycle(): Promise<void> {
  getKeypair();
  lastRunAt = new Date();

  console.log(`[pipeline] --- cycle start (ledger-based) ---`);

  // Step 1: How much claim SOL is pending swap?
  const pendingSol = await getPendingSwapSol();
  const pendingLamports = Math.floor(pendingSol * LAMPORTS_PER_SOL);
  const thresholdLamports = Math.floor(config.swapThresholdSol * LAMPORTS_PER_SOL);

  console.log(`[pipeline] pending swap from claims: ${pendingSol.toFixed(6)} SOL (threshold: ${config.swapThresholdSol})`);

  if (pendingLamports >= thresholdLamports) {
    // Verify we actually have enough SOL in wallet (claims - gas reserve)
    const keypair = getKeypair();
    const walletBalance = await connection.getBalance(keypair.publicKey, 'confirmed');
    const maxSwapLamports = walletBalance - GAS_RESERVE_LAMPORTS;

    // Swap the LESSER of: pending claim SOL or available wallet balance
    const swapLamports = Math.min(pendingLamports, maxSwapLamports);

    if (swapLamports < thresholdLamports) {
      console.log(`[pipeline] wallet balance too low for pending claims (wallet: ${(walletBalance / LAMPORTS_PER_SOL).toFixed(6)}, need: ${pendingSol.toFixed(6)} + gas)`);
    } else {
      const swapSol = swapLamports / LAMPORTS_PER_SOL;
      console.log(`[pipeline] swapping ${swapSol.toFixed(6)} SOL → USDT (from claims only)`);
      const swapResult = await swapSolToUsdt(swapLamports);
      if (swapResult.success) {
        lastSwapAt = new Date();
        console.log(`[pipeline] swap OK: ${swapResult.amountUsdt.toFixed(2)} USDT received`);
      } else {
        console.error(`[pipeline] swap failed: ${swapResult.error}`);
      }
    }
  } else {
    console.log(`[pipeline] below threshold — skipping swap`);
  }

  // Step 2: How much USDT from swaps is pending transfer?
  const pendingUsdt = await getPendingTransferUsdt();
  console.log(`[pipeline] pending transfer from swaps: ${pendingUsdt.toFixed(2)} USDT`);

  if (pendingUsdt > 0.01) { // min $0.01 to avoid dust transfers
    // Convert to raw amount (6 decimals)
    const rawAmount = Math.floor(pendingUsdt * 1_000_000);
    console.log(`[pipeline] transferring ${pendingUsdt.toFixed(2)} USDT → Kolo`);
    const transferResult = await transferUsdtToKolo(rawAmount);
    if (transferResult.success) {
      lastTransferAt = new Date();
      console.log(`[pipeline] transfer OK: ${transferResult.amountUsdt.toFixed(2)} USDT sent to Kolo`);
    } else {
      console.error(`[pipeline] transfer failed: ${transferResult.error}`);
    }
  } else {
    console.log(`[pipeline] no USDT pending transfer — skipping`);
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

  console.log(`[pipeline] mode: LEDGER-BASED (only swaps/transfers from recorded claims)`);
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
