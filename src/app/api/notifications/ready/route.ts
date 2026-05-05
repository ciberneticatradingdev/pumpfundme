import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminWallet } from "@/lib/admin";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet") ?? "";
  if (!isAdminWallet(wallet)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!prisma) {
    return NextResponse.json({ ready: [] }, { status: 200 });
  }

  try {
    const campaigns = await prisma.campaign.findMany({
      where: {
        transactions: {
          some: { type: "USDT_TRANSFER", status: "CONFIRMED" },
        },
      },
      include: {
        transactions: {
          where: {
            type: { in: ["USDT_TRANSFER", "DONATION"] },
            status: "CONFIRMED",
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const ready = campaigns
      .map((campaign) => {
        const transferred = campaign.transactions
          .filter((tx) => tx.type === "USDT_TRANSFER")
          .reduce((sum, tx) => sum + (tx.amountUsd ?? 0), 0);
        const donated = campaign.transactions
          .filter((tx) => tx.type === "DONATION")
          .reduce((sum, tx) => sum + (tx.amountUsd ?? 0), 0);
        const available = transferred - donated;
        return {
          campaignId: campaign.id,
          campaignName: campaign.name,
          goFundMeUrl: campaign.goFundMeUrl,
          totalTransferred: transferred,
          totalDonated: donated,
          availableToDonate: available,
        };
      })
      .filter((c) => c.availableToDonate > 0.01);

    return NextResponse.json({ ready });
  } catch (err) {
    console.error("[api/notifications/ready] error:", err);
    return NextResponse.json({ error: "Failed to fetch ready notifications" }, { status: 500 });
  }
}
