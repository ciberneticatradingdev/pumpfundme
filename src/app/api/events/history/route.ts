import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  if (!prisma) {
    return NextResponse.json([], { status: 200 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get("campaignId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "100"), 500);

    const where = campaignId ? { campaignId } : {};

    const events = await prisma.event.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: limit,
      include: {
        campaign: { select: { name: true } },
      },
    });

    const normalized = events.map((e: { id: string; type: string; campaignId: string | null; campaign: { name: string } | null; message: string; createdAt: Date; data: unknown }) => ({
      id: e.id,
      type: e.type,
      campaignId: e.campaignId,
      campaignName: e.campaign?.name,
      message: e.message,
      timestamp: e.createdAt.toISOString(),
      data: e.data,
    }));

    return NextResponse.json(normalized);
  } catch (error) {
    console.error("GET /api/events/history error:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}
