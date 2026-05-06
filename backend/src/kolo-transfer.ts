import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from './config';
import { db } from './db';
import { withRetry } from './utils';

const connection = new Connection(config.solanaRpcUrl, 'confirmed');

export interface TransferResult {
  success: boolean;
  txSignature: string;
  amountSol: number;
  amountUsd: number;
  error?: string;
}

let signerKeypair: Keypair | null = null;

function getKeypair(): Keypair {
  if (signerKeypair) return signerKeypair;
  if (!config.deployerPrivateKey) {
    throw new Error('DEPLOYER_PRIVATE_KEY not set — cannot transfer');
  }
  signerKeypair = Keypair.fromSecretKey(bs58.decode(config.deployerPrivateKey));
  return signerKeypair;
}

/**
 * Fetch current SOL price in USD.
 * Tries CoinGecko first, falls back to Jupiter quote.
 */
async function getSolPriceUsd(): Promise<number> {
  // Try CoinGecko
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    if (res.ok) {
      const data = await res.json() as { solana?: { usd?: number } };
      const price = data.solana?.usd ?? 0;
      if (price > 0) return price;
    }
  } catch {}

  // Fallback: Jupiter quote (1 SOL → USDC)
  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const res = await fetch(
    `https://api.jup.ag/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=${USDC_MINT}&amount=1000000000&slippageBps=50`
  );
  if (!res.ok) throw new Error(`All price sources failed (Jupiter quote: ${res.status})`);
  const data = await res.json() as { outAmount?: string };
  const price = parseInt(data.outAmount ?? '0', 10) / 1_000_000;
  if (price <= 0) throw new Error('Invalid SOL price from Jupiter quote');
  return price;
}

/**
 * Transfer SOL from fee wallet → Kolo wallet.
 * Records the USD value at transfer time.
 *
 * @param amountLamports - amount to transfer; if omitted, sends all available minus gas reserve
 */
export async function transferSolToKolo(amountLamports?: number, campaignId?: string): Promise<TransferResult> {
  const keypair = getKeypair();
  const koloWallet = new PublicKey(config.koloWallet);
  const GAS_RESERVE = 10_000_000; // 0.01 SOL

  try {
    const walletBalance = await connection.getBalance(keypair.publicKey, 'confirmed');

    if (!amountLamports) {
      amountLamports = walletBalance - GAS_RESERVE;
    }

    // Cap at what we actually have (minus gas)
    const maxSend = walletBalance - GAS_RESERVE;
    if (amountLamports > maxSend) {
      console.log(`[transfer] capping: requested ${amountLamports} but max sendable is ${maxSend} lamports`);
      amountLamports = maxSend;
    }

    if (amountLamports <= 0) {
      return { success: false, txSignature: '', amountSol: 0, amountUsd: 0, error: 'No SOL to transfer' };
    }

    const amountSol = amountLamports / LAMPORTS_PER_SOL;

    // Get current SOL price
    const solPrice = await withRetry(() => getSolPriceUsd(), 3, 500);
    const amountUsd = amountSol * solPrice;

    console.log(`[transfer] sending ${amountSol.toFixed(6)} SOL ($${amountUsd.toFixed(2)} @ $${solPrice.toFixed(2)}/SOL) → Kolo (${config.koloWallet.slice(0, 10)}...)`);

    const instruction = SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: koloWallet,
      lamports: amountLamports,
    });

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const message = new TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: blockhash,
      instructions: [instruction],
    }).compileToV0Message();

    const tx = new VersionedTransaction(message);
    tx.sign([keypair]);

    const txSignature = await withRetry(() =>
      connection.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 }),
    );

    await connection.confirmTransaction(
      { signature: txSignature, blockhash, lastValidBlockHeight },
      'confirmed',
    );

    console.log(`[transfer] ✅ sent ${amountSol.toFixed(6)} SOL ($${amountUsd.toFixed(2)}) → Kolo | tx: ${txSignature.slice(0, 20)}...`);

    // Log to DB — record as USD value at transfer time
    await db.transaction.create({
      data: {
        type: 'USDT_TRANSFER',
        amountSol,
        amountUsd: amountUsd,
        txSignature,
        status: 'CONFIRMED',
        ...(campaignId ? { campaignId } : {}),
        metadata: {
          fromWallet: keypair.publicKey.toBase58(),
          toWallet: config.koloWallet,
          amountLamports,
          solPriceUsd: solPrice,
          transferType: 'SOL_DIRECT',
        },
      } as any,
    });

    await db.event.create({
      data: {
        type: 'sol_transfer',
        message: `Transferred ${amountSol.toFixed(6)} SOL ($${amountUsd.toFixed(2)}) to Kolo wallet`,
        ...(campaignId ? { campaignId } : {}),
        data: {
          txSignature,
          amountSol,
          amountUsd,
          solPriceUsd: solPrice,
          fromWallet: keypair.publicKey.toBase58(),
          toWallet: config.koloWallet,
        },
      },
    });

    return { success: true, txSignature, amountSol, amountUsd };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[transfer] ❌ failed:`, error);
    return { success: false, txSignature: '', amountSol: 0, amountUsd: 0, error };
  }
}
