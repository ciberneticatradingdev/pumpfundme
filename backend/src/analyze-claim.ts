import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

const conn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
const PUMP_FEES = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");

async function main() {
  // Analyze the claim tx that actually transferred SOL
  const txSig = "vaSsLeG9faSK7YrEw1KkWPUGt6HGNk1h9n1HX7PQ2YgyifoXMdZfCikSEtvCDcD8pn9NJccaz37qvFXxgCYfbw4";
  
  const tx = await conn.getParsedTransaction(txSig, { maxSupportedTransactionVersion: 0 });
  if (!tx) { console.log("tx not found"); return; }

  console.log("=== CLAIM TX ANALYSIS ===\n");
  
  // All accounts
  console.log("Accounts:");
  tx.transaction.message.accountKeys.forEach((a: any, i: number) => {
    const addr = a.pubkey.toBase58();
    const signer = a.signer ? " [SIGNER]" : "";
    const writable = a.writable ? " [WRITABLE]" : "";
    console.log(`  [${i}] ${addr}${signer}${writable}`);
  });
  
  // Instructions
  console.log("\nInstructions:");
  for (const ix of tx.transaction.message.instructions) {
    const progId = (ix as any).programId?.toBase58?.() || 'unknown';
    console.log(`  Program: ${progId}`);
    if ((ix as any).data) {
      const dataB58 = (ix as any).data as string;
      const dataBytes = bs58.decode(dataB58);
      console.log(`  Data (base58): ${dataB58}`);
      console.log(`  Data (hex): ${Buffer.from(dataBytes).toString('hex')}`);
      console.log(`  Data length: ${dataBytes.length} bytes`);
      console.log(`  Discriminator (first 8): [${Array.from(dataBytes.slice(0, 8))}]`);
      if (dataBytes.length >= 40) {
        console.log(`  Possible pubkey in data (offset 8): ${new PublicKey(dataBytes.slice(8, 40)).toBase58()}`);
      }
    }
    if ((ix as any).accounts) {
      console.log(`  Instruction accounts: ${(ix as any).accounts.length}`);
      (ix as any).accounts.forEach((a: any, i: number) => {
        console.log(`    [${i}] ${a.toBase58()}`);
      });
    }
  }
  
  // Inner instructions
  if (tx.meta?.innerInstructions?.length) {
    console.log("\nInner Instructions:");
    for (const inner of tx.meta.innerInstructions) {
      console.log(`  Outer index: ${inner.index}`);
      for (const iix of inner.instructions) {
        const progId = (iix as any).programId?.toBase58?.() || 'unknown';
        console.log(`    Program: ${progId}`);
        if ((iix as any).data) {
          const d = bs58.decode((iix as any).data);
          console.log(`    Data (hex): ${Buffer.from(d).toString('hex')}`);
        }
      }
    }
  }
  
  // Log entries
  if (tx.meta?.logMessages) {
    console.log("\nLog Messages:");
    tx.meta.logMessages.forEach((l: string) => console.log(`  ${l}`));
  }
}

main().catch(console.error);
