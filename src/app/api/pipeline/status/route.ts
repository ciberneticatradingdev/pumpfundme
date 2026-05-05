import { NextResponse } from "next/server";

const BACKEND_URL =
  process.env.BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "https://pumpfundme-production.up.railway.app";

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/pipeline/status`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Backend unavailable" }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch pipeline status" }, { status: 502 });
  }
}
