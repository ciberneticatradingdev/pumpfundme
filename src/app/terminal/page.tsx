"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface TerminalEvent {
  id?: string;
  type: string;
  campaignId?: string | null;
  campaignName?: string;
  message: string;
  timestamp: string;
}

const typeColors: Record<string, string> = {
  fee_received: "text-emerald-600",
  sol_transfer: "text-blue-600",
  donation: "text-purple-600",
  campaign_created: "text-yellow-600",
  token_registered: "text-cyan-600",
  error: "text-red-600",
  info: "text-gray-500",
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
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<number>(0);

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
          setCampaigns(
            data.map((c: { id: string; name: string }) => ({
              id: c.id,
              name: c.name,
            }))
          );
      })
      .catch(() => {});
  }, []);

  // SSE connection with reconnect
  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      es = new EventSource("/api/events");

      es.onopen = () => {
        setConnected(true);
        retryRef.current = 0;
      };

      es.onmessage = (e) => {
        try {
          const event: TerminalEvent = JSON.parse(e.data);
          setEvents((prev) => [...prev, event]);
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        setConnected(false);
        es?.close();
        const delay = Math.min(1000 * Math.pow(2, retryRef.current), 30000);
        retryRef.current++;
        reconnectTimeout = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      es?.close();
      clearTimeout(reconnectTimeout);
    };
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
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-white px-4 py-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
        {/* Terminal chrome bar */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* macOS dots */}
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-400" />
              <div className="h-3 w-3 rounded-full bg-yellow-400" />
              <div className="h-3 w-3 rounded-full bg-green-400" />
            </div>
            <span className="ml-2 font-mono text-xs text-gray-400">
              PumpFundMe Terminal
            </span>
          </div>
          <div className="flex items-center gap-4">
            {/* Connection status */}
            <div className="flex items-center gap-1.5">
              <div
                className={`h-2 w-2 rounded-full ${
                  connected
                    ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]"
                    : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]"
                }`}
              />
              <span className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
                {connected ? "Connected" : "Disconnected"}
              </span>
            </div>
            {/* Event count */}
            <span className="font-mono text-[10px] text-gray-400">
              {filtered.length} events
            </span>
            {/* Filter */}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 font-mono text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
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
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto bg-white p-4 font-mono text-sm"
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-300">
              <span className="text-2xl animate-cursor-blink">▌</span>
              <p className="mt-3 text-xs tracking-wider uppercase">
                Waiting for events…
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((event, i) => (
                <div
                  key={event.id || i}
                  className="flex gap-3 rounded px-2 py-1 leading-relaxed transition-colors hover:bg-gray-50"
                >
                  <span className="shrink-0 tabular-nums text-gray-400">
                    {formatTimestamp(event.timestamp)}
                  </span>
                  <span
                    className={`w-24 shrink-0 pt-0.5 text-xs font-semibold uppercase ${getTypeColor(
                      event.type
                    )}`}
                  >
                    {event.type.replace(/_/g, " ")}
                  </span>
                  {event.campaignName && (
                    <span className="shrink-0 text-gray-400">
                      [{event.campaignName}]
                    </span>
                  )}
                  <span className="text-gray-700">{event.message}</span>
                </div>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Auto-scroll button */}
        {!autoScroll && (
          <div className="border-t border-gray-200 px-4 py-2 text-center bg-gray-50">
            <button
              onClick={() => {
                setAutoScroll(true);
                bottomRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-50 px-3 py-1 font-mono text-xs text-emerald-600 transition-colors hover:bg-emerald-100"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7" />
              </svg>
              Resume auto-scroll
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
