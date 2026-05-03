import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClaimableBalances } from "@/lib/fee-monitor";
import { getConnection } from "@/lib/solana";

/**
 * GET /api/fees/balances
 *
 * Returns accumulated fees per token for all registered tokens.
 * Groups results by campaign.
 */
export async function GET() {
  try {
    if (!prisma) {
      return NextResponse.json(
        { error: "Database not available" },
        { status: 503 }
      );
    }

    // Fetch all tokens with their campaigns
    const tokens = await prisma.token.findMany({
      include: {
        campaign: {
          select: { id: true, name: true },
        },
      },
    });

    if (tokens.length === 0) {
      return NextResponse.json({
        tokens: [],
        totalClaimableLamports: 0,
        totalClaimableSol: 0,
      });
    }

    const conn = getConnection();

    const balances = await getClaimableBalances(
      tokens.map((t) => ({
        mintAddress: t.mintAddress,
        campaignId: t.campaign.id,
        campaignName: t.campaign.name,
      })),
      conn
    );

    const totalClaimableLamports = balances.reduce(
      (sum, b) => sum + b.claimableLamports,
      0
    );

    return NextResponse.json({
      tokens: balances,
      totalClaimableLamports,
      totalClaimableSol: totalClaimableLamports / 1e9,
    });
  } catch (err) {
    console.error("[fees/balances] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
