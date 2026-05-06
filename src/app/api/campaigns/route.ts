import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eventBus } from "@/lib/events";

export async function GET(request: NextRequest) {
  if (!prisma) {
    return NextResponse.json([], { status: 200 });
  }

  try {
    const wallet = request.nextUrl.searchParams.get("wallet");

    const campaigns = await prisma.campaign.findMany({
      where: wallet ? { creatorWallet: wallet } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        tokens: true,
        _count: { select: { tokens: true } },
        transactions: {
          where: { type: "FEE_RECEIVED", status: "CONFIRMED" },
          select: { amountSol: true },
        },
      },
    });

    // Compute totalSolReceived from actual transactions instead of stale DB field
    const enriched = campaigns.map(({ transactions, ...c }) => ({
      ...c,
      totalSolReceived: transactions.reduce((sum, tx) => sum + (tx.amountSol ?? 0), 0),
    }));

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("GET /api/campaigns error:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!prisma) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { name, description, goFundMeUrl, creatorWallet } = body;

    if (!name || !goFundMeUrl) {
      return NextResponse.json(
        { error: "name and goFundMeUrl are required" },
        { status: 400 }
      );
    }

    if (!creatorWallet) {
      return NextResponse.json(
        { error: "Wallet connection required" },
        { status: 401 }
      );
    }

    const campaign = await prisma.campaign.create({
      data: {
        name,
        description: description || null,
        goFundMeUrl,
        creatorWallet,
      },
    });

    // Log event
    await prisma.event.create({
      data: {
        type: "campaign_created",
        campaignId: campaign.id,
        message: `Campaign "${campaign.name}" created`,
        data: {
          goFundMeUrl: campaign.goFundMeUrl,
          creatorWallet: campaign.creatorWallet,
        },
      },
    });

    eventBus.publish({
      type: "campaign_created",
      campaignId: campaign.id,
      campaignName: campaign.name,
      message: `Campaign "${campaign.name}" created`,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (error) {
    console.error("POST /api/campaigns error:", error);
    return NextResponse.json(
      { error: "Failed to create campaign" },
      { status: 500 }
    );
  }
}
