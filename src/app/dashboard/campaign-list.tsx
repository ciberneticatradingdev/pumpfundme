"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreateCampaignForm } from "./create-campaign-form";
import { RegisterTokenForm } from "./register-token-form";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  goFundMeUrl: string;
  status: string;
  totalSolReceived: number;
  totalDonatedUsd: number;
  _count?: { tokens: number };
}

const statusStyles: Record<string, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-600 border-emerald-200",
  PAUSED: "bg-yellow-50 text-yellow-600 border-yellow-200",
  COMPLETED: "bg-blue-50 text-blue-600 border-blue-200",
};

export function CampaignList() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [registerTokenFor, setRegisterTokenFor] = useState<string | null>(null);

  const fetchCampaigns = async () => {
    try {
      const res = await fetch("/api/campaigns");
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-500" />
        <p className="mt-4 text-sm text-gray-400">Loading campaigns…</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      {/* Header bar */}
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
        </p>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex h-9 items-center rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white transition-all hover:bg-emerald-400 active:scale-95"
        >
          {showCreate ? "Cancel" : "+ New Campaign"}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="glass mb-6 rounded-xl border-emerald-200 p-6">
          <h3 className="mb-1 text-lg font-semibold">New Campaign</h3>
          <p className="mb-5 text-sm text-gray-500">
            Link a GoFundMe page and start receiving donations.
          </p>
          <CreateCampaignForm
            onSuccess={() => {
              setShowCreate(false);
              fetchCampaigns();
            }}
          />
        </div>
      )}

      {/* Register token form */}
      {registerTokenFor && (
        <div className="glass mb-6 rounded-xl border-emerald-200 p-6">
          <h3 className="mb-1 text-lg font-semibold">Register Token</h3>
          <p className="mb-5 text-sm text-gray-500">
            Link a pump.fun token to this campaign.
          </p>
          <RegisterTokenForm
            campaignId={registerTokenFor}
            onSuccess={() => {
              setRegisterTokenFor(null);
              fetchCampaigns();
            }}
            onCancel={() => setRegisterTokenFor(null)}
          />
        </div>
      )}

      {/* Empty state */}
      {campaigns.length === 0 ? (
        <div className="glass rounded-2xl border-dashed p-16 text-center">
          <div className="mx-auto mb-6 text-gray-300 font-mono text-sm leading-relaxed whitespace-pre">
{`    ╔══════════════════╗
    ║   No campaigns   ║
    ║      yet         ║
    ╚══════════════════╝`}
          </div>
          <p className="text-gray-500">Create your first campaign to get started.</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 inline-flex h-9 items-center rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white transition-all hover:bg-emerald-400 active:scale-95"
          >
            Create Campaign
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <div
              key={c.id}
              className="glass glass-hover group rounded-xl p-5 transition-all duration-200 hover:scale-[1.02]"
            >
              {/* Header */}
              <div className="mb-3 flex items-start justify-between">
                <Link href={`/campaign/${c.id}`}>
                  <h3 className="text-lg font-semibold transition-colors hover:text-emerald-600">
                    {c.name}
                  </h3>
                </Link>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    statusStyles[c.status] || ""
                  }`}
                >
                  {c.status}
                </span>
              </div>

              {c.description && (
                <p className="mb-4 line-clamp-2 text-sm text-gray-500">
                  {c.description}
                </p>
              )}

              {/* Stats */}
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400">
                    SOL Received
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-semibold text-emerald-600">
                    {c.totalSolReceived.toFixed(4)}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400">
                    USD Donated
                  </p>
                  <p className="mt-0.5 font-mono text-sm font-semibold">
                    ${c.totalDonatedUsd.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <a
                  href={c.goFundMeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  GoFundMe ↗
                </a>
                <button
                  onClick={() => setRegisterTokenFor(c.id)}
                  className="inline-flex h-8 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  + Token
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
