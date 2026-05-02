import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eventBus } from "@/lib/events";

export async function GET() {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { tokens: true } },
      },
    });
    return NextResponse.json(campaigns);
  } catch (error) {
    console.error("GET /api/campaigns error:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaigns" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, goFundMeUrl } = body;

    if (!name || !goFundMeUrl) {
      return NextResponse.json(
        { error: "name and goFundMeUrl are required" },
        { status: 400 }
      );
    }

    const campaign = await prisma.campaign.create({
      data: { name, description: description || null, goFundMeUrl },
    });

    // Log event
    await prisma.event.create({
      data: {
        type: "campaign_created",
        campaignId: campaign.id,
        message: `Campaign "${campaign.name}" created`,
        data: { goFundMeUrl: campaign.goFundMeUrl },
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
