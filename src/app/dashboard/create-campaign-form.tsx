"use client";

import { useState } from "react";

interface Props {
  walletAddress: string;
  onSuccess: () => void;
}

export function CreateCampaignForm({ walletAddress, onSuccess }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goFundMeUrl, setGoFundMeUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          goFundMeUrl,
          creatorWallet: walletAddress,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create campaign");
        return;
      }

      onSuccess();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Campaign Name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Save the Rainforest"
          required
          className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/25"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this campaign about?"
          rows={3}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/25 resize-none"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          GoFundMe URL
        </label>
        <input
          value={goFundMeUrl}
          onChange={(e) => setGoFundMeUrl(e.target.value)}
          placeholder="https://gofundme.com/f/your-campaign"
          type="url"
          required
          className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/25"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-10 items-center rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-white transition-all hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            Creating…
          </span>
        ) : (
          "Create Campaign"
        )}
      </button>
    </form>
  );
}
