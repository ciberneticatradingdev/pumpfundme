import { PublicKey } from '@solana/web3.js';

// SharingConfig account layout from PumpFees program:
// [0-7]   discriminator (8 bytes)
// [8]     bump (u8)
// [9]     version (u8)
// [10]    status (u8)
// [11-42] mint (Pubkey, 32 bytes)
// [43-74] admin (Pubkey, 32 bytes)
// [75]    admin_revoked (bool, 1 byte)
// [76-79] shareholders count (u32 LE)
// [80+]   shareholders: address(32) + share_bps(u16) = 34 bytes each
const SHARING_CONFIG_DISCRIMINATOR = Buffer.from([216, 74, 9, 0, 56, 140, 93, 75]);

export interface SharingConfig {
  mint: string;
  admin: string;
  shareholders: Array<{ address: string; shareBps: number }>;
}

export function parseSharingConfig(data: Buffer): SharingConfig | null {
  if (data.length < 80) return null;

  if (!data.slice(0, 8).equals(SHARING_CONFIG_DISCRIMINATOR)) return null;

  const mint = new PublicKey(data.slice(11, 43)).toBase58();
  const admin = new PublicKey(data.slice(43, 75)).toBase58();

  const count = data.readUInt32LE(76);
  const shareholders: SharingConfig['shareholders'] = [];
  for (let i = 0; i < count; i++) {
    const offset = 80 + i * 34;
    if (offset + 34 > data.length) break;
    shareholders.push({
      address: new PublicKey(data.slice(offset, offset + 32)).toBase58(),
      shareBps: data.readUInt16LE(offset + 32),
    });
  }

  return { mint, admin, shareholders };
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 5,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxAttempts - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(
          `[retry] attempt ${attempt + 1}/${maxAttempts} failed: ${lastError.message} — retrying in ${delay}ms`,
        );
        await sleep(delay);
      }
    }
  }
  throw lastError;
}
