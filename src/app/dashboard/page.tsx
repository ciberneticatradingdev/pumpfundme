"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { CampaignList } from "./campaign-list";
import { FeesDashboard } from "@/components/fees-dashboard";
import { PUMPFUNDME_FEE_WALLETS } from "@/lib/config";

function checkIsAdmin(wallet: string): boolean {
  // Admin = fee wallet holders. Extra admins via ADMIN_WALLETS env on server-side only.
  return PUMPFUNDME_FEE_WALLETS.includes(wallet);
}

interface PipelineStatus {
  solBalanceFeeWallet?: number;
  usdtBalanceFeeWallet?: number;
  usdtBalanceKolo?: number;
  pendingSwapSol?: number;
  lastSwapAt?: string | null;
  lastTransferAt?: string | null;
}

interface ReadyItem {
  campaignId: string;
  campaignName: string;
  goFundMeUrl: string;
  totalTransferred: number;
  totalDonated: number;
  availableToDonate: number;
}

interface Campaign {
  id: string;
  name: string;
}

function PipelineStatusCard({ walletAddress }: { walletAddress: string }) {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/pipeline/status?wallet=${encodeURIComponent(walletAddress)}`);
        if (res.ok) setStatus(await res.json());
      } catch {
        // backend may be unreachable
      } finally {
        setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [walletAddress]);

  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="border-b border-gray-200 px-5 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Pipeline Status</h2>
          <p className="mt-0.5 text-xs text-gray-400">Live wallet balances — refreshes every 30s</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-emerald-600">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Live
        </span>
      </div>
      <div className="p-5">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400 text-sm">Loading…</div>
        ) : !status ? (
          <div className="flex items-center justify-center py-8 text-gray-400 text-sm">Backend unavailable</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500">
                SOL in Fee Wallet
              </div>
              <div className="mt-2 font-mono text-2xl font-bold text-emerald-700">
                {status.solBalanceFeeWallet != null ? status.solBalanceFeeWallet.toFixed(4) : "—"} SOL
              </div>
              <div className="mt-1 text-[11px] text-emerald-400">Fee collection wallet</div>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-500">
                USDT in Fee Wallet
              </div>
              <div className="mt-2 font-mono text-2xl font-bold text-blue-700">
                ${status.usdtBalanceFeeWallet != null ? status.usdtBalanceFeeWallet.toFixed(2) : "—"}
              </div>
              <div className="mt-1 text-[11px] text-blue-400">Post-swap balance</div>
            </div>
            <div className="rounded-xl border border-purple-100 bg-purple-50 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-purple-500">
                USDT in Kolo
              </div>
              <div className="mt-2 font-mono text-2xl font-bold text-purple-700">
                ${status.usdtBalanceKolo != null ? status.usdtBalanceKolo.toFixed(2) : "—"}
              </div>
              <div className="mt-1 text-[11px] text-purple-400">Ready to donate</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReadyToDonateSection({
  walletAddress,
  onDonationRecorded,
}: {
  walletAddress: string;
  onDonationRecorded: () => void;
}) {
  const [ready, setReady] = useState<ReadyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ReadyItem | null>(null);
  const [form, setForm] = useState({ amountUsd: "", receiptUrl: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications/ready?wallet=${encodeURIComponent(walletAddress)}`);
      if (res.ok) {
        const data = await res.json();
        setReady(data.ready ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSelect = (item: ReadyItem) => {
    setSelected(item);
    setForm({ amountUsd: item.availableToDonate.toFixed(2), receiptUrl: "", notes: "" });
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/donations/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: selected.campaignId,
          amountUsd: parseFloat(form.amountUsd),
          receiptUrl: form.receiptUrl || undefined,
          notes: form.notes || undefined,
          walletAddress,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to record donation");
      } else {
        setSuccess(`Recorded $${parseFloat(form.amountUsd).toFixed(2)} donation for ${selected.campaignName}`);
        setSelected(null);
        setForm({ amountUsd: "", receiptUrl: "", notes: "" });
        await load();
        onDonationRecorded();
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="text-lg font-semibold">Ready to Donate</h2>
        <p className="mt-0.5 text-xs text-gray-400">
          Campaigns with USDT transferred but not yet donated to GoFundMe.
        </p>
      </div>
      <div className="p-5">
        {loading ? (
          <div className="py-6 text-center text-sm text-gray-400">Loading…</div>
        ) : ready.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-400">
            No campaigns awaiting donation — all caught up!
          </div>
        ) : (
          <div className="space-y-3">
            {ready.map((item) => (
              <div key={item.campaignId} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-gray-800">{item.campaignName}</div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    Available: <span className="font-mono font-semibold text-emerald-600">${item.availableToDonate.toFixed(2)}</span>
                    {" · "}Transferred: ${item.totalTransferred.toFixed(2)}
                    {" · "}Donated: ${item.totalDonated.toFixed(2)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={item.goFundMeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100"
                  >
                    GoFundMe ↗
                  </a>
                  <button
                    onClick={() => handleSelect(item)}
                    className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-400"
                  >
                    Record Donation
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {selected && (
          <form onSubmit={handleSubmit} className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-emerald-800">Record Donation — {selected.campaignName}</h3>
              <button type="button" onClick={() => setSelected(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Amount (USD) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={form.amountUsd}
                  onChange={(e) => setForm(f => ({ ...f, amountUsd: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">GoFundMe Receipt URL</label>
                <input
                  type="url"
                  value={form.receiptUrl}
                  onChange={(e) => setForm(f => ({ ...f, receiptUrl: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                  placeholder="https://gofundme.com/..."
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                placeholder="Optional notes…"
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-9 items-center rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-white transition-all hover:bg-emerald-400 disabled:opacity-50"
            >
              {submitting ? "Recording…" : "Record Donation"}
            </button>
          </form>
        )}

        {success && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        )}
      </div>
    </div>
  );
}

function RecordDonationForm({
  campaigns,
  walletAddress,
}: {
  campaigns: Campaign[];
  walletAddress: string;
}) {
  const [form, setForm] = useState({ campaignId: "", amountUsd: "", receiptUrl: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/donations/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: form.campaignId,
          amountUsd: parseFloat(form.amountUsd),
          receiptUrl: form.receiptUrl || undefined,
          notes: form.notes || undefined,
          walletAddress,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to record donation");
      } else {
        setSuccess("Donation recorded successfully!");
        setForm({ campaignId: "", amountUsd: "", receiptUrl: "", notes: "" });
      }
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="border-b border-gray-200 px-5 py-4">
        <h2 className="text-lg font-semibold">Record Donation</h2>
        <p className="mt-0.5 text-xs text-gray-400">
          Manually record a donation you made on GoFundMe.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Campaign *</label>
            <select
              required
              value={form.campaignId}
              onChange={(e) => setForm(f => ({ ...f, campaignId: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
            >
              <option value="">Select campaign…</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount (USD) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={form.amountUsd}
              onChange={(e) => setForm(f => ({ ...f, amountUsd: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Receipt URL</label>
            <input
              type="url"
              value={form.receiptUrl}
              onChange={(e) => setForm(f => ({ ...f, receiptUrl: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
              placeholder="https://gofundme.com/…"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
              placeholder="Optional notes…"
            />
          </div>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {success && <p className="text-sm text-emerald-600">{success}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-10 items-center rounded-lg bg-emerald-500 px-6 text-sm font-semibold text-white transition-all hover:bg-emerald-400 disabled:opacity-50"
        >
          {submitting ? "Recording…" : "Record Donation"}
        </button>
      </form>
    </div>
  );
}

export default function DashboardPage() {
  const { publicKey, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const walletAddress = publicKey?.toBase58() ?? "";
  const isAdmin = checkIsAdmin(walletAddress);

  useEffect(() => {
    if (!publicKey || !isAdmin) return;
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((d) => setCampaigns(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [publicKey, isAdmin, refreshKey]);

  if (!publicKey) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center px-4 py-32 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
          <svg
            className="h-8 w-8 text-emerald-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Connect your wallet</h2>
        <p className="mt-2 text-sm text-gray-500">
          Connect your Solana wallet to access the dashboard and manage campaigns.
        </p>
        <button
          onClick={() => setVisible(true)}
          disabled={connecting}
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-emerald-500 px-6 text-sm font-semibold text-white transition-all hover:bg-emerald-400 active:scale-95 disabled:opacity-50"
        >
          {connecting ? "Connecting…" : "Connect Wallet"}
        </button>
      </div>
    );
  }

  if (isAdmin) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 animate-fade-in-up">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Dashboard</h1>
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
              Admin
            </span>
          </div>
          <p className="mt-2 text-gray-500">Manage campaigns and track the donation pipeline.</p>
        </div>

        <div className="mb-8 animate-fade-in-up">
          <PipelineStatusCard walletAddress={walletAddress} />
        </div>

        <div className="mb-8 animate-fade-in-up">
          <ReadyToDonateSection
            walletAddress={walletAddress}
            onDonationRecorded={() => setRefreshKey(k => k + 1)}
          />
        </div>

        <div className="mb-8 animate-fade-in-up">
          <div className="glass rounded-xl overflow-hidden">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-xl font-bold tracking-tight">Fee Overview</h2>
              <p className="mt-0.5 text-sm text-gray-500">Claimable creator fees across all campaigns.</p>
            </div>
            <div className="p-5">
              <FeesDashboard showHeader={false} refreshInterval={30_000} />
            </div>
          </div>
        </div>

        <div className="mb-8 animate-fade-in-up">
          <RecordDonationForm campaigns={campaigns} walletAddress={walletAddress} />
        </div>

        <div className="animate-fade-in-up">
          <CampaignList walletAddress={walletAddress} filterByWallet={false} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 animate-fade-in-up">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Dashboard</h1>
        <p className="mt-2 text-gray-500">Your campaigns and donation status.</p>
      </div>

      <div className="animate-fade-in-up">
        <CampaignList walletAddress={walletAddress} filterByWallet={true} />
      </div>
    </div>
  );
}
