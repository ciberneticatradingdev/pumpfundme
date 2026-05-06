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
  pendingByCampaign: Array<{ campaignId: string; campaignName: string; pendingSol: number; ready: boolean }>;
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
 */
async function getPendingByCampaign(): Promise<CampaignPending[]> {
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

    if (pending > 0.000001) {
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
  const threshold = config.transferThresholdSol;

  const [solBalance, pending] = await Promise.all([
    connection.getBalance(keypair.publicKey, 'confirmed'),
    getPendingByCampaign(),
  ]);

  return {
    solBalanceFeeWallet: solBalance / LAMPORTS_PER_SOL,
    transferThresholdSol: threshold,
    pendingByCampaign: pending.map(p => ({
      campaignId: p.campaignId,
      campaignName: p.campaignName,
      pendingSol: p.pendingSol,
      ready: p.pendingSol >= threshold,
    })),
    totalPendingSol: pending.reduce((s, p) => s + p.pendingSol, 0),
    lastRunAt: lastRunAt?.toISOString() ?? null,
    lastTransferAt: lastTransferAt?.toISOString() ?? null,
  };
}

/**
 * Run one pipeline cycle:
 * 1. Calculate pending claims per campaign
 * 2. Filter: only campaigns that individually meet the threshold
 * 3. Send ONE on-chain tx for the sum of qualifying campaigns
 * 4. Create separate DB records per campaign for their exact share
 */
async function runPipelineCycle(): Promise<void> {
  getKeypair();
  lastRunAt = new Date();
  const threshold = config.transferThresholdSol;

  console.log(`[pipeline] --- cycle start ---`);

  // Step 1: Get pending per campaign
  const allPending = await getPendingByCampaign();

  if (allPending.length === 0) {
    console.log(`[pipeline] no pending claims — skipping`);
    console.log(`[pipeline] --- cycle end ---`);
    return;
  }

  // Step 2: Filter campaigns that meet the per-campaign threshold
  const ready: CampaignPending[] = [];
  const waiting: CampaignPending[] = [];

  for (const p of allPending) {
    if (p.pendingSol >= threshold) {
      ready.push(p);
      console.log(`[pipeline] ✅ ${p.campaignName}: ${p.pendingSol.toFixed(6)} SOL — READY`);
    } else {
      waiting.push(p);
      console.log(`[pipeline] ⏳ ${p.campaignName}: ${p.pendingSol.toFixed(6)} SOL — waiting (need ${threshold})`);
    }
  }

  if (ready.length === 0) {
    console.log(`[pipeline] no campaigns at threshold — skipping`);
    console.log(`[pipeline] --- cycle end ---`);
    return;
  }

  // Step 3: Calculate total to transfer (only ready campaigns)
  const totalSol = ready.reduce((s, p) => s + p.pendingSol, 0);
  const totalLamports = Math.floor(totalSol * LAMPORTS_PER_SOL);

  // Verify wallet balance
  const keypair = getKeypair();
  const walletBalance = await connection.getBalance(keypair.publicKey, 'confirmed');
  const maxSend = walletBalance - GAS_RESERVE_LAMPORTS;

  if (maxSend < Math.floor(threshold * LAMPORTS_PER_SOL)) {
    console.log(`[pipeline] wallet too low: ${(walletBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
    console.log(`[pipeline] --- cycle end ---`);
    return;
  }

  // Cap at wallet balance
  const transferLamports = Math.min(totalLamports, maxSend);

  // If wallet can't cover all ready campaigns, scale proportionally
  const scale = transferLamports < totalLamports ? transferLamports / totalLamports : 1;
  if (scale < 1) {
    console.log(`[pipeline] wallet covers ${(scale * 100).toFixed(1)}% — scaling`);
  }

  // Step 4: Send ONE on-chain transaction
  const transferSol = transferLamports / LAMPORTS_PER_SOL;
  console.log(`[pipeline] transferring ${transferSol.toFixed(6)} SOL → Kolo (${ready.length} campaign${ready.length > 1 ? 's' : ''})`);

  const result = await transferSolToKolo(transferLamports);

  if (!result.success) {
    console.error(`[pipeline] transfer failed: ${result.error}`);
    console.log(`[pipeline] --- cycle end ---`);
    return;
  }

  lastTransferAt = new Date();
  console.log(`[pipeline] transfer OK: ${result.amountSol.toFixed(6)} SOL ($${result.amountUsd.toFixed(2)})`);

  // Step 5: Create per-campaign DB records
  const actualScale = result.amountSol / totalSol;

  for (let i = 0; i < ready.length; i++) {
    const p = ready[i];
    const campSol = p.pendingSol * actualScale;
    const campUsd = campSol * result.solPrice;

    // First campaign uses the real txSignature, others get a suffixed version (unique constraint)
    const txSig = i === 0 ? result.txSignature : `${result.txSignature}-${p.campaignId.slice(-8)}`;

    await db.transaction.create({
      data: {
        type: 'USDT_TRANSFER',
        amountSol: campSol,
        amountUsd: campUsd,
        txSignature: txSig,
        status: 'CONFIRMED',
        campaignId: p.campaignId,
        metadata: {
          fromWallet: keypair.publicKey.toBase58(),
          toWallet: config.koloWallet,
          solPriceUsd: result.solPrice,
          transferType: 'SOL_DIRECT',
          campaignShare: p.pendingSol,
          totalTransferred: result.amountSol,
          ...(i > 0 ? { parentTxSignature: result.txSignature } : {}),
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

  console.log(`[pipeline] mode: SOL DIRECT — per-campaign threshold (${config.transferThresholdSol} SOL each)`);
  console.log(`[pipeline] interval: ${config.pipelineIntervalMs}ms | kolo: ${config.koloWallet.slice(0, 10)}...`);

  try {
    await runPipelineCycle();
  } catch (err) {
    console.error('[pipeline] first cycle failed:', err);
  }

  setInterval(() => {
    runPipelineCycle().catch(err => console.error('[pipeline] unhandled:', err));
  }, config.pipelineIntervalMs);
}
