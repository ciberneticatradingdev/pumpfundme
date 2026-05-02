"use client";

import { useState } from "react";

interface Props {
  campaignId: string;
  walletAddress: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function RegisterTokenForm({ campaignId, walletAddress, onSuccess, onCancel }: Props) {
  const [mintAddress, setMintAddress] = useState("");
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
        body: JSON.stringify({ mintAddress, deployerWallet: walletAddress }),
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
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Token Contract Address
        </label>
        <input
          value={mintAddress}
          onChange={(e) => setMintAddress(e.target.value)}
          placeholder="Token mint address (base58)"
          required
          className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 font-mono text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/25"
        />
      </div>

      <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
        <p className="text-xs text-gray-500">Registering as deployer:</p>
        <p className="mt-0.5 font-mono text-sm text-gray-700">
          {walletAddress.slice(0, 6)}…{walletAddress.slice(-6)}
        </p>
      </div>

      <p className="text-xs text-gray-400">
        Your connected wallet must be the token&apos;s deployer. This is verified on-chain.
      </p>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-10 items-center rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-white transition-all hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              Verifying…
            </span>
          ) : (
            "Register Token"
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-10 items-center rounded-lg border border-gray-200 bg-gray-50 px-4 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
