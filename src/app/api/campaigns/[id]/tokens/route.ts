import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eventBus } from "@/lib/events";
import { Connection, PublicKey } from "@solana/web3.js";

const SOLANA_RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

function parseMintAuthorities(data: Uint8Array): {
  mintAuthority: string | null;
  freezeAuthority: string | null;
} {
  // SPL Token Mint account layout (82 bytes):
  // [0..4]   mintAuthorityOption: u32 LE (1 = Some)
  // [4..36]  mintAuthority: [u8; 32]
  // [36..44] supply: u64 LE
  // [44]     decimals: u8
  // [45]     isInitialized: u8
  // [46..50] freezeAuthorityOption: u32 LE (1 = Some)
  // [50..82] freezeAuthority: [u8; 32]
  const buf = Buffer.from(data);
  if (buf.length < 82) return { mintAuthority: null, freezeAuthority: null };

  const mintAuthorityOption = buf.readUInt32LE(0);
  const mintAuthority =
    mintAuthorityOption === 1 ? new PublicKey(buf.slice(4, 36)).toBase58() : null;

  const freezeAuthorityOption = buf.readUInt32LE(46);
  const freezeAuthority =
    freezeAuthorityOption === 1 ? new PublicKey(buf.slice(50, 82)).toBase58() : null;

  return { mintAuthority, freezeAuthority };
}

async function verifyTokenDeployer(
  mintAddress: string,
  deployerWallet: string
): Promise<{ ok: boolean; rpcError?: boolean; reason?: string }> {
  const connection = new Connection(SOLANA_RPC, "confirmed");
  const mintPubkey = new PublicKey(mintAddress);

  let accountInfo;
  try {
    accountInfo = await connection.getAccountInfo(mintPubkey);
  } catch {
    return { ok: false, rpcError: true, reason: "Failed to fetch mint account from RPC" };
  }

  if (!accountInfo) {
    return { ok: false, reason: "Mint account not found on-chain" };
  }

  const { mintAuthority, freezeAuthority } = parseMintAuthorities(accountInfo.data);

  if (mintAuthority === deployerWallet || freezeAuthority === deployerWallet) {
    return { ok: true };
  }

  // If an authority is set but doesn't match, reject immediately
  if (mintAuthority !== null || freezeAuthority !== null) {
    return { ok: false, reason: "You are not the deployer of this token" };
  }

  // Both authorities revoked (common for pump.fun) — fall back to checking creation tx
  let signatures;
  try {
    signatures = await connection.getSignaturesForAddress(mintPubkey, { limit: 1000 });
  } catch {
    return { ok: false, rpcError: true, reason: "Failed to fetch transaction signatures from RPC" };
  }

  if (signatures.length === 0) {
    return { ok: false, reason: "No transactions found for this mint" };
  }

  const oldestSig = signatures[signatures.length - 1].signature;

  let tx;
  try {
    tx = await connection.getTransaction(oldestSig, { maxSupportedTransactionVersion: 0 });
  } catch {
    return { ok: false, rpcError: true, reason: "Failed to fetch creation transaction from RPC" };
  }

  if (!tx) {
    return { ok: false, reason: "Creation transaction not found" };
  }

  const msg = tx.transaction.message;
  const accountKeys = msg.staticAccountKeys.map((k) => k.toBase58());
  const signerAccounts = accountKeys.slice(0, msg.header.numRequiredSignatures);

  if (signerAccounts.includes(deployerWallet)) {
    return { ok: true };
  }

  return { ok: false, reason: "You are not the deployer of this token" };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!prisma) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { mintAddress, deployerWallet } = body;

    if (!mintAddress || !deployerWallet) {
      return NextResponse.json(
        { error: "mintAddress and deployerWallet are required" },
        { status: 400 }
      );
    }

    // Verify campaign exists
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Check for duplicate mint
    const existing = await prisma.token.findUnique({
      where: { mintAddress },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Token already registered" },
        { status: 409 }
      );
    }

    // On-chain deployer verification
    const verification = await verifyTokenDeployer(mintAddress, deployerWallet).catch(() => ({
      ok: false as const,
      rpcError: true,
      reason: "On-chain verification failed: unexpected error",
    }));

    if (verification.rpcError) {
      return NextResponse.json(
        { error: `On-chain verification failed: ${verification.reason}` },
        { status: 502 }
      );
    }

    if (!verification.ok) {
      return NextResponse.json(
        { error: verification.reason ?? "You are not the deployer of this token" },
        { status: 403 }
      );
    }

    const token = await prisma.token.create({
      data: {
        mintAddress,
        deployerWallet,
        campaignId: id,
      },
    });

    await prisma.event.create({
      data: {
        type: "token_registered",
        campaignId: id,
        message: `Token ${mintAddress.slice(0, 8)}… linked to "${campaign.name}"`,
        data: { mintAddress, deployerWallet },
      },
    });

    eventBus.publish({
      type: "token_registered",
      campaignId: id,
      campaignName: campaign.name,
      message: `Token ${mintAddress.slice(0, 8)}… linked to "${campaign.name}"`,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(token, { status: 201 });
  } catch (error) {
    console.error("POST /api/campaigns/[id]/tokens error:", error);
    return NextResponse.json(
      { error: "Failed to register token" },
      { status: 500 }
    );
  }
}
