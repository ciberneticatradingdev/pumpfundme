import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaimableByCampaign } from "@/lib/fee-monitor";
import { getConnection } from "@/lib/solana";

/**
 * GET /api/fees/balances/[campaignId]
 *
 * Returns fees for a specific campaign's tokens.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const { campaignId } = await params;
    if (!prisma) {
      return NextResponse.json(
        { error: "Database not available" },
        { status: 503 }
      );
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        tokens: { select: { mintAddress: true, name: true, symbol: true } },
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    if (campaign.tokens.length === 0) {
      return NextResponse.json({
        campaignId,
        campaignName: campaign.name,
        tokens: [],
        totalClaimableLamports: 0,
        totalClaimableSol: 0,
      });
    }

    const conn = getConnection();
    const result = await getClaimableByCampaign(campaign.tokens, conn);

    // Enrich with token name/symbol
    const tokenMap = new Map(
      campaign.tokens.map((t) => [t.mintAddress, t])
    );
    const enrichedTokens = result.tokens.map((t) => {
      const meta = tokenMap.get(t.mintAddress);
      return {
        ...t,
        name: meta?.name ?? null,
        symbol: meta?.symbol ?? null,
      };
    });

    return NextResponse.json({
      campaignId,
      campaignName: campaign.name,
      tokens: enrichedTokens,
      totalClaimableLamports: result.totalClaimableLamports,
      totalClaimableSol: result.totalClaimableSol,
    });
  } catch (err) {
    console.error("[fees/balances/campaign] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
