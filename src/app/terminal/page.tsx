"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TerminalEvent {
  id?: string;
  type: string;
  campaignId?: string | null;
  campaignName?: string;
  message: string;
  timestamp: string;
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

function getTypeColor(type: string): string {
  return typeColors[type] || "text-gray-400";
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour12: false });
}

export default function TerminalPage() {
  const [events, setEvents] = useState<TerminalEvent[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>(
    []
  );
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load history
  useEffect(() => {
    fetch("/api/events/history")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setEvents(data);
      })
      .catch(() => {});

    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data))
          setCampaigns(data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      })
      .catch(() => {});
  }, []);

  // SSE connection
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const event: TerminalEvent = JSON.parse(e.data);
        setEvents((prev) => [...prev, event]);
      } catch {
        // ignore parse errors
      }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [events, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    setAutoScroll(isAtBottom);
  }, []);

  const filtered =
    filter === "all"
      ? events
      : events.filter((e) => e.campaignId === filter);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-black">
      {/* Terminal header */}
      <div className="flex items-center justify-between border-b border-emerald-500/20 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div
              className={`h-2.5 w-2.5 rounded-full ${
                connected ? "bg-emerald-400 animate-pulse" : "bg-red-400"
              }`}
            />
            <span className="font-mono text-xs text-muted-foreground">
              {connected ? "LIVE" : "DISCONNECTED"}
            </span>
          </div>
          <span className="font-mono text-sm text-emerald-400">
            PumpFundMe Terminal
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">
            {filtered.length} events
          </span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded border border-emerald-500/20 bg-black px-2 py-1 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          >
            <option value="all">All Campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Terminal body */}
      <ScrollArea className="flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto p-4 font-mono text-sm"
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/50">
              <p className="text-lg">▌</p>
              <p className="mt-2 text-xs">Waiting for events…</p>
            </div>
          ) : (
            filtered.map((event, i) => (
              <div
                key={event.id || i}
                className="mb-1 flex gap-3 leading-relaxed hover:bg-emerald-500/5 rounded px-1 -mx-1"
              >
                <span className="shrink-0 text-muted-foreground/50 tabular-nums">
                  {formatTimestamp(event.timestamp)}
                </span>
                <span
                  className={`shrink-0 w-24 uppercase text-xs font-semibold pt-0.5 ${getTypeColor(
                    event.type
                  )}`}
                >
                  {event.type.replace(/_/g, " ")}
                </span>
                {event.campaignName && (
                  <span className="shrink-0 text-foreground/60">
                    [{event.campaignName}]
                  </span>
                )}
                <span className="text-foreground/90">{event.message}</span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Auto-scroll indicator */}
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true);
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }}
          className="absolute bottom-4 right-4 rounded-full border border-emerald-500/30 bg-black/80 px-3 py-1 font-mono text-xs text-emerald-400 backdrop-blur hover:bg-emerald-500/10 transition-colors"
        >
          ↓ Resume auto-scroll
        </button>
      )}
    </div>
  );
}
