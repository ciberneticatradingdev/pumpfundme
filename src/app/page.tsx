import Link from "next/link";
import Image from "next/image";

const stats = [
  { label: "Total Raised", value: "$0.00" },
  { label: "Active Campaigns", value: "0" },
  { label: "Donations Made", value: "0" },
];

const steps = [
  {
    num: "01",
    title: "Create Campaign",
    desc: "Link your GoFundMe page and set up your campaign in seconds.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
  },
  {
    num: "02",
    title: "Launch Token",
    desc: "Deploy a memecoin on pump.fun with fees directed to PumpFundMe.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
      </svg>
    ),
  },
  {
    num: "03",
    title: "Auto-Donate",
    desc: "Fees automatically convert to donations — 0% commission, ever.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
      </svg>
    ),
  },
];

const trustCards = [
  {
    title: "100% Transparent",
    desc: "Real-time terminal shows every transaction. Nothing hidden, everything verifiable on-chain.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
  },
  {
    title: "Zero Commission",
    desc: "Every SOL goes to the cause. We take nothing. Not now, not ever.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
  },
  {
    title: "Fully Automated",
    desc: "From blockchain to donation, no middleman. Smart contracts handle everything.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
  },
];

const faqs = [
  {
    q: "How does PumpFundMe work?",
    a: "You create a campaign linked to a GoFundMe page, then deploy a memecoin on pump.fun. Trading fees from your token are automatically collected and converted into donations for your cause.",
  },
  {
    q: "Do you charge any fees?",
    a: "No. PumpFundMe takes zero commission. 100% of collected fees go directly to the linked GoFundMe campaign. The platform is free to use.",
  },
  {
    q: "How are donations made to GoFundMe?",
    a: "Collected SOL is converted to USD and donated directly to the GoFundMe campaign via their platform. Every transaction is logged and visible in our real-time terminal.",
  },
  {
    q: "Can anyone create a campaign?",
    a: "Yes! Anyone can create a campaign and link it to a valid GoFundMe page. You just need the GoFundMe URL to get started.",
  },
  {
    q: "How can I verify donations?",
    a: "Every transaction is visible in our live terminal with on-chain verification. You can track SOL received, conversions, and donation confirmations in real-time.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      {/* ── Hero ── */}
      <section className="relative flex min-h-[100vh] flex-col items-center justify-center overflow-hidden px-4 text-center">
        {/* Background: grid + radial glow */}
        <div className="bg-grid pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-emerald-200/30 blur-[120px]" />
        <div className="pointer-events-none absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />

        <div className="relative z-10 animate-fade-in-up">
          {/* Title with logo inline */}
          <h1 className="flex items-center justify-center gap-4 text-6xl font-extrabold tracking-tight sm:text-7xl sm:gap-5 lg:text-8xl lg:gap-6">
            <Image
              src="/logo.svg"
              alt="PumpFundMe Logo"
              width={80}
              height={80}
              priority
              className="h-16 w-16 sm:h-20 sm:w-20 lg:h-24 lg:w-24"
            />
            <span className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-green-500 bg-clip-text text-transparent animate-gradient">
              PumpFundMe
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mt-6 max-w-xl text-xl text-gray-500 sm:text-2xl animate-fade-in-up-delay-1">
            Memecoins for good. 100% to the cause.
          </p>
          <p className="mx-auto mt-3 max-w-lg text-sm text-gray-400 animate-fade-in-up-delay-2">
            Launch a token on pump.fun, link it to a campaign, and every fee
            goes straight to charity. No middlemen. No commission.
          </p>

          {/* CTAs */}
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center animate-fade-in-up-delay-3">
            <Link
              href="/dashboard"
              className="inline-flex h-12 items-center rounded-xl bg-emerald-500 px-8 text-sm font-semibold text-white transition-all hover:bg-emerald-400 hover:scale-105 active:scale-95"
            >
              Launch Campaign
            </Link>
            <Link
              href="/terminal"
              className="inline-flex h-12 items-center rounded-xl border border-gray-200 bg-gray-50 px-8 text-sm font-medium text-gray-700 backdrop-blur transition-all hover:bg-gray-100 hover:border-gray-300 hover:scale-105 active:scale-95"
            >
              View Terminal
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-fade-in-up-delay-4">
          <div className="flex flex-col items-center gap-2 text-gray-300">
            <span className="text-xs tracking-widest uppercase">Scroll</span>
            <svg className="h-4 w-4 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7" />
            </svg>
          </div>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <section className="relative border-y border-gray-200">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-around gap-6 px-4 py-8 sm:flex-row sm:gap-0">
          {stats.map((stat, i) => (
            <div key={stat.label} className="flex items-center gap-6">
              {i > 0 && (
                <div className="hidden h-12 w-px bg-gray-200 sm:block" />
              )}
              <div className="glass rounded-xl px-8 py-4 text-center">
                <p className="text-3xl font-bold tabular-nums text-emerald-600">
                  {stat.value}
                </p>
                <p className="mt-1 text-xs uppercase tracking-wider text-gray-400">
                  {stat.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="mx-auto max-w-5xl px-4 py-24">
        <div className="text-center animate-fade-in-up">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-600">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Three steps. Full transparency.
          </h2>
        </div>

        <div className="relative mt-16 grid gap-8 md:grid-cols-3">
          {/* Dashed connecting line (desktop) */}
          <div className="pointer-events-none absolute top-12 left-[16.67%] right-[16.67%] hidden h-px border-t border-dashed border-emerald-300 md:block" />

          {steps.map((step, i) => (
            <div
              key={step.num}
              className={`animate-fade-in-up-delay-${i + 1} relative flex flex-col items-center text-center`}
            >
              {/* Step circle */}
              <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
                {step.icon}
              </div>
              <span className="mt-4 font-mono text-xs text-emerald-400">
                STEP {step.num}
              </span>
              <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 max-w-xs text-sm text-gray-500">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Trust Section ── */}
      <section className="border-y border-gray-200 bg-gray-50 px-4 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Why PumpFundMe?
            </h2>
            <p className="mt-3 text-gray-500">
              Built for trust. Designed for impact.
            </p>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {trustCards.map((card) => (
              <div
                key={card.title}
                className="glass glass-hover group rounded-2xl p-8 transition-all duration-300"
              >
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition-colors group-hover:bg-emerald-100">
                  {card.icon}
                </div>
                <h3 className="text-lg font-semibold">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-500">
                  {card.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="mx-auto max-w-3xl px-4 py-24">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Frequently Asked Questions
          </h2>
          <p className="mt-3 text-gray-500">
            Everything you need to know about PumpFundMe.
          </p>
        </div>

        <div className="mt-12 space-y-3">
          {faqs.map((faq) => (
            <details
              key={faq.q}
              className="group glass rounded-xl transition-all duration-200 hover:border-emerald-300"
            >
              <summary className="flex cursor-pointer items-center justify-between p-5">
                <span className="text-sm font-medium pr-4">{faq.q}</span>
                <svg
                  className="faq-chevron h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-5 pb-5 text-sm leading-relaxed text-gray-500">
                {faq.a}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative overflow-hidden border-t border-gray-200 px-4 py-24 text-center">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-emerald-50 to-transparent" />
        <div className="relative z-10">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to make a difference?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-gray-500">
            Every memecoin can be a force for good. Start your campaign today
            and turn trades into donations.
          </p>
          <Link
            href="/dashboard"
            className="mt-8 inline-flex h-12 items-center rounded-xl bg-emerald-500 px-8 text-sm font-semibold text-white transition-all hover:bg-emerald-400 hover:scale-105 active:scale-95"
          >
            Get Started
          </Link>
        </div>
      </section>
    </div>
  );
}
