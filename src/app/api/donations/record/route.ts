import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminWallet } from "@/lib/admin";

export async function POST(request: NextRequest) {
  if (!prisma) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { campaignId, amountUsd, receiptUrl, notes, walletAddress } = body as {
      campaignId?: string;
      amountUsd?: number;
      receiptUrl?: string;
      notes?: string;
      walletAddress?: string;
    };

    if (!isAdminWallet(walletAddress ?? "")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!campaignId || !amountUsd) {
      return NextResponse.json({ error: "Provide campaignId and amountUsd" }, { status: 400 });
    }

    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const [transaction] = await prisma.$transaction([
      prisma.transaction.create({
        data: {
          type: "DONATION",
          campaignId,
          amountSol: 0,
          amountUsd: Number(amountUsd),
          status: "CONFIRMED",
          metadata: {
            ...(receiptUrl ? { receiptUrl } : {}),
            ...(notes ? { notes } : {}),
            recordedManually: true,
          },
        },
      }),
      prisma.campaign.update({
        where: { id: campaignId },
        data: { totalDonatedUsd: { increment: Number(amountUsd) } },
      }),
    ]);

    return NextResponse.json({ transaction });
  } catch (err) {
    console.error("[api/donations/record] error:", err);
    return NextResponse.json({ error: "Failed to record donation" }, { status: 500 });
  }
}
