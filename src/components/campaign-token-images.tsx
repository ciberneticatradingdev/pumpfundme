"use client";

import { TokenImage } from "./token-image";

interface Props {
  mints: string[];
  size?: number;
}

/**
 * Shows overlapping token images for a campaign card.
 * First 3 tokens shown, rest indicated with a count badge.
 */
export function CampaignTokenImages({ mints, size = 36 }: Props) {
  const show = mints.slice(0, 3);
  const extra = mints.length - show.length;

  return (
    <div className="flex -space-x-2 shrink-0">
      {show.map((mint) => (
        <div key={mint} className="ring-2 ring-white rounded-full">
          <TokenImage mintAddress={mint} size={size} />
        </div>
      ))}
      {extra > 0 && (
        <div
          className="flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-xs font-medium ring-2 ring-white"
          style={{ width: size, height: size }}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}
