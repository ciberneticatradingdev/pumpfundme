import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAllFeesWithCache } from "@/lib/fee-monitor";
import { getConnection } from "@/lib/solana";

/**
 * GET /api/fees/balances/[campaignId]
 *
 * Returns fees for a specific campaign by filtering the shared cache.
 * Fetches all tokens so both this route and the global route warm the same cache.
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

    const [campaign, allTokens] = await Promise.all([
      prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, name: true },
      }),
      prisma.token.findMany({
        include: { campaign: { select: { id: true, name: true } } },
      }),
    ]);

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    if (allTokens.length === 0) {
      return NextResponse.json({
        campaignId,
        campaignName: campaign.name,
        tokens: [],
        totalClaimableLamports: 0,
        totalClaimableSol: 0,
      });
    }

    const allFees = await getAllFeesWithCache(
      allTokens.map((t) => ({
        mintAddress: t.mintAddress,
        campaignId: t.campaign.id,
        campaignName: t.campaign.name,
      })),
      getConnection()
    );

    const campaignFees = allFees.byCampaign[campaignId] ?? {
      campaignId,
      campaignName: campaign.name,
      tokens: [],
      totalClaimableLamports: 0,
      totalClaimableSol: 0,
    };

    return NextResponse.json(campaignFees);
  } catch (err) {
    console.error("[fees/balances/campaign] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
