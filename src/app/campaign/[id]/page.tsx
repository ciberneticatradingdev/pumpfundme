"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { FeesDashboard } from "@/components/fees-dashboard";
import { FeeHistory } from "@/components/fee-history";
import { TokenImage } from "@/components/token-image";

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

interface Transaction {
  id: string;
  type: string;
  amountSol: number;
  amountUsd: number | null;
  txSignature: string | null;
  solscanUrl: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
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

function getTxLabel(tx: { type: string; metadata?: Record<string, unknown> | null }): string {
  if (tx.metadata?.correction) return "Correction";
  const labels: Record<string, string> = {
    FEE_RECEIVED: "Fee Claimed",
    SOL_SWAP: "SOL → USDT",
    USDT_TRANSFER: "SOL → Kolo",
    SOL_TRANSFER: "SOL → Kolo",
    DONATION: "Donation",
  };
  return labels[tx.type] ?? tx.type;
}

function getTxColor(tx: { type: string; metadata?: Record<string, unknown> | null }): string {
  if (tx.metadata?.correction) return "bg-orange-100 text-orange-700";
  const colors: Record<string, string> = {
    FEE_RECEIVED: "bg-emerald-100 text-emerald-700",
    SOL_SWAP: "bg-blue-100 text-blue-700",
    USDT_TRANSFER: "bg-purple-100 text-purple-700",
    SOL_TRANSFER: "bg-purple-100 text-purple-700",
    DONATION: "bg-pink-100 text-pink-700",
  };
  return colors[tx.type] ?? "bg-gray-100 text-gray-600";
}

const PIPELINE_STEPS = [
  { type: "FEE_RECEIVED", label: "Fees Claimed", icon: "💰" },
  { type: "USDT_TRANSFER", label: "Sent to Kolo", icon: "📤" },
  { type: "DONATION", label: "Donated", icon: "❤️" },
];

const typeColors: Record<string, string> = {
  fee_received: "text-emerald-400",
  sol_transfer: "text-blue-400",
  sol_swap: "text-blue-400",
  correction: "text-orange-400",
  donation: "text-purple-400",
  campaign_created: "text-yellow-400",
  token_registered: "text-cyan-400",
  error: "text-red-400",
  info: "text-gray-400",
};

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-600 border-emerald-200",
  PAUSED: "bg-yellow-50 text-yellow-600 border-yellow-200",
  COMPLETED: "bg-blue-50 text-blue-600 border-blue-200",
};

