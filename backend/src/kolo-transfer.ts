import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { config } from './config';
import { db } from './db';
import { withRetry } from './utils';

const connection = new Connection(config.solanaRpcUrl, 'confirmed');

const USDT_MINT = new PublicKey(config.usdtMint);
const USDT_DECIMALS = 6;

export interface TransferResult {
  success: boolean;
  txSignature: string;
  amountUsdt: number;
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
 * Get USDT balance for a wallet (human-readable).
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
 * Transfer ALL USDT from fee wallet → Kolo wallet.
 * Creates Kolo's USDT ATA if it doesn't exist.
 */
export async function transferUsdtToKolo(amountRaw?: number, campaignId?: string): Promise<TransferResult> {
  const keypair = getKeypair();
  const koloWallet = new PublicKey(config.koloWallet);

  const sourceAta = await getAssociatedTokenAddress(USDT_MINT, keypair.publicKey);
  const destAta = await getAssociatedTokenAddress(USDT_MINT, koloWallet);

  try {
    // Get actual balance if amountRaw not provided
    if (!amountRaw) {
      const balanceInfo = await connection.getTokenAccountBalance(sourceAta);
      amountRaw = parseInt(balanceInfo.value.amount, 10);
    }

    if (amountRaw <= 0) {
      return { success: false, txSignature: '', amountUsdt: 0, error: 'No USDT to transfer' };
    }

    const amountUsdt = amountRaw / Math.pow(10, USDT_DECIMALS);
    console.log(`[transfer] sending ${amountUsdt.toFixed(2)} USDT → Kolo (${config.koloWallet.slice(0, 10)}...)`);

    const instructions = [];

    // Create dest ATA if needed
    const destInfo = await connection.getAccountInfo(destAta);
    if (!destInfo) {
      console.log(`[transfer] creating USDT ATA for Kolo wallet...`);
      instructions.push(
        createAssociatedTokenAccountInstruction(
          keypair.publicKey,
          destAta,
          koloWallet,
          USDT_MINT,
        ),
      );
    }

    // Transfer instruction
    instructions.push(
      createTransferInstruction(
        sourceAta,
        destAta,
        keypair.publicKey,
        amountRaw,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const message = new TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: blockhash,
      instructions,
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

    console.log(`[transfer] ✅ sent ${amountUsdt.toFixed(2)} USDT → Kolo | tx: ${txSignature.slice(0, 20)}...`);

    // Log to DB
    await db.transaction.create({
      data: {
        type: 'USDT_TRANSFER',
        amountSol: 0,
        amountUsd: amountUsdt,
        txSignature,
        status: 'CONFIRMED',
        ...(campaignId ? { campaignId } : {}),
        metadata: {
          fromWallet: keypair.publicKey.toBase58(),
          toWallet: config.koloWallet,
          mint: config.usdtMint,
          amountRaw,
        },
      } as any,
    });

    await db.event.create({
      data: {
        type: 'usdt_transfer',
        message: `Transferred ${amountUsdt.toFixed(2)} USDT to Kolo card wallet`,
        ...(campaignId ? { campaignId } : {}),
        data: {
          txSignature,
          amountUsdt,
          fromWallet: keypair.publicKey.toBase58(),
          toWallet: config.koloWallet,
        },
      },
    });

    return { success: true, txSignature, amountUsdt };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[transfer] ❌ failed:`, error);
    return { success: false, txSignature: '', amountUsdt: 0, error };
  }
}
