import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

export function getConnection(): Connection {
  const rpc =
    process.env.SOLANA_RPC_URL ||
    "https://solana-mainnet.core.chainstack.com/174837f428ce912cd5dea299d401cd8f";
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
