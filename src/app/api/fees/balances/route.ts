import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAllFeesWithCache } from "@/lib/fee-monitor";
import { getConnection } from "@/lib/solana";

/**
 * GET /api/fees/balances
 *
 * Returns accumulated fees for all registered tokens.
 * Uses server-side cache (30 s TTL) to avoid RPC rate limits.
 * Response includes byCampaign for efficient client-side filtering.
 */
export async function GET() {
  try {
    if (!prisma) {
      return NextResponse.json(
        { error: "Database not available" },
        { status: 503 }
      );
    }

    const tokens = await prisma.token.findMany({
      include: {
        campaign: { select: { id: true, name: true } },
      },
    });

    if (tokens.length === 0) {
      return NextResponse.json({
        tokens: [],
        totalClaimableLamports: 0,
        totalClaimableSol: 0,
        byCampaign: {},
      });
    }

    const result = await getAllFeesWithCache(
      tokens.map((t) => ({
        mintAddress: t.mintAddress,
        campaignId: t.campaign.id,
        campaignName: t.campaign.name,
      })),
      getConnection()
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error("[fees/balances] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
