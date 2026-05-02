"use client";

import { useState } from "react";

interface Props {
  campaignId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function RegisterTokenForm({ campaignId, onSuccess, onCancel }: Props) {
  const [mintAddress, setMintAddress] = useState("");
  const [deployerWallet, setDeployerWallet] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mintAddress, deployerWallet }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to register token");
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
        <label className="mb-1.5 block text-sm font-medium text-white/70">
          Token Mint Address
        </label>
        <input
          value={mintAddress}
          onChange={(e) => setMintAddress(e.target.value)}
          placeholder="Token mint address (base58)"
          required
          className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 font-mono text-sm text-white placeholder:text-white/25 transition-colors focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/25"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-white/70">
          Deployer Wallet
        </label>
        <input
          value={deployerWallet}
          onChange={(e) => setDeployerWallet(e.target.value)}
          placeholder="Wallet that deployed the token"
          required
          className="h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 font-mono text-sm text-white placeholder:text-white/25 transition-colors focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/25"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-10 items-center rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-black transition-all hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black" />
              Registering…
            </span>
          ) : (
            "Register Token"
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-10 items-center rounded-lg border border-white/10 bg-white/5 px-4 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
