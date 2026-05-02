"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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

  const statusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      case "PAUSED":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "COMPLETED":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      default:
        return "";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading campaigns…
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
        </p>
        <Button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-emerald-500 text-black hover:bg-emerald-400 font-semibold"
        >
          {showCreate ? "Cancel" : "Create Campaign"}
        </Button>
      </div>

      {showCreate && (
        <Card className="mb-6 border-emerald-500/30 bg-card/80">
          <CardHeader>
            <CardTitle>New Campaign</CardTitle>
            <CardDescription>
              Link a GoFundMe page and start receiving donations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateCampaignForm
              onSuccess={() => {
                setShowCreate(false);
                fetchCampaigns();
              }}
            />
          </CardContent>
        </Card>
      )}

      {registerTokenFor && (
        <Card className="mb-6 border-emerald-500/30 bg-card/80">
          <CardHeader>
            <CardTitle>Register Token</CardTitle>
            <CardDescription>
              Link a pump.fun token to this campaign.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegisterTokenForm
              campaignId={registerTokenFor}
              onSuccess={() => {
                setRegisterTokenFor(null);
                fetchCampaigns();
              }}
              onCancel={() => setRegisterTokenFor(null)}
            />
          </CardContent>
        </Card>
      )}

      {campaigns.length === 0 ? (
        <Card className="border-dashed border-border/50 bg-card/30">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-4xl mb-4">📋</p>
            <p className="text-muted-foreground">No campaigns yet.</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              Create one to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <Card
              key={c.id}
              className="group border-border/50 bg-card/50 transition-all hover:border-emerald-500/30"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <Link href={`/campaign/${c.id}`}>
                    <CardTitle className="text-lg hover:text-emerald-400 transition-colors cursor-pointer">
                      {c.name}
                    </CardTitle>
                  </Link>
                  <Badge variant="outline" className={statusColor(c.status)}>
                    {c.status}
                  </Badge>
                </div>
                {c.description && (
                  <CardDescription className="line-clamp-2">
                    {c.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">SOL Received</p>
                    <p className="font-mono font-semibold text-emerald-400">
                      {c.totalSolReceived.toFixed(4)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">USD Donated</p>
                    <p className="font-mono font-semibold">
                      ${c.totalDonatedUsd.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <a
                    href={c.goFundMeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    GoFundMe ↗
                  </a>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRegisterTokenFor(c.id)}
                  >
                    + Token
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
