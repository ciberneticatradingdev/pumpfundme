"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Token {
  id: string;
  mintAddress: string;
  deployerWallet: string;
  name: string | null;
  symbol: string | null;
  createdAt: string;
}

interface Event {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  campaignName?: string;
}

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  goFundMeUrl: string;
  status: string;
  totalSolReceived: number;
  totalDonatedUsd: number;
  createdAt: string;
  tokens: Token[];
  events: Event[];
}

const typeColors: Record<string, string> = {
  fee_received: "text-emerald-400",
  sol_transfer: "text-blue-400",
  donation: "text-purple-400",
  campaign_created: "text-yellow-400",
  token_registered: "text-cyan-400",
  error: "text-red-400",
  info: "text-gray-400",
};

export default function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/campaigns/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then(setCampaign)
      .catch(() => setError("Campaign not found"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 text-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 text-center">
        <p className="text-destructive">{error || "Campaign not found"}</p>
        <Link
          href="/dashboard"
          className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
        >
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  const statusColor =
    campaign.status === "ACTIVE"
      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
      : campaign.status === "PAUSED"
      ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
      : "bg-blue-500/20 text-blue-400 border-blue-500/30";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Dashboard
        </Link>
        <div className="mt-4 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{campaign.name}</h1>
              <Badge variant="outline" className={statusColor}>
                {campaign.status}
              </Badge>
            </div>
            {campaign.description && (
              <p className="mt-2 text-muted-foreground max-w-2xl">
                {campaign.description}
              </p>
            )}
          </div>
          <a
            href={campaign.goFundMeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              buttonVariants(),
              "bg-emerald-500 text-black hover:bg-emerald-400 font-semibold"
            )}
          >
            GoFundMe ↗
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-1">SOL Received</p>
            <p className="text-2xl font-bold font-mono text-emerald-400">
              {campaign.totalSolReceived.toFixed(4)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-1">USD Donated</p>
            <p className="text-2xl font-bold font-mono">
              ${campaign.totalDonatedUsd.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-1">Tokens Linked</p>
            <p className="text-2xl font-bold font-mono">
              {campaign.tokens.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tokens Table */}
      <Card className="border-border/50 bg-card/50 mb-8">
        <CardHeader>
          <CardTitle className="text-lg">Linked Tokens</CardTitle>
        </CardHeader>
        <CardContent>
          {campaign.tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No tokens linked yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mint Address</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Deployer</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaign.tokens.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">
                      {t.mintAddress.slice(0, 8)}…{t.mintAddress.slice(-6)}
                    </TableCell>
                    <TableCell>{t.name || "—"}</TableCell>
                    <TableCell>{t.symbol || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {t.deployerWallet.slice(0, 8)}…
                      {t.deployerWallet.slice(-6)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Separator className="mb-8" />

      {/* Activity Feed */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader>
          <CardTitle className="text-lg">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {campaign.events.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No activity yet.
            </p>
          ) : (
            <div className="space-y-2 font-mono text-sm">
              {campaign.events.map((event) => (
                <div
                  key={event.id}
                  className="flex gap-3 leading-relaxed rounded px-2 py-1 hover:bg-emerald-500/5"
                >
                  <span className="shrink-0 text-muted-foreground/50 tabular-nums">
                    {new Date(event.timestamp).toLocaleTimeString("en-US", {
                      hour12: false,
                    })}
                  </span>
                  <span
                    className={`shrink-0 w-24 uppercase text-xs font-semibold pt-0.5 ${
                      typeColors[event.type] || "text-gray-400"
                    }`}
                  >
                    {event.type.replace(/_/g, " ")}
                  </span>
                  <span className="text-foreground/90">{event.message}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
