import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
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
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        tokens: { orderBy: { createdAt: "desc" } },
        events: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Normalize events for frontend
    const normalized = {
      ...campaign,
      events: campaign.events.map((e: { id: string; type: string; message: string; createdAt: Date }) => ({
        id: e.id,
        type: e.type,
        message: e.message,
        timestamp: e.createdAt.toISOString(),
        campaignName: campaign.name,
      })),
    };

    return NextResponse.json(normalized);
  } catch (error) {
    console.error("GET /api/campaigns/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch campaign" },
      { status: 500 }
    );
  }
}
