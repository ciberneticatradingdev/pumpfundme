import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

async function claimMint(mintAddress: string): Promise<{
  success: boolean;
  txSignature: string;
  amountSol: number;
  error?: string;
}> {
  const res = await fetch(`${BACKEND_URL}/api/fees/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mintAddress }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Backend error" }));
    return { success: false, txSignature: "", amountSol: 0, error: err.error };
  }
  return res.json();
}

/**
 * POST /api/fees/claim
 *
 * Body: { mintAddress?: string, campaignId?: string }
 * - mintAddress: claim fees for a single token (proxied to backend)
 * - campaignId: claim fees for all tokens in a campaign (look up tokens, proxy each)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mintAddress, campaignId } = body as {
      mintAddress?: string;
      campaignId?: string;
    };

    if (!mintAddress && !campaignId) {
      return NextResponse.json(
        { error: "Provide mintAddress or campaignId" },
        { status: 400 }
      );
    }

    // Single token claim — proxy to backend
    if (mintAddress) {
      const result = await claimMint(mintAddress);

      if (result.success && prisma) {
        const token = await prisma.token.findUnique({
          where: { mintAddress },
          select: { id: true, campaignId: true },
        });

        if (token) {
          await prisma.transaction.create({
            data: {
              type: "FEE_RECEIVED",
              campaignId: token.campaignId,
              tokenId: token.id,
              amountSol: result.amountSol,
              txSignature: result.txSignature,
              status: "CONFIRMED",
              metadata: { claimType: "single" },
            },
          });
        }
      }

      return NextResponse.json({
        success: result.success,
        claims: [
          {
            mintAddress,
            txSignature: result.txSignature,
            amountSol: result.amountSol,
          },
        ],
        ...(result.error ? { error: result.error } : {}),
      });
    }

    // Campaign claim — look up tokens, proxy each to backend
    if (!prisma) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const tokens = await prisma.token.findMany({
      where: { campaignId },
      select: { mintAddress: true, id: true },
    });

    const claims = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const result = await claimMint(token.mintAddress);

      if (result.success) {
        await prisma.transaction
          .create({
            data: {
              type: "FEE_RECEIVED",
              campaignId: campaignId!,
              tokenId: token.id,
              amountSol: result.amountSol,
              txSignature: result.txSignature,
              status: "CONFIRMED",
              metadata: { claimType: "campaign" },
            },
          })
          .catch((dbErr: unknown) => {
            console.error("[fees/claim] DB log error:", dbErr);
          });
      }

      claims.push({
        mintAddress: token.mintAddress,
        txSignature: result.txSignature,
        amountSol: result.amountSol,
        success: result.success,
        ...(result.error ? { error: result.error } : {}),
      });

      if (i < tokens.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return NextResponse.json({ success: true, claims });
  } catch (err) {
    console.error("[fees/claim] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
