import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { claimFeesForToken, claimFeesForCampaign } from "@/lib/fee-claimer";
import { getConnection } from "@/lib/solana";

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
    const { mintAddress, campaignId } = body;

    if (!mintAddress && !campaignId) {
      return NextResponse.json(
        { error: "Provide mintAddress or campaignId" },
        { status: 400 }
      );
    }

    const conn = getConnection();

    // Single token claim
    if (mintAddress) {
      const result = await claimFeesForToken(mintAddress, conn);

      if (result.success && prisma) {
        // Find token in DB to get campaignId
        const token = await prisma.token.findUnique({
          where: { mintAddress },
          select: { campaignId: true },
        });

        if (token) {
          await prisma.transaction.create({
            data: {
              type: "FEE_RECEIVED",
              campaignId: token.campaignId,
              tokenId: mintAddress,
              amountSol: 0, // We don't know exact amount without parsing tx
              txSignature: result.txSignature,
              status: "CONFIRMED",
              metadata: { claimType: "single" },
            },
          });
        }
      }

      return NextResponse.json({
        success: result.success,
        claims: [result],
      });
    }

    // Campaign claim
    if (campaignId && prisma) {
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: { tokens: { select: { mintAddress: true } } },
      });

      if (!campaign) {
        return NextResponse.json(
          { error: "Campaign not found" },
          { status: 404 }
        );
      }

      if (campaign.tokens.length === 0) {
        return NextResponse.json(
          { error: "No tokens in campaign" },
          { status: 400 }
        );
      }

      const results = await claimFeesForCampaign(campaign.tokens, conn);

      // Log successful claims
      for (const result of results) {
        if (result.success) {
          await prisma.transaction.create({
            data: {
              type: "FEE_RECEIVED",
              campaignId,
              tokenId: result.mintAddress,
              amountSol: 0,
              txSignature: result.txSignature,
              status: "CONFIRMED",
              metadata: { claimType: "campaign" },
            },
          });
        }
      }

      return NextResponse.json({
        success: results.every((r) => r.success),
        claims: results,
      });
    }

    return NextResponse.json({ error: "Database not available" }, { status: 503 });
  } catch (err) {
    console.error("[fees/claim] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
