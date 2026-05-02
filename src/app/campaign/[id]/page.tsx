"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

interface Token {
  id: string;
  mintAddress: string;
  deployerWallet: string;
  name: string | null;
  symbol: string | null;
  createdAt: string;
}

interface Event {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  campaignName?: string;
}

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  goFundMeUrl: string;
  status: string;
  totalSolReceived: number;
  totalDonatedUsd: number;
  createdAt: string;
  tokens: Token[];
  events: Event[];
}

const typeColors: Record<string, string> = {
  fee_received: "text-emerald-400",
  sol_transfer: "text-blue-400",
  donation: "text-purple-400",
  campaign_created: "text-yellow-400",
  token_registered: "text-cyan-400",
  error: "text-red-400",
  info: "text-gray-400",
};

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  PAUSED: "bg-yellow-500/15 text-yellow-400 border-yellow-500/25",
  COMPLETED: "bg-blue-500/15 text-blue-400 border-blue-500/25",
};

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setCampaign)
      .catch(() => setError("Campaign not found"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/20 border-t-emerald-500" />
        <p className="mt-4 text-sm text-white/30">Loading campaign…</p>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="mx-auto max-w-lg px-4 py-32 text-center">
        <div className="glass rounded-2xl p-12">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10 text-red-400">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold">Campaign Not Found</h2>
          <p className="mt-2 text-sm text-white/40">
            {error || "This campaign doesn't exist or has been removed."}
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex h-10 items-center rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 animate-fade-in-up">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-white/40 transition-colors hover:text-emerald-400"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Dashboard
      </Link>

      {/* Header */}
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{campaign.name}</h1>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                statusStyles[campaign.status] || ""
              }`}
            >
              {campaign.status}
            </span>
          </div>
          {campaign.description && (
            <p className="mt-2 max-w-2xl text-white/45">
              {campaign.description}
            </p>
          )}
        </div>
        <a
          href={campaign.goFundMeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 shrink-0 items-center rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-black transition-all hover:bg-emerald-400 active:scale-95"
        >
          GoFundMe ↗
        </a>
      </div>

      {/* Stat cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/30">
                SOL Received
              </p>
              <p className="mt-0.5 font-mono text-xl font-bold text-emerald-400">
                {campaign.totalSolReceived.toFixed(4)}
              </p>
            </div>
          </div>
        </div>

        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/30">
                USD Donated
              </p>
              <p className="mt-0.5 font-mono text-xl font-bold">
                ${campaign.totalDonatedUsd.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-white/30">
                Tokens Linked
              </p>
              <p className="mt-0.5 font-mono text-xl font-bold">
                {campaign.tokens.length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tokens */}
      <div className="mt-8 glass rounded-xl overflow-hidden">
        <div className="border-b border-white/5 px-5 py-4">
          <h2 className="text-lg font-semibold">Linked Tokens</h2>
        </div>
        <div className="p-5">
          {campaign.tokens.length === 0 ? (
            <p className="py-4 text-center text-sm text-white/30">
              No tokens linked yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left text-[10px] uppercase tracking-wider text-white/30">
                    <th className="pb-3 pr-4 font-medium">Mint Address</th>
                    <th className="pb-3 pr-4 font-medium">Name</th>
                    <th className="pb-3 pr-4 font-medium">Symbol</th>
                    <th className="pb-3 pr-4 font-medium">Deployer</th>
                    <th className="pb-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {campaign.tokens.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-white/[0.03] last:border-0"
                    >
                      <td className="py-3 pr-4 font-mono text-xs text-white/60">
                        {t.mintAddress.slice(0, 8)}…{t.mintAddress.slice(-6)}
                      </td>
                      <td className="py-3 pr-4 text-white/70">
                        {t.name || "—"}
                      </td>
                      <td className="py-3 pr-4 text-white/70">
                        {t.symbol || "—"}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-white/60">
                        {t.deployerWallet.slice(0, 8)}…
                        {t.deployerWallet.slice(-6)}
                      </td>
                      <td className="py-3 text-xs text-white/40">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Activity Feed */}
      <div className="mt-6 glass rounded-xl overflow-hidden">
        <div className="border-b border-white/5 px-5 py-4">
          <h2 className="text-lg font-semibold">Activity</h2>
        </div>
        <div className="p-5">
          {campaign.events.length === 0 ? (
            <p className="py-4 text-center text-sm text-white/30">
              No activity yet.
            </p>
          ) : (
            <div className="space-y-1 font-mono text-sm">
              {campaign.events.map((event) => (
                <div
                  key={event.id}
                  className="flex gap-3 rounded px-2 py-1.5 leading-relaxed transition-colors hover:bg-white/[0.02]"
                >
                  <span className="shrink-0 tabular-nums text-white/20">
                    {new Date(event.timestamp).toLocaleTimeString("en-US", {
                      hour12: false,
                    })}
                  </span>
                  <span
                    className={`w-24 shrink-0 pt-0.5 text-xs font-semibold uppercase ${
                      typeColors[event.type] || "text-gray-400"
                    }`}
                  >
                    {event.type.replace(/_/g, " ")}
                  </span>
                  <span className="text-white/70">{event.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
