"use client";

import { useCallback, useEffect, useState } from "react";

interface Transaction {
  id: string;
  type: string;
  amountSol: number;
  amountUsd: number | null;
  txSignature: string | null;
  solscanUrl: string | null;
  status: string;
  campaign: { id: string; name: string } | null;
  token: { id: string; mintAddress: string; symbol: string | null } | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface Summary {
  totalSolClaimed: number;
  totalClaimCount: number;
  totalSolSwapped: number;
  totalUsdtFromSwaps: number;
  totalSwapCount: number;
  totalUsdtTransferred: number;
  totalTransferCount: number;
}

const TYPE_LABELS: Record<string, string> = {
  FEE_RECEIVED: "Fee Claimed",
  SOL_SWAP: "SOL → USDT",
  USDT_TRANSFER: "USDT → Kolo",
  SOL_TRANSFER: "SOL Transfer",
  DONATION: "Donation",
};

const TYPE_COLORS: Record<string, string> = {
  FEE_RECEIVED: "bg-emerald-100 text-emerald-700",
  SOL_SWAP: "bg-blue-100 text-blue-700",
  USDT_TRANSFER: "bg-purple-100 text-purple-700",
  SOL_TRANSFER: "bg-gray-100 text-gray-700",
  DONATION: "bg-pink-100 text-pink-700",
};

const FILTERS = [
  { value: "", label: "All" },
  { value: "FEE_RECEIVED", label: "Claims" },
  { value: "SOL_SWAP", label: "Swaps" },
  { value: "USDT_TRANSFER", label: "Transfers" },
];

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

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filter, setFilter] = useState("");
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 25;

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (filter) params.set("type", filter);
      const res = await fetch(`/api/transactions?${params}`);
      const data = await res.json();
      setTransactions(data.transactions ?? []);
      setTotal(data.total ?? 0);
    } catch {
      console.error("Failed to fetch transactions");
    } finally {
      setLoading(false);
    }
  }, [filter, offset]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/transactions/summary");
      const data = await res.json();
      setSummary(data);
    } catch {
      console.error("Failed to fetch summary");
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 30000);
    return () => clearInterval(interval);
  }, [fetchSummary]);

  // Reset offset when filter changes
  useEffect(() => {
    setOffset(0);
  }, [filter]);

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Transaction Ledger</h1>
        <p className="mt-1 text-sm text-gray-500">
          Every fee claim, swap, and transfer — fully transparent and verifiable on-chain.
        </p>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="text-xs font-medium uppercase tracking-wider text-emerald-600">
              Fees Claimed
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-700">
              {summary.totalSolClaimed.toFixed(4)} SOL
            </div>
            <div className="mt-1 text-xs text-emerald-500">
              {summary.totalClaimCount} transaction{summary.totalClaimCount !== 1 && "s"}
            </div>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
            <div className="text-xs font-medium uppercase tracking-wider text-blue-600">
              Swapped to USDT
            </div>
            <div className="mt-2 text-2xl font-bold text-blue-700">
              ${summary.totalUsdtFromSwaps.toFixed(2)}
            </div>
            <div className="mt-1 text-xs text-blue-500">
              {summary.totalSwapCount} swap{summary.totalSwapCount !== 1 && "s"} ({summary.totalSolSwapped.toFixed(4)} SOL)
            </div>
          </div>
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-5">
            <div className="text-xs font-medium uppercase tracking-wider text-purple-600">
              Sent to Charity
            </div>
            <div className="mt-2 text-2xl font-bold text-purple-700">
              ${summary.totalUsdtTransferred.toFixed(2)}
            </div>
            <div className="mt-1 text-xs text-purple-500">
              {summary.totalTransferCount} transfer{summary.totalTransferCount !== 1 && "s"}
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f.value
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Transaction List */}
      <div className="rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            Loading…
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-40">
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">No transactions yet</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs font-medium uppercase tracking-wider text-gray-400">
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Campaign</th>
                    <th className="px-5 py-3">Transaction</th>
                    <th className="px-5 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="transition-colors hover:bg-gray-50/50">
                      <td className="px-5 py-3.5">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLORS[tx.type] ?? "bg-gray-100 text-gray-600"}`}>
                          {TYPE_LABELS[tx.type] ?? tx.type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-sm">
                        {tx.type === "FEE_RECEIVED" || tx.type === "SOL_SWAP" ? (
                          <span>{tx.amountSol.toFixed(4)} SOL</span>
                        ) : null}
                        {tx.amountUsd ? (
                          <span className={tx.type === "SOL_SWAP" ? "ml-2 text-gray-400" : ""}>
                            {tx.type === "SOL_SWAP" && "→ "}${tx.amountUsd.toFixed(2)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3.5 text-gray-600">
                        {tx.campaign?.name ?? (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {tx.solscanUrl ? (
                          <a
                            href={tx.solscanUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs text-emerald-600 hover:text-emerald-700 hover:underline"
                          >
                            {shortSig(tx.txSignature!)}
                            <span className="ml-1 text-[10px]">↗</span>
                          </a>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-400">
                        {formatDate(tx.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y divide-gray-100 md:hidden">
              {transactions.map((tx) => (
                <div key={tx.id} className="px-4 py-3.5">
                  <div className="flex items-center justify-between">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLORS[tx.type] ?? "bg-gray-100 text-gray-600"}`}>
                      {TYPE_LABELS[tx.type] ?? tx.type}
                    </span>
                    <span className="text-xs text-gray-400">{formatDate(tx.createdAt)}</span>
                  </div>
                  <div className="mt-2 font-mono text-sm">
                    {tx.type === "FEE_RECEIVED" || tx.type === "SOL_SWAP" ? (
                      <span>{tx.amountSol.toFixed(4)} SOL</span>
                    ) : null}
                    {tx.amountUsd ? (
                      <span className="ml-2 text-gray-500">
                        {tx.type === "SOL_SWAP" && "→ "}${tx.amountUsd.toFixed(2)}
                      </span>
                    ) : null}
                  </div>
                  {tx.campaign && (
                    <div className="mt-1 text-xs text-gray-500">{tx.campaign.name}</div>
                  )}
                  {tx.solscanUrl && (
                    <a
                      href={tx.solscanUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-block font-mono text-xs text-emerald-600 hover:underline"
                    >
                      {shortSig(tx.txSignature!)} ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-gray-400">
            {total} transaction{total !== 1 && "s"} · Page {currentPage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Previous
            </button>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={offset + limit >= total}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
