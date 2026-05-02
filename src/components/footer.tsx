import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col items-center gap-6 md:flex-row md:justify-between">
          {/* Branding */}
          <div className="text-center md:text-left">
            <p className="text-lg font-bold tracking-tight text-gray-900">
              Pump<span className="text-emerald-500">Fund</span>Me
            </p>
            <p className="mt-1 text-sm text-gray-500">
              100% to the cause. 0% commission.
            </p>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-sm text-gray-500 transition-colors hover:text-emerald-600"
            >
              Dashboard
            </Link>
            <Link
              href="/terminal"
              className="text-sm text-gray-500 transition-colors hover:text-emerald-600"
            >
              Terminal
            </Link>
            <a
              href="https://github.com/ciberneticatradingdev/pumpfundme"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 transition-colors hover:text-emerald-600"
            >
              GitHub
            </a>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-8 border-t border-gray-200 pt-6 text-center">
          <p className="text-xs text-gray-400">
            &copy; {new Date().getFullYear()} PumpFundMe. Memecoins for good.
          </p>
        </div>
      </div>
    </footer>
  );
}
