import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from './config';
import { db } from './db';
import { transferSolToKolo } from './kolo-transfer';

const connection = new Connection(config.solanaRpcUrl, 'confirmed');

const GAS_RESERVE_LAMPORTS = 10_000_000; // 0.01 SOL

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
  transferThresholdSol: number;
  pendingByCampaign: Array<{ campaignId: string; pendingSol: number }>;
  totalPendingSol: number;
  lastRunAt: string | null;
  lastTransferAt: string | null;
}

let lastRunAt: Date | null = null;
let lastTransferAt: Date | null = null;

interface CampaignPending {
  campaignId: string;
  campaignName: string;
  pendingSol: number;
}

/**
 * Calculate pending (un-transferred) SOL per campaign.
 *
 * For each campaign:
 *   pending = sum(FEE_RECEIVED.amountSol) - sum(SOL_SWAP.amountSol) - sum(USDT_TRANSFER.amountSol)
 *
 * This handles:
 * - Old system: SOL_SWAP records offset the claimed SOL
 * - New system: USDT_TRANSFER records (with amountSol > 0) offset claimed SOL
 * - Corrections: negative USDT_TRANSFER.amountSol reduces the handled total
 */
async function getPendingByCampaign(): Promise<CampaignPending[]> {
  // Get all campaigns that have claims
  const campaigns = await db.transaction.groupBy({
    by: ['campaignId'],
    where: { type: 'FEE_RECEIVED', status: 'CONFIRMED', campaignId: { not: null as unknown as undefined } },
    _sum: { amountSol: true },
  });

  const result: CampaignPending[] = [];

  for (const camp of campaigns) {
    const campaignId = camp.campaignId as string;
    if (!campaignId) continue;

    const claimed = camp._sum.amountSol ?? 0;

    // Get SOL already handled (swaps + transfers, including corrections)
    const [swapped, transferred] = await Promise.all([
      db.transaction.aggregate({
        where: { type: 'SOL_SWAP', status: 'CONFIRMED', campaignId },
        _sum: { amountSol: true },
      }),
      db.transaction.aggregate({
        where: { type: 'USDT_TRANSFER', status: 'CONFIRMED', campaignId },
        _sum: { amountSol: true },
      }),
    ]);

    const handled = (swapped._sum.amountSol ?? 0) + (transferred._sum.amountSol ?? 0);
    const pending = Math.max(0, claimed - handled);

    if (pending > 0.000001) { // ignore dust
      // Get campaign name for logging
      const campaign = await db.campaign.findUnique({
        where: { id: campaignId },
        select: { name: true },
      });

      result.push({
        campaignId,
        campaignName: campaign?.name ?? 'Unknown',
        pendingSol: pending,
      });
    }
  }

  return result;
}

/**
 * Get current pipeline status.
 */
export async function getPipelineStatus(): Promise<PipelineStatus> {
  const keypair = getKeypair();

  const [solBalance, pending] = await Promise.all([
    connection.getBalance(keypair.publicKey, 'confirmed'),
    getPendingByCampaign(),
  ]);

  return {
    solBalanceFeeWallet: solBalance / LAMPORTS_PER_SOL,
    transferThresholdSol: config.swapThresholdSol,
    pendingByCampaign: pending.map(p => ({ campaignId: p.campaignId, pendingSol: p.pendingSol })),
    totalPendingSol: pending.reduce((s, p) => s + p.pendingSol, 0),
    lastRunAt: lastRunAt?.toISOString() ?? null,
    lastTransferAt: lastTransferAt?.toISOString() ?? null,
  };
}

/**
 * Run one pipeline cycle:
 * 1. Calculate pending claims per campaign
 * 2. If total pending ≥ threshold → send ONE on-chain tx for the total
 * 3. Create separate DB records per campaign for their exact share
 */
