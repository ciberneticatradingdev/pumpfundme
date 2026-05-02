"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useCallback, useState, useRef, useEffect } from "react";

export function WalletButton() {
  const { publicKey, wallet, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const address = publicKey?.toBase58();
  const truncated = address
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : null;

  const handleClick = useCallback(() => {
    if (publicKey) {
      setShowMenu((prev) => !prev);
    } else {
      setVisible(true);
    }
  }, [publicKey, setVisible]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) {
      document.addEventListener("mousedown", handleOutside);
      return () => document.removeEventListener("mousedown", handleOutside);
    }
  }, [showMenu]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={handleClick}
        disabled={connecting}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-semibold text-white transition-all hover:bg-emerald-400 active:scale-95 disabled:opacity-50"
      >
        {connecting ? (
          <>
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Connecting…
          </>
        ) : publicKey ? (
          <>
            {wallet?.adapter.icon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={wallet.adapter.icon}
                alt=""
                className="h-4 w-4 rounded-sm"
              />
            )}
            {truncated}
          </>
        ) : (
          "Connect Wallet"
        )}
      </button>

      {showMenu && publicKey && (
        <div className="absolute right-0 top-full z-50 mt-2 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          <button
            onClick={() => {
              navigator.clipboard.writeText(address!);
              setShowMenu(false);
            }}
            className="flex w-full items-center rounded-md px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            Copy Address
          </button>
          <button
            onClick={() => {
              disconnect();
              setShowMenu(false);
            }}
            className="flex w-full items-center rounded-md px-3 py-2 text-sm text-red-500 transition-colors hover:bg-red-50"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
