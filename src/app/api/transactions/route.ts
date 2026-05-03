import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  if (!prisma) {
    return NextResponse.json({ transactions: [], total: 0 }, { status: 200 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const typeFilter = searchParams.get("type");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = parseInt(searchParams.get("offset") || "0");

    const where = typeFilter
      ? { type: typeFilter as "FEE_RECEIVED" | "SOL_SWAP" | "USDT_TRANSFER" | "SOL_TRANSFER" | "DONATION" }
      : {};

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          campaign: { select: { id: true, name: true } },
          token: { select: { id: true, mintAddress: true, symbol: true } },
        },
      }),
      prisma.transaction.count({ where }),
    ]);

    return NextResponse.json({
      transactions: transactions.map((tx) => ({
        id: tx.id,
        type: tx.type,
        amountSol: tx.amountSol,
        amountUsd: tx.amountUsd,
        txSignature: tx.txSignature,
        solscanUrl: tx.txSignature
          ? `https://solscan.io/tx/${tx.txSignature}`
          : null,
        status: tx.status,
        campaign: tx.campaign,
        token: tx.token,
        metadata: tx.metadata,
        createdAt: tx.createdAt.toISOString(),
      })),
      total,
      limit,
      offset,
    });
  } catch (err) {
    console.error("[api/transactions] error:", err);
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }
}
