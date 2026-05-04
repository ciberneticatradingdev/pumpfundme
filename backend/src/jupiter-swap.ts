import {
  Connection,
  Keypair,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { config } from './config';
import { db } from './db';
import { withRetry } from './utils';

const connection = new Connection(config.solanaRpcUrl, 'confirmed');

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDT_MINT = new PublicKey(config.usdtMint);
const USDT_DECIMALS = 6;

const JUPITER_QUOTE_URL = 'https://api.jup.ag/swap/v1/quote';
const JUPITER_SWAP_URL = 'https://api.jup.ag/swap/v1/swap';

interface JupiterQuote {
  outAmount: string;
  routePlan?: Array<{ swapInfo?: { label?: string } }>;
}

interface JupiterSwap {
  swapTransaction: string;
}

export interface SwapResult {
  success: boolean;
  txSignature: string;
  amountSol: number;
  amountUsdt: number;
  error?: string;
}

let signerKeypair: Keypair | null = null;

function getKeypair(): Keypair {
  if (signerKeypair) return signerKeypair;
  if (!config.deployerPrivateKey) {
    throw new Error('DEPLOYER_PRIVATE_KEY not set — cannot swap');
  }
  signerKeypair = Keypair.fromSecretKey(bs58.decode(config.deployerPrivateKey));
  return signerKeypair;
}

/**
 * Ensure the USDT ATA exists for a given wallet. Creates it if missing.
 */
async function ensureUsdtAta(owner: PublicKey, payer: Keypair): Promise<PublicKey> {
  const ata = await getAssociatedTokenAddress(USDT_MINT, owner);
  const info = await connection.getAccountInfo(ata);
  if (!info) {
    console.log(`[swap] creating USDT ATA for ${owner.toBase58().slice(0, 10)}...`);
    const ix = createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      owner,
      USDT_MINT,
    );
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const { TransactionMessage, VersionedTransaction: VTx } = await import('@solana/web3.js');
    const msg = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message();
    const tx = new VTx(msg);
    tx.sign([payer]);
    const sig = await connection.sendTransaction(tx, { skipPreflight: false });
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
    console.log(`[swap] USDT ATA created: ${ata.toBase58()}`);
  }
  return ata;
}

/**
 * Get USDT balance for a wallet (in human-readable units).
 */
export async function getUsdtBalance(owner: PublicKey): Promise<number> {
  try {
    const ata = await getAssociatedTokenAddress(USDT_MINT, owner);
    const info = await connection.getTokenAccountBalance(ata);
    return parseFloat(info.value.uiAmountString ?? '0');
  } catch {
    return 0;
  }
}

/**
 * Swap SOL → USDT via Jupiter Aggregator.
 * amountLamports: amount of SOL to swap in lamports.
 */
export async function swapSolToUsdt(amountLamports: number): Promise<SwapResult> {
  const keypair = getKeypair();
  const amountSol = amountLamports / LAMPORTS_PER_SOL;

  console.log(`[swap] swapping ${amountSol.toFixed(6)} SOL → USDT via Jupiter...`);

  try {
    // Ensure USDT ATA exists
    await ensureUsdtAta(keypair.publicKey, keypair);

    // 1. Get quote
    const quoteParams = new URLSearchParams({
      inputMint: SOL_MINT,
      outputMint: config.usdtMint,
      amount: amountLamports.toString(),
      slippageBps: config.swapSlippageBps.toString(),
    });

    const quoteRes: JupiterQuote = await withRetry(async () => {
      const res = await fetch(`${JUPITER_QUOTE_URL}?${quoteParams}`);
      if (!res.ok) throw new Error(`Jupiter quote failed: ${res.status} ${await res.text()}`);
      return res.json() as Promise<JupiterQuote>;
    });

    const outAmount = parseInt(quoteRes.outAmount, 10);
    const amountUsdt = outAmount / Math.pow(10, USDT_DECIMALS);
    const pricePerSol = amountUsdt / amountSol;

    console.log(`[swap] quote: ${amountSol.toFixed(6)} SOL → ${amountUsdt.toFixed(2)} USDT (price: $${pricePerSol.toFixed(2)}/SOL)`);

    // 2. Get swap transaction
    const swapRes: JupiterSwap = await withRetry(async () => {
      const res = await fetch(JUPITER_SWAP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quoteRes,
          userPublicKey: keypair.publicKey.toBase58(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto',
        }),
      });
      if (!res.ok) throw new Error(`Jupiter swap failed: ${res.status} ${await res.text()}`);
      return res.json() as Promise<JupiterSwap>;
    });

    // 3. Sign and send
    const swapTxBuf = Buffer.from(swapRes.swapTransaction, 'base64');
    const tx = VersionedTransaction.deserialize(swapTxBuf);
    tx.sign([keypair]);

    const txSignature = await withRetry(() =>
      connection.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 }),
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    await connection.confirmTransaction(
      { signature: txSignature, blockhash, lastValidBlockHeight },
      'confirmed',
    );

    console.log(`[swap] ✅ swapped ${amountSol.toFixed(6)} SOL → ${amountUsdt.toFixed(2)} USDT | tx: ${txSignature.slice(0, 20)}...`);

    // 4. Log to DB
    await db.transaction.create({
      data: {
        type: 'SOL_SWAP',
        amountSol,
        amountUsd: amountUsdt,
        txSignature,
        status: 'CONFIRMED',
        metadata: {
          route: (quoteRes.routePlan?.map((r) => r.swapInfo?.label).filter((x): x is string => !!x) ?? []) as string[],
          pricePerSol,
          slippageBps: config.swapSlippageBps,
          inputMint: SOL_MINT,
          outputMint: config.usdtMint,
          outAmountRaw: outAmount,
        },
      } as any,
    });

    await db.event.create({
      data: {
        type: 'sol_swap',
        message: `Swapped ${amountSol.toFixed(6)} SOL → ${amountUsdt.toFixed(2)} USDT ($${pricePerSol.toFixed(2)}/SOL)`,
        data: { txSignature, amountSol, amountUsdt, pricePerSol },
      },
    });

    return { success: true, txSignature, amountSol, amountUsdt };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[swap] ❌ swap failed:`, error);
    return { success: false, txSignature: '', amountSol, amountUsdt: 0, error };
  }
}
