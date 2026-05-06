import Link from "next/link";
import { prisma } from "@/lib/prisma";

interface CampaignWithStats {
  id: string;
  name: string;
  description: string | null;
  goFundMeUrl: string;
  status: string;
  totalSolReceived: number;
  totalDonatedUsd: number;
  createdAt: string;
  _count: { tokens: number };
}

export const revalidate = 30;

async function getCampaigns(): Promise<CampaignWithStats[]> {
  if (!prisma) return [];
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { tokens: true } } },
    });
    return campaigns as unknown as CampaignWithStats[];
  } catch {
    return [];
  }
}

export default async function CampaignsPage() {
  const campaigns = await getCampaigns();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="animate-fade-in-up">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Active Campaigns
        </h1>
        <p className="mt-2 text-gray-500">
          Every campaign is fully transparent. Click to see pipeline progress,
          transactions, and linked tokens.
        </p>
      </div>

      {campaigns.length === 0 ? (
        <div className="mt-16 flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 py-20 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-50 text-gray-300">
            <svg
              className="h-7 w-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
              />
            </svg>
          </div>
          <p className="text-sm text-gray-400">
            No active campaigns yet. Be the first to create one!
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex h-9 items-center rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white transition-all hover:bg-emerald-400 active:scale-95"
          >
            Create Campaign
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign, i) => (
            <Link
              key={campaign.id}
              href={`/campaign/${campaign.id}`}
              className={`animate-fade-in-up-delay-${Math.min(i + 1, 3)} group glass rounded-xl overflow-hidden transition-all hover:shadow-lg hover:border-emerald-200`}
            >
              {/* Header */}
              <div className="border-b border-gray-100 px-5 py-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold group-hover:text-emerald-600 transition-colors">
                    {campaign.name}
                  </h3>
                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                    {campaign.status}
                  </span>
                </div>
                {campaign.description && (
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                    {campaign.description}
                  </p>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 divide-x divide-gray-100">
                <div className="px-4 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400">
                    SOL Received
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-bold text-emerald-600">
                    {campaign.totalSolReceived.toFixed(4)}
                  </p>
                </div>
                <div className="px-4 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400">
                    Donated
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-bold">
                    ${campaign.totalDonatedUsd.toFixed(2)}
                  </p>
                </div>
                <div className="px-4 py-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400">
                    Tokens
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-bold">
                    {campaign._count.tokens}
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  Created{" "}
                  {new Date(campaign.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                <span className="text-xs font-medium text-emerald-600 group-hover:underline">
                  View details →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
