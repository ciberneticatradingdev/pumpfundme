import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/fees/history
 *
 * Returns claim history from the DB (Transaction records with type FEE_RECEIVED).
 * Supports optional ?campaignId= query param to filter by campaign.
 */
export async function GET(req: NextRequest) {
  try {
    if (!prisma) {
      return NextResponse.json(
        { error: "Database not available" },
        { status: 503 }
      );
    }

    const campaignId = req.nextUrl.searchParams.get("campaignId");

    const where: Record<string, unknown> = {
      type: "FEE_RECEIVED",
    };
    if (campaignId) {
      where.campaignId = campaignId;
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        campaign: { select: { id: true, name: true } },
        token: { select: { mintAddress: true, name: true, symbol: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({
      transactions: transactions.map((tx) => ({
        id: tx.id,
        campaignId: tx.campaignId,
        campaignName: tx.campaign.name,
        tokenMint: tx.token?.mintAddress ?? null,
        tokenName: tx.token?.name ?? null,
        tokenSymbol: tx.token?.symbol ?? null,
        amountSol: tx.amountSol,
        amountUsd: tx.amountUsd,
        txSignature: tx.txSignature,
        status: tx.status,
        metadata: tx.metadata,
        createdAt: tx.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[fees/history] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
