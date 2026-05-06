"use client";

import { useEffect, useState } from "react";

const cache = new Map<string, string | null>();

interface TokenImageProps {
  mintAddress: string;
  size?: number;
  className?: string;
}

export function TokenImage({ mintAddress, size = 40, className = "" }: TokenImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(cache.get(mintAddress) ?? null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (cache.has(mintAddress)) {
      setImageUrl(cache.get(mintAddress) ?? null);
      return;
    }

    let cancelled = false;

    fetch(`https://frontend-api-v3.pump.fun/coins/${mintAddress}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const url = data?.image_uri ?? null;
        cache.set(mintAddress, url);
        setImageUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          cache.set(mintAddress, null);
          setError(true);
        }
      });

    return () => { cancelled = true; };
  }, [mintAddress]);

  if (error || !imageUrl) {
    return (
      <div
        className={`flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-cyan-100 text-emerald-500 font-bold text-xs ${className}`}
        style={{ width: size, height: size }}
      >
        🪙
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt="Token"
      width={size}
      height={size}
      className={`rounded-full object-cover ${className}`}
      style={{ width: size, height: size }}
      onError={() => setError(true)}
    />
  );
}
