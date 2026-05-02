import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  ConfirmedSignatureInfo,
} from '@solana/web3.js';
import { config } from './config';
import { db } from './db';
import { parseSharingConfig, sleep, withRetry } from './utils';

const connection = new Connection(config.solanaRpcUrl, 'confirmed');
const feeWalletPubkey = new PublicKey(config.feeWallet);
const pumpFeesProgramPubkey = new PublicKey(config.pumpFeesProgramId);

// In-memory cursor; bootstrapped from DB on startup so restarts don't reprocess
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
    console.log('[monitor] no prior FEE_RECEIVED transactions found — starting from latest');
  }
}

async function getMintForTx(txSignature: string): Promise<string | null> {
  const tx = await withRetry(() =>
    connection.getParsedTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    }),
  );
  if (!tx) return null;

  for (const acc of tx.transaction.message.accountKeys) {
    const info = await withRetry(() => connection.getAccountInfo(acc.pubkey));
    if (!info) continue;
    if (!info.owner.equals(pumpFeesProgramPubkey)) continue;
    const parsed = parseSharingConfig(info.data);
    if (parsed) return parsed.mint;
  }
  return null;
}

async function processSignature(sig: ConfirmedSignatureInfo): Promise<void> {
  const txSig = sig.signature;

  // Idempotency guard
  const existing = await db.transaction.findUnique({ where: { txSignature: txSig } });
  if (existing) {
    console.log(`[monitor] already processed: ${txSig}`);
    return;
  }

  // Fetch the full transaction to read balances
  const parsedTx = await withRetry(() =>
    connection.getParsedTransaction(txSig, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    }),
  );

  if (!parsedTx?.meta) {
    console.warn(`[monitor] no meta for tx ${txSig}, skipping`);
    return;
  }

  // Calculate SOL received by the fee wallet
  const accounts = parsedTx.transaction.message.accountKeys;
  const walletIndex = accounts.findIndex(a => a.pubkey.toBase58() === config.feeWallet);
  if (walletIndex === -1) {
    console.warn(`[monitor] fee wallet not found in tx ${txSig}, skipping`);
    return;
  }

  const pre = parsedTx.meta.preBalances[walletIndex];
  const post = parsedTx.meta.postBalances[walletIndex];
  const solReceived = (post - pre) / LAMPORTS_PER_SOL;

  if (solReceived <= 0) {
    console.log(`[monitor] tx ${txSig} not a SOL receive (Δ${solReceived.toFixed(6)} SOL), skipping`);
    return;
  }

  // Find the SharingConfig among the transaction accounts to get the token mint
  let mintAddress: string | null = null;
  for (const acc of accounts) {
    const info = await withRetry(() => connection.getAccountInfo(acc.pubkey));
    if (!info) continue;
    if (!info.owner.equals(pumpFeesProgramPubkey)) continue;
    const parsed = parseSharingConfig(info.data);
    if (parsed) {
      mintAddress = parsed.mint;
      break;
    }
  }

  if (!mintAddress) {
    console.warn(`[monitor] could not find SharingConfig in tx ${txSig} — no PumpFees account found`);
    return;
  }

  // Match mint → Token → Campaign
  const token = await db.token.findUnique({
    where: { mintAddress },
    include: { campaign: true },
  });

  if (!token) {
    console.log(`[monitor] mint ${mintAddress} not in DB (no campaign configured) — skipping`);
    return;
  }

  const blockTime = sig.blockTime ? new Date(sig.blockTime * 1000) : new Date();

  // Record Transaction + Event + increment campaign total — all atomically
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
        type: 'FEE_RECEIVED',
        campaignId: token.campaignId,
        message: `Received ${solReceived.toFixed(6)} SOL from pump.fun fees for "${token.campaign.name}"`,
        data: {
          txSignature: txSig,
          amountSol: solReceived,
          mintAddress,
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
    `[monitor] recorded ${solReceived.toFixed(6)} SOL → campaign "${token.campaign.name}" (tx: ${txSig})`,
  );
}

async function poll(): Promise<void> {
  console.log('[monitor] polling for new transactions...');

  try {
    // Signatures are returned newest-first; `until` excludes the cursor signature itself
    const signatures = await withRetry(() =>
      connection.getSignaturesForAddress(feeWalletPubkey, {
        until: lastSignature ?? undefined,
        limit: 100,
      }),
    );

    if (signatures.length === 0) {
      console.log('[monitor] no new transactions');
      return;
    }

    console.log(`[monitor] ${signatures.length} new signature(s) to process`);

    // Process oldest-first so lastSignature advances monotonically even on partial failures
    const ordered = [...signatures].reverse();
    for (const sig of ordered) {
      try {
        await processSignature(sig);
      } catch (err) {
        console.error(`[monitor] error processing ${sig.signature}:`, err);
      }
    }

    // Advance cursor to the newest signature we fetched
    lastSignature = signatures[0].signature;
    console.log(`[monitor] cursor advanced to: ${lastSignature}`);
  } catch (err) {
    console.error('[monitor] poll error:', err);
  }
}

export async function startMonitor(): Promise<void> {
  await initLastSignature();

  console.log(`[monitor] watching fee wallet: ${config.feeWallet}`);
  console.log(`[monitor] PumpFees program:    ${config.pumpFeesProgramId}`);
  console.log(`[monitor] poll interval:        ${config.pollIntervalMs}ms`);

  // First poll immediately, then on interval
  await poll();

  const interval = setInterval(() => {
    poll().catch(err => console.error('[monitor] unhandled poll error:', err));
  }, config.pollIntervalMs);

  // Keep the process alive
  interval.unref();
  await sleep(Number.MAX_SAFE_INTEGER);
}
