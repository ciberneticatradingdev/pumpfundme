import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  ConfirmedSignatureInfo,
} from '@solana/web3.js';
import { config } from './config';
import { db } from './db';
import { sleep, withRetry } from './utils';
import { refreshCache, findMintFromTxAccounts, needsRefresh } from './sharing-config-cache';

const connection = new Connection(config.solanaRpcUrl, 'confirmed');
const feeWalletPubkey = new PublicKey(config.feeWallet);
const pumpFunProgramId = config.pumpFunProgramId;

let lastSignature: string | null = null;

async function initLastSignature(): Promise<void> {
  const recent = await db.transaction.findFirst({
    where: { type: 'FEE_RECEIVED', txSignature: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { txSignature: true },
  });
  lastSignature = recent?.txSignature ?? null;
  if (lastSignature) {
    console.log(`[monitor] resuming after signature: ${lastSignature}`);
  } else {
    console.log('[monitor] no prior FEE_RECEIVED transactions — starting from latest');
  }
}

async function processSignature(sig: ConfirmedSignatureInfo): Promise<void> {
  const txSig = sig.signature;

  // Idempotency guard
  const existing = await db.transaction.findUnique({ where: { txSignature: txSig } });
  if (existing) {
    console.log(`[monitor] already processed: ${txSig.slice(0, 20)}...`);
    return;
  }

  const parsedTx = await withRetry(() =>
    connection.getParsedTransaction(txSig, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    }),
  );

  if (!parsedTx?.meta) {
    console.warn(`[monitor] no meta for tx ${txSig.slice(0, 20)}..., skipping`);
    return;
  }

  // Calculate SOL received by the fee wallet
  const accounts = parsedTx.transaction.message.accountKeys;
  const walletIndex = accounts.findIndex(a => a.pubkey.toBase58() === config.feeWallet);
  if (walletIndex === -1) {
    console.warn(`[monitor] fee wallet not in tx ${txSig.slice(0, 20)}..., skipping`);
    return;
  }

  const pre = parsedTx.meta.preBalances[walletIndex];
  const post = parsedTx.meta.postBalances[walletIndex];
  const solReceived = (post - pre) / LAMPORTS_PER_SOL;

  if (solReceived <= 0) {
    console.log(`[monitor] tx ${txSig.slice(0, 20)}... not a receive (Δ${solReceived.toFixed(6)}), skipping`);
    return;
  }

  // Check if this tx involves pump.fun program (distribute_creator_fees is on pump.fun, not pumpFees)
  const isPumpFunTx = accounts.some(a => a.pubkey.toBase58() === pumpFunProgramId);
  if (!isPumpFunTx) {
    console.log(`[monitor] tx ${txSig.slice(0, 20)}... received ${solReceived.toFixed(6)} SOL but not from pump.fun, skipping`);
    return;
  }

  // Find the mint by matching tx accounts against our SharingConfig cache
  const accountKeys = accounts.map(a => a.pubkey.toBase58());
  let mintAddress = findMintFromTxAccounts(accountKeys);

  if (!mintAddress) {
    // If cache miss, try refreshing and matching again
    console.log(`[monitor] cache miss for tx ${txSig.slice(0, 20)}..., refreshing cache...`);
    await refreshCache();
    mintAddress = findMintFromTxAccounts(accountKeys);
  }

  if (!mintAddress) {
    console.warn(`[monitor] could not determine mint for claim tx ${txSig.slice(0, 20)}... — no matching SharingConfig`);
    // Still record as unmatched for visibility
    await db.event.create({
      data: {
        type: 'fee_received',
        message: `Received ${solReceived.toFixed(6)} SOL from PumpFees but could not match to a campaign`,
        data: { txSignature: txSig, amountSol: solReceived, accountKeys },
      },
    });
    return;
  }

  // Match mint → Token → Campaign
  const token = await db.token.findUnique({
    where: { mintAddress },
    include: { campaign: true },
  });

  if (!token) {
    console.log(`[monitor] mint ${mintAddress.slice(0, 10)}... not registered to any campaign — skipping`);
    return;
  }

  const blockTime = sig.blockTime ? new Date(sig.blockTime * 1000) : new Date();

  // Record Transaction + Event + update campaign total — atomically
  await db.$transaction(async (ctx) => {
    const recorded = await ctx.transaction.create({
      data: {
        type: 'FEE_RECEIVED',
        campaignId: token.campaignId,
        tokenId: token.id,
        amountSol: solReceived,
        txSignature: txSig,
        status: 'CONFIRMED',
        metadata: {
          blockTime: blockTime.toISOString(),
          slot: sig.slot,
          mint: mintAddress,
        },
      },
    });

    await ctx.event.create({
      data: {
        type: 'fee_received',
        campaignId: token.campaignId,
        message: `Received ${solReceived.toFixed(6)} SOL from pump.fun fees for "${token.campaign.name}"`,
        data: {
          txSignature: txSig,
          amountSol: solReceived,
          mintAddress,
          tokenSymbol: token.symbol,
          transactionId: recorded.id,
        },
      },
    });

    await ctx.campaign.update({
      where: { id: token.campaignId },
      data: { totalSolReceived: { increment: solReceived } },
    });
  });

  console.log(
    `[monitor] ✅ ${solReceived.toFixed(6)} SOL → "${token.campaign.name}" (${token.symbol || mintAddress.slice(0, 10)}) tx: ${txSig.slice(0, 20)}...`,
  );
}

async function poll(): Promise<void> {
  try {
    // Refresh cache if stale
    if (needsRefresh()) {
      await refreshCache();
    }

    const signatures = await withRetry(() =>
      connection.getSignaturesForAddress(feeWalletPubkey, {
        until: lastSignature ?? undefined,
        limit: 100,
      }),
    );

    if (signatures.length === 0) return;

    console.log(`[monitor] ${signatures.length} new signature(s)`);

    // Process oldest-first
    const ordered = [...signatures].reverse();
    for (const sig of ordered) {
      try {
        await processSignature(sig);
      } catch (err) {
        console.error(`[monitor] error processing ${sig.signature.slice(0, 20)}...:`, err);
      }
    }

    // Advance cursor to newest
    lastSignature = signatures[0].signature;
  } catch (err) {
    console.error('[monitor] poll error:', err);
  }
}

export async function startMonitor(): Promise<void> {
  console.log(`[monitor] fee wallet: ${config.feeWallet}`);
  console.log(`[monitor] poll interval: ${config.pollIntervalMs}ms`);

  // Init cache + cursor
  await refreshCache();
  await initLastSignature();

  // First poll immediately
  await poll();

  // Then on interval
  setInterval(() => {
    poll().catch(err => console.error('[monitor] unhandled:', err));
  }, config.pollIntervalMs);
}