function shortSig(sig: string): string {
  return sig.slice(0, 8) + "…" + sig.slice(-6);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/campaigns/${id}`).then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      }),
      fetch(`/api/transactions?campaignId=${id}&limit=100`).then((r) =>
        r.ok ? r.json() : { transactions: [] }
      ),
    ])
      .then(([camp, txData]) => {
        setCampaign(camp);
        setTransactions(txData.transactions ?? []);
      })
      .catch(() => setError("Campaign not found"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-500" />
        <p className="mt-4 text-sm text-gray-400">Loading campaign…</p>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="mx-auto max-w-lg px-4 py-32 text-center">
        <div className="glass rounded-2xl p-12">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-500">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold">Campaign Not Found</h2>
          <p className="mt-2 text-sm text-gray-500">
            {error || "This campaign doesn't exist or has been removed."}
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex h-10 items-center rounded-lg border border-gray-200 bg-gray-50 px-4 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Compute real SOL received from transactions (not the possibly-stale DB field)
  const realSolReceived = transactions
    .filter((tx) => tx.type === "FEE_RECEIVED" && tx.status === "CONFIRMED")
    .reduce((sum, tx) => sum + tx.amountSol, 0);

  // Compute real USD transferred
  const realUsdTransferred = transactions
    .filter((tx) => (tx.type === "USDT_TRANSFER" || tx.type === "SOL_TRANSFER") && tx.status === "CONFIRMED")
    .reduce((sum, tx) => sum + (tx.amountUsd ?? 0), 0);

  // Compute pipeline progress
  const pipelineProgress = PIPELINE_STEPS.map((step) => {
    const stepTxs = transactions.filter(
      (tx) => tx.type === step.type && tx.status === "CONFIRMED"
    );
    const total = stepTxs.reduce(
      (sum, tx) => sum + (tx.amountUsd ?? tx.amountSol ?? 0),
      0
    );
    return { ...step, done: stepTxs.length > 0, count: stepTxs.length, total, txs: stepTxs };
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 animate-fade-in-up">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-emerald-600"
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
            <p className="mt-2 max-w-2xl text-gray-500">{campaign.description}</p>
          )}
        </div>
        <a
          href={campaign.goFundMeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 shrink-0 items-center rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-white transition-all hover:bg-emerald-400 active:scale-95"
        >
          GoFundMe ↗
        </a>
      </div>

      {/* Stat cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400">SOL Received</p>
              <p className="mt-0.5 font-mono text-xl font-bold text-emerald-600">
                {realSolReceived.toFixed(4)}
              </p>
            </div>
          </div>
        </div>

        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-500">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400">USD Transferred</p>
              <p className="mt-0.5 font-mono text-xl font-bold">
                ${realUsdTransferred.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-50 text-pink-500">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400">USD Donated</p>
              <p className="mt-0.5 font-mono text-xl font-bold">
                ${campaign.totalDonatedUsd.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Verified Tokens — prominent with CA and pump.fun links */}
      {campaign.tokens.length > 0 && (
        <div className="mt-8 space-y-3">
          {campaign.tokens.map((t) => (
            <div key={t.id} className="glass rounded-xl p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <TokenImage mintAddress={t.mintAddress} size={44} className="shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {t.name || t.symbol || "Token"}
                      </span>
                      {t.symbol && t.name && (
                        <span className="text-xs text-gray-400">${t.symbol}</span>
                      )}
                      <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                        ✓ Verified
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-gray-500 break-all select-all">
                      {t.mintAddress}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:shrink-0">
                  <a
                    href={`https://pump.fun/coin/${t.mintAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-emerald-600"
                  >
                    pump.fun ↗
                  </a>
                  <a
                    href={`https://solscan.io/token/${t.mintAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-emerald-600"
                  >
                    Solscan ↗
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Transparency Timeline */}
      <div className="mt-8 glass rounded-xl overflow-hidden">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold">Pipeline Progress</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Every step from fees to donation — verifiable on-chain.
          </p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {pipelineProgress.map((step, i) => (
              <div key={step.type} className={`relative rounded-xl border p-4 ${step.done ? "border-emerald-200 bg-emerald-50" : "border-gray-100 bg-gray-50"}`}>
                {i < pipelineProgress.length - 1 && (
                  <div className="pointer-events-none absolute -right-2 top-1/2 hidden -translate-y-1/2 sm:block">
                    <svg className="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                )}
                <div className={`text-2xl mb-2 ${step.done ? "" : "opacity-30"}`}>{step.icon}</div>
                <div className={`text-xs font-semibold ${step.done ? "text-emerald-700" : "text-gray-400"}`}>
                  {step.label}
                </div>
                {step.done ? (
                  <div className="mt-1 text-xs text-gray-500">
                    {step.count} tx{step.count !== 1 && "s"} · ${step.total.toFixed(2)}
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-gray-300">Pending</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Transaction Timeline */}
      {transactions.length > 0 && (
        <div className="mt-6 glass rounded-xl overflow-hidden">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-lg font-semibold">Transaction History</h2>
            <p className="mt-0.5 text-xs text-gray-400">All on-chain transactions for this campaign.</p>
          </div>
          <div className="divide-y divide-gray-50">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50/50 transition-colors">
                <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${getTxColor(tx)}`}>
                  {getTxLabel(tx)}
                </span>
                <span className="font-mono text-sm text-gray-700">
                  {tx.amountSol > 0 ? `${tx.amountSol.toFixed(4)} SOL` : null}
                  {tx.amountUsd != null && tx.amountUsd > 0
                    ? ` $${tx.amountUsd.toFixed(2)}`
                    : null}
                </span>
                <span className="flex-1" />
                {tx.solscanUrl ? (
                  <a
                    href={tx.solscanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-emerald-600 hover:text-emerald-700 hover:underline"
                  >
                    {shortSig(tx.txSignature!)} ↗
                  </a>
                ) : tx.metadata?.receiptUrl ? (
                  <a
                    href={String(tx.metadata.receiptUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-pink-600 hover:underline"
                  >
                    Receipt ↗
                  </a>
                ) : null}
                <span className="text-xs text-gray-400 shrink-0">{formatDate(tx.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fees Section */}
      <div className="mt-8 glass rounded-xl overflow-hidden">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold">Creator Fees</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            Accumulated trading fees from linked tokens. Auto-refreshes every 30s.
          </p>
        </div>
        <div className="p-5">
          <FeesDashboard campaignId={id} showHeader={true} compact={false} />
        </div>
      </div>

      {/* Claim History */}
      <div className="mt-6 glass rounded-xl overflow-hidden">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold">Claim History</h2>
        </div>
        <FeeHistory campaignId={id} />
      </div>

      {/* Activity Feed */}
      <div className="mt-6 glass rounded-xl overflow-hidden">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-semibold">Activity</h2>
        </div>
        <div className="p-5">
          {campaign.events.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">No activity yet.</p>
          ) : (
            <div className="space-y-1 font-mono text-sm">
              {campaign.events.map((event) => (
                <div
                  key={event.id}
                  className="flex gap-3 rounded px-2 py-1.5 leading-relaxed transition-colors hover:bg-gray-50"
                >
                  <span className="shrink-0 tabular-nums text-gray-300">
                    {new Date(event.timestamp).toLocaleTimeString("en-US", { hour12: false })}
                  </span>
                  <span className={`w-24 shrink-0 pt-0.5 text-xs font-semibold uppercase ${typeColors[event.type] || "text-gray-400"}`}>
                    {event.type.replace(/_/g, " ")}
                  </span>
                  <span className="text-gray-700">{event.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
