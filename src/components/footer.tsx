import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-white/5 bg-black">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col items-center gap-6 md:flex-row md:justify-between">
          {/* Branding */}
          <div className="text-center md:text-left">
            <p className="text-lg font-bold tracking-tight">
              Pump<span className="text-emerald-400">Fund</span>Me
            </p>
            <p className="mt-1 text-sm text-white/40">
              100% to the cause. 0% commission.
            </p>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-sm text-white/40 transition-colors hover:text-emerald-400"
            >
              Dashboard
            </Link>
            <Link
              href="/terminal"
              className="text-sm text-white/40 transition-colors hover:text-emerald-400"
            >
              Terminal
            </Link>
            <a
              href="https://github.com/ciberneticatradingdev/pumpfundme"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-white/40 transition-colors hover:text-emerald-400"
            >
              GitHub
            </a>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-8 border-t border-white/5 pt-6 text-center">
          <p className="text-xs text-white/25">
            &copy; {new Date().getFullYear()} PumpFundMe. Memecoins for good.
          </p>
        </div>
      </div>
    </footer>
  );
}
