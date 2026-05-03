"use client";

import { useEffect, useState } from "react";

interface ClaimRecord {
  id: string;
  campaignId: string;
  campaignName: string;
  tokenMint: string | null;
  tokenName: string | null;
  tokenSymbol: string | null;
  amountSol: number;
  amountUsd: number | null;
  txSignature: string | null;
  status: string;
  createdAt: string;
}

interface Props {
  campaignId?: string;
  limit?: number;
}

export function FeeHistory({ campaignId, limit = 50 }: Props) {
  const [records, setRecords] = useState<ClaimRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const params = new URLSearchParams();
        if (campaignId) params.set("campaignId", campaignId);
        const res = await fetch(`/api/fees/history?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        setRecords(data.transactions?.slice(0, limit) ?? []);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [campaignId, limit]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-6 justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-500" />
        <span className="text-sm text-gray-400">Loading history…</span>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-gray-400">No claim history yet.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {records.map((r) => (
        <div
          key={r.id}
          className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-gray-50"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  r.status === "CONFIRMED"
                    ? "bg-emerald-400"
                    : r.status === "FAILED"
                      ? "bg-red-400"
                      : "bg-yellow-400"
                }`}
              />
              <span className="text-sm text-gray-700">
                {r.tokenName ?? r.tokenSymbol ?? (r.tokenMint ? `${r.tokenMint.slice(0, 8)}…` : "Unknown")}
              </span>
              {!campaignId && (
                <span className="text-[10px] text-gray-400">
                  {r.campaignName}
                </span>
              )}
            </div>
            <div className="ml-4 flex items-center gap-2 text-[10px] text-gray-400">
              <span>{new Date(r.createdAt).toLocaleDateString()}</span>
              {r.txSignature && (
                <a
                  href={`https://solscan.io/tx/${r.txSignature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono hover:text-emerald-600 hover:underline"
                >
                  {r.txSignature.slice(0, 8)}…
                </a>
              )}
            </div>
          </div>
          <div className="ml-4 text-right">
            <span className="font-mono text-sm font-bold text-emerald-600">
              +{r.amountSol.toFixed(4)}
            </span>
            <span className="ml-1 text-xs text-gray-400">SOL</span>
          </div>
        </div>
      ))}
    </div>
  );
}
