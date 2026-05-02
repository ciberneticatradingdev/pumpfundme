import Link from "next/link";

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500 text-sm font-bold text-black">
            P
          </div>
          <span className="text-lg font-bold tracking-tight">
            Pump<span className="text-emerald-400">Fund</span>Me
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Dashboard
          </Link>
          <Link
            href="/terminal"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Terminal
          </Link>
        </div>
      </div>
    </nav>
  );
}
