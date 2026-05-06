"use client";

import { useState } from "react";
import { PUMPFUNDME_FEE_WALLET } from "@/lib/config";

export function CopyWallet() {
  const [copied, setCopied] = useState(false);
  const wallet = PUMPFUNDME_FEE_WALLET;
  const short = `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(wallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const el = document.createElement("textarea");
      el.value = wallet;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="mt-2 max-w-xs text-sm text-gray-500">
      <p>
        Deploy your token on pump.fun and set{" "}
        <span className="font-semibold text-emerald-600">pumpfundme.sol</span>{" "}
        as 100% fee receiver.
      </p>
      <button
        onClick={handleCopy}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 font-mono text-xs text-gray-600 transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 active:scale-95"
        title={wallet}
      >
        <span>{short}</span>
        {copied ? (
          <svg className="h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
          </svg>
        )}
      </button>
    </div>
  );
}
