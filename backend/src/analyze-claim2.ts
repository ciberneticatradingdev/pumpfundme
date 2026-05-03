import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

const conn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

async function analyzeTx(label: string, txSig: string) {
  const tx = await conn.getParsedTransaction(txSig, { maxSupportedTransactionVersion: 0 });
  if (!tx) { console.log(`${label}: not found`); return; }
  
  console.log(`\n=== ${label} ===`);
  console.log("Accounts:");
  tx.transaction.message.accountKeys.forEach((a: any, i: number) => {
    console.log(`  [${i}] ${a.pubkey.toBase58()}${a.signer ? ' [S]' : ''}${a.writable ? ' [W]' : ''}`);
  });
  
  if (tx.meta?.logMessages) {
    console.log("Logs:");
    tx.meta.logMessages.forEach((l: string) => {
      if (l.includes('Instruction:') || l.includes('Program log:') || l.includes('invoke')) {
        console.log(`  ${l}`);
      }
    });
  }
  
  // Show balance changes
  const feeIdx = tx.transaction.message.accountKeys.findIndex(
    (a: any) => a.pubkey.toBase58() === "49GECbTo4z2FZx9s5XzYwxwQurALWGjsfR6wM5deKrVN"
  );
  if (feeIdx >= 0 && tx.meta) {
    console.log(`Fee wallet delta: ${(tx.meta.postBalances[feeIdx] - tx.meta.preBalances[feeIdx]) / 1e9} SOL`);
  }
}

async function main() {
  await analyzeTx("TX1 (28AsWL)", "28AsWLNYWHexehBBLMwij5cSCQ33THVH2yjbqEedrSbfLu6bXUzz5wz29Qrzcjta3SeQeXA8ubygAe6QbPUBg8TM");
  
  await new Promise(r => setTimeout(r, 1000));
  
  await analyzeTx("TX2 (vaSsLe)", "vaSsLeG9faSK7YrEw1KkWPUGt6HGNk1h9n1HX7PQ2YgyifoXMdZfCikSEtvCDcD8pn9NJccaz37qvFXxgCYfbw4");

  // Also look for actual claim txs by searching more history
  await new Promise(r => setTimeout(r, 1000));
  
  const FEE_WALLET = new PublicKey("49GECbTo4z2FZx9s5XzYwxwQurALWGjsfR6wM5deKrVN");
  const sigs = await conn.getSignaturesForAddress(FEE_WALLET, { limit: 20 });
  console.log(`\n=== ALL TXS ON FEE WALLET: ${sigs.length} ===`);
  for (const s of sigs) {
    console.log(`  ${s.signature.slice(0, 30)}... slot=${s.slot} err=${s.err ? JSON.stringify(s.err) : 'none'}`);
  }
  
  // Also check HrA44R (GitHub claim wallet) for claim txs
  await new Promise(r => setTimeout(r, 1000));
  
  const GITHUB_WALLET = new PublicKey("HrA44RKEy2xs5RxVTKZcPgx5hCrmW12nkLhFW55Us3Mw");
  const sigs2 = await conn.getSignaturesForAddress(GITHUB_WALLET, { limit: 20 });
  console.log(`\n=== ALL TXS ON GITHUB WALLET: ${sigs2.length} ===`);
  for (const s of sigs2) {
    const tx = await conn.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
    const logs = tx?.meta?.logMessages?.filter((l: string) => l.includes('Instruction:')) || [];
    console.log(`  ${s.signature.slice(0, 30)}... ${logs.join(' | ')}`);
    await new Promise(r => setTimeout(r, 500));
  }
}

main().catch(console.error);
