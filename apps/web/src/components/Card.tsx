import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/60 ${className}`}>
      {children}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="font-mono text-2xl font-semibold text-emerald-300">{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wider text-zinc-500">{label}</p>
    </Card>
  );
}

export function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm text-zinc-400">{label}</span>
        <span className="font-mono text-sm text-zinc-200">{score}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300"
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
    </div>
  );
}
