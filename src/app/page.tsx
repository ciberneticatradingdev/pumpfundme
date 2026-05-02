import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const steps = [
  {
    num: "01",
    title: "Create a Campaign",
    desc: "Link your GoFundMe page and set up your campaign in seconds.",
    icon: "📋",
  },
  {
    num: "02",
    title: "Launch a Token",
    desc: "Deploy a memecoin on pump.fun with fees directed to PumpFundMe.",
    icon: "🚀",
  },
  {
    num: "03",
    title: "Auto-Donate",
    desc: "Fees automatically convert to donations — 0% commission, ever.",
    icon: "💚",
  },
];

const stats = [
  { label: "Total Raised", value: "$0.00" },
  { label: "Active Campaigns", value: "0" },
  { label: "Donations Made", value: "0" },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center px-4 pb-20 pt-24 text-center">
        {/* Glow effect */}
        <div className="pointer-events-none absolute top-0 h-[500px] w-full bg-gradient-to-b from-emerald-500/10 via-emerald-500/5 to-transparent" />

        <div className="relative">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-500/20 text-4xl ring-1 ring-emerald-500/30">
            💚
          </div>
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl">
            Pump<span className="text-emerald-400">Fund</span>Me
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-lg text-muted-foreground">
            Memecoins for good. 100% to the cause.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground/70">
            Launch a token on pump.fun, link it to a campaign, and every fee
            goes straight to charity. No middlemen. No commission.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-emerald-500 text-black hover:bg-emerald-400 font-semibold"
              )}
            >
              Launch a Campaign
            </Link>
            <Link
              href="/terminal"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              Live Terminal
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-border/50 bg-card/50">
        <div className="mx-auto flex max-w-4xl items-center justify-around py-6 px-4">
          {stats.map((stat, i) => (
            <div key={stat.label} className="flex items-center gap-4">
              {i > 0 && (
                <Separator orientation="vertical" className="mr-4 h-10" />
              )}
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-400">
                  {stat.value}
                </p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-4 py-20">
        <h2 className="mb-2 text-center text-sm font-medium uppercase tracking-widest text-emerald-400">
          How it works
        </h2>
        <p className="mb-12 text-center text-3xl font-bold tracking-tight">
          Three steps. Full transparency.
        </p>
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((step) => (
            <Card
              key={step.num}
              className="group relative overflow-hidden border-border/50 bg-card/50 transition-all hover:border-emerald-500/30 hover:bg-card"
            >
              <CardContent className="p-6">
                <div className="mb-4 text-3xl">{step.icon}</div>
                <div className="mb-1 text-xs font-mono text-emerald-500/60">
                  STEP {step.num}
                </div>
                <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-border/50 bg-emerald-950/30 px-4 py-16 text-center">
        <h2 className="text-2xl font-bold">Ready to make a difference?</h2>
        <p className="mt-2 text-muted-foreground">
          Every memecoin can be a force for good.
        </p>
        <Link
          href="/dashboard"
          className={cn(
            buttonVariants({ size: "lg" }),
            "mt-6 bg-emerald-500 text-black hover:bg-emerald-400 font-semibold"
          )}
        >
          Get Started
        </Link>
      </section>
    </div>
  );
}
