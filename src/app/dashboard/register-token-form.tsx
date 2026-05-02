"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
        <label className="mb-1 block text-sm font-medium">
          Token Mint Address
        </label>
        <Input
          value={mintAddress}
          onChange={(e) => setMintAddress(e.target.value)}
          placeholder="Token mint address (base58)"
          className="font-mono text-sm"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">
          Deployer Wallet
        </label>
        <Input
          value={deployerWallet}
          onChange={(e) => setDeployerWallet(e.target.value)}
          placeholder="Wallet that deployed the token"
          className="font-mono text-sm"
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={loading}
          className="bg-emerald-500 text-black hover:bg-emerald-400 font-semibold"
        >
          {loading ? "Registering…" : "Register Token"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
