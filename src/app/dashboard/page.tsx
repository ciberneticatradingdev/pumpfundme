import { Suspense } from "react";
import { CampaignList } from "./campaign-list";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Manage campaigns and track donations in real time.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            Loading campaigns…
          </div>
        }
      >
        <CampaignList />
      </Suspense>
    </div>
  );
}
