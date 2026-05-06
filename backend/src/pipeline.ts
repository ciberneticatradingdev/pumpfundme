import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from './config';
import { db } from './db';
import { transferSolToKolo } from './kolo-transfer';

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
  solBalanceKolo: number;
  transferThresholdSol: number;
  availableToTransfer: number;
  lastRunAt: string | null;
  lastTransferAt: string | null;
}

let lastRunAt: Date | null = null;
let lastTransferAt: Date | null = null;

/**
 * Get current pipeline status.
 */
export async function getPipelineStatus(): Promise<PipelineStatus> {
  const keypair = getKeypair();
  const koloWallet = new PublicKey(config.koloWallet);

  const [solBalance, koloBalance] = await Promise.all([
    connection.getBalance(keypair.publicKey, 'confirmed'),
    connection.getBalance(koloWallet, 'confirmed'),
  ]);

  const available = Math.max(0, solBalance - GAS_RESERVE_LAMPORTS) / LAMPORTS_PER_SOL;

  return {
    solBalanceFeeWallet: solBalance / LAMPORTS_PER_SOL,
    solBalanceKolo: koloBalance / LAMPORTS_PER_SOL,
    transferThresholdSol: config.swapThresholdSol,
    availableToTransfer: available,
    lastRunAt: lastRunAt?.toISOString() ?? null,
    lastTransferAt: lastTransferAt?.toISOString() ?? null,
  };
}

/**
 * Get the primary campaign for pending claims.
 */
async function getPrimaryCampaignForPendingClaims(): Promise<string | undefined> {
  const result = await db.transaction.groupBy({
    by: ['campaignId'],
    where: { type: 'FEE_RECEIVED', status: 'CONFIRMED', campaignId: { not: null as unknown as undefined } },
    _sum: { amountSol: true },
    orderBy: { _sum: { amountSol: 'desc' } },
    take: 1,
  });
  return (result[0]?.campaignId as string) ?? undefined;
}

/**
 * Run one pipeline cycle:
 * Simple: if wallet has SOL above threshold (after gas reserve) → send it to Kolo.
 * No ledger math for amounts — wallet balance is the source of truth.
 */
async function runPipelineCycle(): Promise<void> {
  const keypair = getKeypair();
  lastRunAt = new Date();

  console.log(`[pipeline] --- cycle start ---`);

  const campaignId = await getPrimaryCampaignForPendingClaims();
  if (campaignId) {
    console.log(`[pipeline] primary campaign: ${campaignId}`);
  }

  // Check actual wallet balance
  const walletBalance = await connection.getBalance(keypair.publicKey, 'confirmed');
  const availableLamports = walletBalance - GAS_RESERVE_LAMPORTS;
  const availableSol = availableLamports / LAMPORTS_PER_SOL;
  const thresholdLamports = Math.floor(config.swapThresholdSol * LAMPORTS_PER_SOL);

  console.log(`[pipeline] wallet: ${(walletBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL | available: ${availableSol.toFixed(6)} SOL (threshold: ${config.swapThresholdSol})`);

  if (availableLamports >= thresholdLamports) {
    console.log(`[pipeline] transferring ${availableSol.toFixed(6)} SOL → Kolo`);
    const result = await transferSolToKolo(availableLamports, campaignId);
    if (result.success) {
      lastTransferAt = new Date();
      console.log(`[pipeline] transfer OK: ${result.amountSol.toFixed(6)} SOL ($${result.amountUsd.toFixed(2)})`);
    } else {
      console.error(`[pipeline] transfer failed: ${result.error}`);
    }
  } else {
    console.log(`[pipeline] below threshold — skipping`);
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

  console.log(`[pipeline] mode: SOL DIRECT (wallet balance → Kolo)`);
  console.log(`[pipeline] interval: ${config.pipelineIntervalMs}ms | threshold: ${config.swapThresholdSol} SOL | kolo: ${config.koloWallet.slice(0, 10)}...`);

  try {
    await runPipelineCycle();
  } catch (err) {
    console.error('[pipeline] first cycle failed:', err);
  }

  setInterval(() => {
    runPipelineCycle().catch(err => console.error('[pipeline] unhandled:', err));
  }, config.pipelineIntervalMs);
}
