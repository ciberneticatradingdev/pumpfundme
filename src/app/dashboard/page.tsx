"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { CampaignList } from "./campaign-list";

export default function DashboardPage() {
  const { publicKey, connecting } = useWallet();
  const { setVisible } = useWalletModal();

  if (!publicKey) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center justify-center px-4 py-32 text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50">
          <svg
            className="h-8 w-8 text-emerald-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900">
          Connect your wallet
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          Connect your Solana wallet to access the dashboard and manage
          campaigns.
        </p>
        <button
          onClick={() => setVisible(true)}
          disabled={connecting}
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-emerald-500 px-6 text-sm font-semibold text-white transition-all hover:bg-emerald-400 active:scale-95 disabled:opacity-50"
        >
          {connecting ? "Connecting…" : "Connect Wallet"}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 animate-fade-in-up">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Dashboard
        </h1>
        <p className="mt-2 text-gray-500">
          Manage campaigns and track donations in real time.
        </p>
      </div>
      <CampaignList walletAddress={publicKey.toBase58()} />
    </div>
  );
}
