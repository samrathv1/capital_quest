
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="max-w-4xl w-full text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-xs font-mono tracking-wider uppercase">
          Phase 0 Foundation Complete • Ready for Phase 1
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white">
          CAPITAL <span className="text-emerald-400">QUEST</span>
        </h1>

        <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto">
          Centralized, round-based collegiate entrepreneurship simulation platform. Built for high-integrity tournament operations.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 text-left">
          <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur shadow-sm">
            <div className="text-emerald-400 font-mono text-sm font-semibold">Starting Capital</div>
            <div className="text-2xl font-bold mt-1 text-white">$1,000,000</div>
            <div className="text-xs text-slate-400 mt-2">Restricted Incubation Operating Treasury per venture.</div>
          </div>

          <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur shadow-sm">
            <div className="text-indigo-400 font-mono text-sm font-semibold">Initial Valuation</div>
            <div className="text-2xl font-bold mt-1 text-white">$200,000</div>
            <div className="text-xs text-slate-400 mt-2">Benchmark Pre-Revenue Enterprise Value (Round 0).</div>
          </div>

          <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur shadow-sm">
            <div className="text-amber-400 font-mono text-sm font-semibold">Simulation Scale</div>
            <div className="text-2xl font-bold mt-1 text-white">40 Teams • 4 Domains</div>
            <div className="text-xs text-slate-400 mt-2">5 Operating Rounds with 2 Strategic VC windows.</div>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-800/80 flex flex-wrap items-center justify-center gap-4 text-xs font-mono text-slate-500">
          <span>Engine: Next.js 15 App Router</span>
          <span>•</span>
          <span>Database: Supabase PostgreSQL</span>
          <span>•</span>
          <span>Math: Decimal.js (28-Precision)</span>
          <span>•</span>
          <span>Testing: Vitest</span>
        </div>
      </div>
    </main>
  );
}
