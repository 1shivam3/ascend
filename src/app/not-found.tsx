import Link from 'next/link';
import { Dumbbell, ArrowLeft, Home, Trophy, UtensilsCrossed } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden selection:bg-accent/30">
      {/* Background Decorative Rings */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] rounded-full border border-border/20 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full border border-border/10 pointer-events-none" />

      <div className="w-full max-w-sm text-center relative z-10 space-y-6">
        {/* Clickable ASCEND Logo */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 group transition-transform active:scale-95"
          title="Return to ASCEND Dashboard"
        >
          <div className="w-10 h-10 rounded-xl bg-bg-secondary border border-border flex items-center justify-center text-accent group-hover:border-accent/60 transition-colors shadow-sm">
            <Dumbbell className="w-5 h-5 group-hover:rotate-12 transition-transform duration-300" />
          </div>
          <span className="text-xl font-black tracking-tight text-text-primary group-hover:text-accent transition-colors font-mono">
            ASCEND
          </span>
        </Link>

        {/* 404 Headline */}
        <div className="space-y-2">
          <div className="text-7xl sm:text-8xl font-black font-mono tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-accent to-accent/30 drop-shadow-sm">
            404
          </div>
          <h1 className="text-base sm:text-lg font-bold font-mono uppercase tracking-wider text-text-primary">
            REP FAILED • PAGE NOT FOUND
          </h1>
          <p className="text-xs text-text-secondary leading-relaxed font-mono px-4">
            Even world-class lifters miss a rep. The page you are looking for has been moved or does not exist in the iron vault.
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-3 pt-2">
          <Link
            href="/"
            className="btn-primary w-full py-3 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-md hover:brightness-110 active:scale-98 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Dashboard</span>
          </Link>

          <div className="grid grid-cols-3 gap-2 pt-2">
            <Link
              href="/"
              className="p-2.5 rounded-lg bg-bg-secondary border border-border/70 hover:border-accent/40 flex flex-col items-center justify-center gap-1 text-2xs font-mono text-text-muted hover:text-text-primary transition-colors"
            >
              <Home className="w-3.5 h-3.5 text-accent" />
              <span>Home</span>
            </Link>
            <Link
              href="/"
              className="p-2.5 rounded-lg bg-bg-secondary border border-border/70 hover:border-accent/40 flex flex-col items-center justify-center gap-1 text-2xs font-mono text-text-muted hover:text-text-primary transition-colors"
            >
              <Trophy className="w-3.5 h-3.5 text-accent" />
              <span>PRs</span>
            </Link>
            <Link
              href="/"
              className="p-2.5 rounded-lg bg-bg-secondary border border-border/70 hover:border-accent/40 flex flex-col items-center justify-center gap-1 text-2xs font-mono text-text-muted hover:text-text-primary transition-colors"
            >
              <UtensilsCrossed className="w-3.5 h-3.5 text-accent" />
              <span>Nutrition</span>
            </Link>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-[11px] font-mono text-text-muted pt-4 border-t border-border/40">
          ASCEND v2.0 • Offline Powerlifting Sanctuary
        </p>
      </div>
    </div>
  );
}
