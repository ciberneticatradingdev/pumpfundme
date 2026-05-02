"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  onSuccess: () => void;
}

export function CreateCampaignForm({ onSuccess }: Props) {
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
        body: JSON.stringify({ name, description, goFundMeUrl }),
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
        <label className="mb-1 block text-sm font-medium">Campaign Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Save the Rainforest"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Description</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this campaign about?"
          rows={3}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">GoFundMe URL</label>
        <Input
          value={goFundMeUrl}
          onChange={(e) => setGoFundMeUrl(e.target.value)}
          placeholder="https://gofundme.com/f/your-campaign"
          type="url"
          required
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        type="submit"
        disabled={loading}
        className="bg-emerald-500 text-black hover:bg-emerald-400 font-semibold"
      >
        {loading ? "Creating…" : "Create Campaign"}
      </Button>
    </form>
  );
}
