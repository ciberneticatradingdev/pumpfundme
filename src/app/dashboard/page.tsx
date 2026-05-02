import { Suspense } from "react";
import { CampaignList } from "./campaign-list";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
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
      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-500" />
            <p className="mt-4 text-sm text-gray-400">Loading campaigns…</p>
          </div>
        }
      >
        <CampaignList />
      </Suspense>
    </div>
  );
}