async function runPipelineCycle(): Promise<void> {
  getKeypair();
  lastRunAt = new Date();

  console.log(`[pipeline] --- cycle start ---`);

  // Step 1: Get pending per campaign
  const pending = await getPendingByCampaign();
  const totalPendingSol = pending.reduce((s, p) => s + p.pendingSol, 0);
  const totalPendingLamports = Math.floor(totalPendingSol * LAMPORTS_PER_SOL);
  const thresholdLamports = Math.floor(config.swapThresholdSol * LAMPORTS_PER_SOL);

  if (pending.length === 0) {
    console.log(`[pipeline] no pending claims — skipping`);
    console.log(`[pipeline] --- cycle end ---`);
    return;
  }

  for (const p of pending) {
    console.log(`[pipeline] pending: ${p.campaignName} → ${p.pendingSol.toFixed(6)} SOL`);
  }
  console.log(`[pipeline] total pending: ${totalPendingSol.toFixed(6)} SOL (threshold: ${config.swapThresholdSol})`);

  if (totalPendingLamports < thresholdLamports) {
    console.log(`[pipeline] below threshold — skipping`);
    console.log(`[pipeline] --- cycle end ---`);
    return;
  }

  // Step 2: Verify wallet balance covers the pending amount
  const keypair = getKeypair();
  const walletBalance = await connection.getBalance(keypair.publicKey, 'confirmed');
  const maxSend = walletBalance - GAS_RESERVE_LAMPORTS;

  if (maxSend < thresholdLamports) {
    console.log(`[pipeline] wallet too low: ${(walletBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL (need ${totalPendingSol.toFixed(6)} + gas)`);
    console.log(`[pipeline] --- cycle end ---`);
    return;
  }

  // Cap at wallet balance if pending exceeds it (shouldn't happen normally)
  const transferLamports = Math.min(totalPendingLamports, maxSend);
  const transferSol = transferLamports / LAMPORTS_PER_SOL;

  // If wallet can't cover all pending, scale each campaign proportionally
  const scale = transferLamports < totalPendingLamports
    ? transferLamports / totalPendingLamports
    : 1;

  if (scale < 1) {
    console.log(`[pipeline] wallet can only cover ${(scale * 100).toFixed(1)}% of pending — scaling proportionally`);
  }

  // Step 3: Send ONE on-chain transaction
  console.log(`[pipeline] transferring ${transferSol.toFixed(6)} SOL → Kolo`);
  const result = await transferSolToKolo(transferLamports);

  if (!result.success) {
    console.error(`[pipeline] transfer failed: ${result.error}`);
    console.log(`[pipeline] --- cycle end ---`);
    return;
  }

  lastTransferAt = new Date();
  console.log(`[pipeline] transfer OK: ${result.amountSol.toFixed(6)} SOL ($${result.amountUsd.toFixed(2)})`);

  // Step 4: Create per-campaign DB records
  // Use actual transferred amount and scale if needed
  const actualScale = result.amountSol / totalPendingSol;

  for (const p of pending) {
    const campSol = p.pendingSol * actualScale;
    const campUsd = campSol * result.solPrice;

    try {
      await db.transaction.create({
        data: {
          type: 'USDT_TRANSFER',
          amountSol: campSol,
          amountUsd: campUsd,
          txSignature: result.txSignature,
          status: 'CONFIRMED',
          campaignId: p.campaignId,
          metadata: {
            fromWallet: keypair.publicKey.toBase58(),
            toWallet: config.koloWallet,
            solPriceUsd: result.solPrice,
            transferType: 'SOL_DIRECT',
            campaignShare: p.pendingSol,
            totalTransferred: result.amountSol,
          },
        } as any,
      });

      await db.event.create({
        data: {
          type: 'sol_transfer',
          campaignId: p.campaignId,
          message: `Transferred ${campSol.toFixed(6)} SOL ($${campUsd.toFixed(2)}) to Kolo wallet`,
          data: {
            txSignature: result.txSignature,
            amountSol: campSol,
            amountUsd: campUsd,
            solPriceUsd: result.solPrice,
          },
        },
      });

      console.log(`[pipeline] ✅ ${p.campaignName}: ${campSol.toFixed(6)} SOL ($${campUsd.toFixed(2)})`);
    } catch (err) {
      // txSignature unique constraint — if multiple campaigns share same tx, append campaign suffix
      const uniqueSig = `${result.txSignature}-${p.campaignId.slice(-8)}`;
      await db.transaction.create({
        data: {
          type: 'USDT_TRANSFER',
          amountSol: campSol,
          amountUsd: campUsd,
          txSignature: uniqueSig,
          status: 'CONFIRMED',
          campaignId: p.campaignId,
          metadata: {
            fromWallet: keypair.publicKey.toBase58(),
            toWallet: config.koloWallet,
            solPriceUsd: result.solPrice,
            transferType: 'SOL_DIRECT',
            campaignShare: p.pendingSol,
            totalTransferred: result.amountSol,
            parentTxSignature: result.txSignature,
          },
        } as any,
      });

      await db.event.create({
        data: {
          type: 'sol_transfer',
          campaignId: p.campaignId,
          message: `Transferred ${campSol.toFixed(6)} SOL ($${campUsd.toFixed(2)}) to Kolo wallet`,
          data: {
            txSignature: result.txSignature,
            amountSol: campSol,
            amountUsd: campUsd,
            solPriceUsd: result.solPrice,
          },
        },
      });

      console.log(`[pipeline] ✅ ${p.campaignName}: ${campSol.toFixed(6)} SOL ($${campUsd.toFixed(2)})`);
    }
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

  console.log(`[pipeline] mode: SOL DIRECT — per-campaign attribution`);
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
