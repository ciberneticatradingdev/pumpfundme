import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  if (!prisma) {
    return NextResponse.json({
      totalSolClaimed: 0,
      totalClaimCount: 0,
      totalSolSwapped: 0,
      totalUsdtFromSwaps: 0,
      totalSwapCount: 0,
      totalUsdtTransferred: 0,
      totalTransferCount: 0,
      totalUsdtDonated: 0,
      totalDonationCount: 0,
    });
  }

  try {
    const [claimed, swapped, transferred, donated] = await Promise.all([
      prisma.transaction.aggregate({
        where: { type: "FEE_RECEIVED", status: "CONFIRMED" },
        _sum: { amountSol: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: { type: "SOL_SWAP", status: "CONFIRMED" },
        _sum: { amountSol: true, amountUsd: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: { type: "USDT_TRANSFER", status: "CONFIRMED" },
        _sum: { amountUsd: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: { type: "DONATION", status: "CONFIRMED" },
        _sum: { amountUsd: true },
        _count: true,
      }),
    ]);

    return NextResponse.json({
      totalSolClaimed: claimed._sum.amountSol ?? 0,
      totalClaimCount: claimed._count,
      totalSolSwapped: swapped._sum.amountSol ?? 0,
      totalUsdtFromSwaps: swapped._sum.amountUsd ?? 0,
      totalSwapCount: swapped._count,
      totalUsdtTransferred: transferred._sum.amountUsd ?? 0,
      totalTransferCount: transferred._count,
      totalUsdtDonated: donated._sum.amountUsd ?? 0,
      totalDonationCount: donated._count,
    });
  } catch (err) {
    console.error("[api/transactions/summary] error:", err);
    return NextResponse.json({ error: "Failed to fetch summary" }, { status: 500 });
  }
}
