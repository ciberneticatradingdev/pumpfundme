import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { claimFeesForToken, claimFeesForCampaign } from "@/lib/fee-claimer";

/**
 * POST /api/fees/claim
 *
 * Body: { mintAddress?: string, campaignId?: string }
 * - mintAddress: claim fees for a single token
 * - campaignId: claim fees for all tokens in a campaign
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

    // Single token claim
    if (mintAddress) {
      const result = await claimFeesForToken(mintAddress);

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
            mintAddress: result.mintAddress,
            txSignature: result.txSignature,
            amountSol: result.amountSol,
          },
        ],
        ...(result.error ? { error: result.error } : {}),
      });
    }

    // Campaign claim
    if (!prisma) {
      return NextResponse.json({ error: "Database not available" }, { status: 503 });
    }

    const campaignExists = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });

    if (!campaignExists) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const results = await claimFeesForCampaign(campaignId!);

    // Log successful claims to DB
    for (const result of results) {
      if (!result.success) continue;
      const token = await prisma.token.findUnique({
        where: { mintAddress: result.mintAddress },
        select: { id: true },
      });
      if (token) {
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
    }

    const claims = results.map((r) => ({
      mintAddress: r.mintAddress,
      txSignature: r.txSignature,
      amountSol: r.amountSol,
    }));

    return NextResponse.json({ success: true, claims });
  } catch (err) {
    console.error("[fees/claim] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
