"use client";

import { useEffect, useState, useCallback } from "react";

interface TokenFee {
  mintAddress: string;
  campaignId?: string;
  campaignName?: string;
  name?: string | null;
  symbol?: string | null;
  sharingConfigAddress: string;
  vaultAddress: string;
  balanceLamports: number;
  balanceSol: number;
  claimableLamports: number;
  claimableSol: number;
}

interface FeeData {
  tokens: TokenFee[];
  totalClaimableLamports: number;
  totalClaimableSol: number;
  campaignId?: string;
  campaignName?: string;
}

interface Props {
  campaignId?: string;
  showHeader?: boolean;
  refreshInterval?: number;
  compact?: boolean;
}

function formatSol(sol: number): string {
  if (sol === 0) return "0";
  if (sol < 0.001) return sol.toFixed(6);
  if (sol < 1) return sol.toFixed(4);
  return sol.toFixed(2);
}

function SolAmount({
  sol,
  size = "base",
}: {
  sol: number;
  size?: "sm" | "base" | "lg" | "xl";
}) {
  const sizeClasses = {
    sm: "text-sm",
    base: "text-base",
    lg: "text-lg",
    xl: "text-2xl",
  };
  return (
    <span
      className={`font-mono font-bold text-emerald-600 ${sizeClasses[size]}`}
    >
      {formatSol(sol)}{" "}
      <span className="text-gray-400 font-normal text-xs">SOL</span>
    </span>
  );
}

