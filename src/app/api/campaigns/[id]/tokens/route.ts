import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eventBus } from "@/lib/events";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!prisma) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { mintAddress, deployerWallet } = body;

    if (!mintAddress || !deployerWallet) {
      return NextResponse.json(
        { error: "mintAddress and deployerWallet are required" },
        { status: 400 }
      );
    }

    // Verify campaign exists
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Check for duplicate mint
    const existing = await prisma.token.findUnique({
      where: { mintAddress },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Token already registered" },
        { status: 409 }
      );
    }

    const token = await prisma.token.create({
      data: {
        mintAddress,
        deployerWallet,
        campaignId: id,
      },
    });

    // Log event
    await prisma.event.create({
      data: {
        type: "token_registered",
        campaignId: id,
        message: `Token ${mintAddress.slice(0, 8)}… linked to "${campaign.name}"`,
        data: { mintAddress, deployerWallet },
      },
    });

    eventBus.publish({
      type: "token_registered",
      campaignId: id,
      campaignName: campaign.name,
      message: `Token ${mintAddress.slice(0, 8)}… linked to "${campaign.name}"`,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(token, { status: 201 });
  } catch (error) {
    console.error("POST /api/campaigns/[id]/tokens error:", error);
    return NextResponse.json(
      { error: "Failed to register token" },
      { status: 500 }
    );
  }
}
