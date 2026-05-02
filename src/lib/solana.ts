import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

export function getConnection(): Connection {
  const rpc = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  return new Connection(rpc, "confirmed");
}

export function getDeployerKeypair(): Keypair {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("DEPLOYER_PRIVATE_KEY not set");
  return Keypair.fromSecretKey(bs58.decode(key));
}

export function getKoloWallet(): PublicKey {
  const addr = process.env.KOLO_WALLET_ADDRESS;
  if (!addr) throw new Error("KOLO_WALLET_ADDRESS not set");
  return new PublicKey(addr);
}