export function FeesDashboard({
  campaignId,
  showHeader = true,
  refreshInterval = 30_000,
  compact = false,
}: Props) {
  const [data, setData] = useState<FeeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimingMint, setClaimingMint] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const claimSingle = async (mintAddress: string) => {
    setClaimingMint(mintAddress);
    setClaimResult(null);
    try {
      const res = await fetch("/api/fees/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mintAddress }),
      });
      const json = await res.json();
      if (json.success) {
        setClaimResult({ ok: true, msg: `Claimed ${json.claims[0]?.amountSol?.toFixed(6) ?? ''} SOL!` });
        fetchFees();
      } else {
        setClaimResult({ ok: false, msg: json.error || "Claim failed" });
      }
    } catch (e) {
      setClaimResult({ ok: false, msg: e instanceof Error ? e.message : "Claim failed" });
    } finally {
      setClaimingMint(null);
    }
  };

  const fetchFees = useCallback(async () => {
    try {
      const url = campaignId
        ? `/api/fees/balances/${campaignId}`
        : `/api/fees/balances`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastUpdated(new Date());
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load fees");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchFees();
    const interval = setInterval(fetchFees, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchFees, refreshInterval]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-8 justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-500" />
        <span className="text-sm text-gray-400">Loading fee data…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={fetchFees}
          className="mt-2 text-xs text-red-500 underline hover:text-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.tokens.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center">
        <p className="text-sm text-gray-400">No tokens with fee data.</p>
      </div>
    );
  }

  return (
    <div className={compact ? "" : "space-y-4"}>
      {/* Claim result toast */}
      {claimResult && (
        <div
          className={`rounded-xl p-3 text-sm font-medium ${
            claimResult.ok
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {claimResult.msg}
          <button
            onClick={() => setClaimResult(null)}
            className="ml-2 text-xs underline opacity-60 hover:opacity-100"
          >
            dismiss
          </button>
        </div>
      )}

      {showHeader && (
        <div className="glass rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-gray-400">
                Total Claimable Fees
              </p>
              <div className="mt-1">
                <SolAmount sol={data.totalClaimableSol} size="xl" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              {lastUpdated && (
                <span className="text-[10px] text-gray-300">
                  Updated {lastUpdated.toLocaleTimeString()}
                </span>
              )}
              {data.totalClaimableSol > 0 && (
                <button
                  onClick={async () => {
                    setClaiming(true);
                    setClaimResult(null);
                    try {
                      const body = campaignId
                        ? { campaignId }
                        : data.tokens.length === 1
                          ? { mintAddress: data.tokens[0].mintAddress }
                          : { campaignId: data.tokens[0]?.campaignId };
                      const res = await fetch("/api/fees/claim", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body),
                      });
                      const json = await res.json();
                      if (json.success) {
                        const count = json.claims?.length ?? 0;
                        setClaimResult({ ok: true, msg: `Claimed ${count} token(s) successfully!` });
                        fetchFees();
                      } else {
                        setClaimResult({ ok: false, msg: json.error || "Claim failed" });
                      }
                    } catch (e) {
                      setClaimResult({ ok: false, msg: e instanceof Error ? e.message : "Claim failed" });
                    } finally {
                      setClaiming(false);
                    }
                  }}
                  disabled={claiming}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-white transition-all hover:bg-emerald-400 active:scale-95 disabled:opacity-50"
                >
                  {claiming ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Claiming…
                    </>
                  ) : (
                    "Claim All"
                  )}
                </button>
              )}
              <button
                onClick={fetchFees}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
                title="Refresh"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`glass rounded-xl overflow-hidden ${compact ? "" : ""}`}>
        {!compact && (
          <div className="border-b border-gray-200 px-5 py-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Fee Balances by Token</h3>
            <span className="text-xs text-gray-400">
              {data.tokens.length} token{data.tokens.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
        <div className="divide-y divide-gray-100">
          {data.tokens.map((token) => (
            <div
              key={token.mintAddress}
              className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-gray-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
                  <span className="truncate font-mono text-xs text-gray-600">
                    {token.name || token.symbol
                      ? `${token.name ?? token.symbol}`
                      : `${token.mintAddress.slice(0, 8)}…${token.mintAddress.slice(-4)}`}
                  </span>
                  {(token.name || token.symbol) && (
                    <span className="font-mono text-[10px] text-gray-300">
                      {token.mintAddress.slice(0, 6)}…
                      {token.mintAddress.slice(-4)}
                    </span>
                  )}
                </div>
                {!campaignId && token.campaignName && (
                  <p className="ml-4 text-[10px] text-gray-400">
                    {token.campaignName}
                  </p>
                )}
              </div>
              <div className="ml-4 flex items-center gap-2">
                <div className="text-right">
                  <SolAmount sol={token.claimableSol} size="sm" />
                  {token.claimableSol > 0 &&
                    token.balanceSol !== token.claimableSol && (
                      <p className="text-[10px] text-gray-300">
                        vault: {formatSol(token.balanceSol)} SOL
                      </p>
                    )}
                </div>
                {token.claimableSol >= 0.02 && (
                  <button
                    onClick={() => claimSingle(token.mintAddress)}
                    disabled={claimingMint === token.mintAddress || claiming}
                    className="inline-flex h-6 items-center rounded-md bg-emerald-100 px-2 text-[10px] font-semibold text-emerald-700 transition-all hover:bg-emerald-200 active:scale-95 disabled:opacity-50"
                  >
                    {claimingMint === token.mintAddress ? "…" : "Claim"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact fee summary card for campaign cards.
 * Accepts claimableSol as a prop — parent is responsible for fetching data
 * once and passing it down (avoids N+1 API calls per campaign card).
 *
 * claimableSol meanings:
 *   undefined → still loading
 *   null      → data unavailable / error
 *   number    → actual value (0 is valid)
 */
export function FeeSummaryCard({
  claimableSol,
}: {
  claimableSol: number | null | undefined;
}) {
  return (
    <div className="rounded-lg bg-emerald-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-gray-400">
        Fees Claimable
      </p>
      {claimableSol === undefined ? (
        <div className="mt-1 h-4 w-16 animate-pulse rounded bg-emerald-100" />
      ) : (
        <p className="mt-0.5 font-mono text-sm font-semibold text-emerald-600">
          {claimableSol !== null
            ? `${claimableSol < 0.001 && claimableSol > 0 ? claimableSol.toFixed(6) : claimableSol < 1 ? claimableSol.toFixed(4) : claimableSol.toFixed(2)}`
            : "—"}{" "}
          <span className="text-xs font-normal text-gray-400">SOL</span>
        </p>
      )}
    </div>
  );
}
