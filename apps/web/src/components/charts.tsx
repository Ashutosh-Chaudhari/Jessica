import { useState } from "react";
import { formatDay } from "../hooks/format";

/**
 * Charts are drawn with plain elements: every series here is one measure in
 * one colour, so there is nothing a chart library would add but weight.
 * Each chart has a table twin behind "View as table", so no value is only
 * reachable by hovering.
 */

function TableView({ head, rows }: { head: [string, string]; rows: [string, string][] }) {
  return (
    <details className="group mt-4">
      <summary className="eyebrow inline-flex min-h-11 cursor-pointer list-none items-center gap-2 hover:text-fg [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block w-3 text-center group-open:hidden">
          +
        </span>
        <span aria-hidden="true" className="hidden w-3 text-center group-open:inline-block">
          −
        </span>
        View as table
      </summary>
      <table className="reveal mt-2 w-full max-w-md font-mono text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-muted">
            <th className="py-2 font-normal">{head[0]}</th>
            <th className="py-2 text-right font-normal">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b], i) => (
            <tr key={i} className="border-b border-line">
              <td className="py-2">{a}</td>
              <td className="tabular py-2 text-right">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/* ------------------------------------------------------------------ line */

export interface Point {
  label: string;
  value: number | null;
  /** The full reading for this point, shown when it is pointed at. */
  detail: string;
}

/** Consecutive runs of real values - a missing week breaks the line, never bridges it. */
function runs(points: Point[]): { x: number; v: number }[][] {
  const out: { x: number; v: number }[][] = [];
  let current: { x: number; v: number }[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (current.length) out.push(current);
      current = [];
    } else current.push({ x: i, v: p.value });
  });
  if (current.length) out.push(current);
  return out;
}

/**
 * One measure over time, as a thin line on a quiet grid. The readout above
 * the plot follows the pointer and keyboard focus and rests on the latest
 * point - that is the single direct label, rather than a number on every dot.
 */
export function LineChart({
  title,
  points,
  max,
  labelHead = "Week of",
  valueHead,
}: {
  title: string;
  points: Point[];
  /** Fixed ceiling - scores use 100 so a small move cannot look like a big one. */
  max?: number;
  labelHead?: string;
  valueHead: string;
}) {
  let latest = points.length - 1;
  while (latest > 0 && points[latest]!.value === null) latest -= 1;
  const [active, setActive] = useState<number | null>(null);
  const shown = active ?? latest;
  const ceiling = max ?? Math.max(1, ...points.map((p) => p.value ?? 0));
  const span = Math.max(1, points.length - 1);
  const xOf = (i: number) => (points.length === 1 ? 50 : (i / span) * 100);
  const yOf = (v: number) => 100 - (Math.min(v, ceiling) / ceiling) * 100;

  return (
    <figure>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="eyebrow">{title}</span>
        <span className="font-mono text-sm" aria-live="polite">
          <span className="text-muted">{points[shown]?.label} · </span>
          {points[shown]?.detail}
        </span>
      </figcaption>

      <div className="relative mt-5 h-40 border-b border-rule">
        <span aria-hidden="true" className="absolute inset-x-0 top-0 border-t border-line" />
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-line" />
        <span aria-hidden="true" className="absolute -top-2.5 left-0 bg-bg pr-1.5 font-mono text-xs text-faint">
          {ceiling}
        </span>

        <div className="absolute inset-y-0 left-9 right-2">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            {runs(points).map((run, r) => (
              <polyline
                key={r}
                points={run.map((p) => `${xOf(p.x)},${yOf(p.v)}`).join(" ")}
                fill="none"
                className="stroke-signal"
                strokeWidth="2"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {/* Markers sit on their own layer, centred on the data. */}
          <span
            aria-hidden="true"
            className="absolute inset-y-0 border-l border-line-strong"
            style={{ left: `${xOf(shown)}%` }}
          />
          {points.map((p, i) =>
            p.value === null ? (
              <span
                key={i}
                aria-hidden="true"
                className="absolute bottom-1 h-0.5 w-3 -translate-x-1/2 bg-faint"
                style={{ left: `${xOf(i)}%` }}
              />
            ) : (
              <span
                key={i}
                aria-hidden="true"
                className={`absolute -translate-x-1/2 -translate-y-1/2 border-2 border-signal ${
                  i === shown ? "h-3.5 w-3.5 bg-signal" : "h-2.5 w-2.5 bg-bg"
                }`}
                style={{ left: `${xOf(i)}%`, top: `${yOf(p.value)}%` }}
              />
            ),
          )}

          {/* Hit zones: one per point, meeting halfway between neighbours and
              clamped to the plot, so the chart never pushes the page wider.
              One tab stop per chart; arrow keys walk the points. */}
          <ol
            aria-label={`${title}. Use the left and right arrow keys to move between points.`}
            className="absolute inset-0"
            onMouseLeave={() => setActive(null)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              e.preventDefault();
              const next = Math.min(points.length - 1, Math.max(0, shown + (e.key === "ArrowRight" ? 1 : -1)));
              setActive(next);
              (e.currentTarget.children[next] as HTMLElement | undefined)?.focus();
            }}
          >
            {points.map((p, i) => {
              const from = Math.max(0, xOf(i) - 50 / span);
              const to = Math.min(100, xOf(i) + 50 / span);
              return (
                <li
                  key={i}
                  tabIndex={i === shown ? 0 : -1}
                  aria-label={`${p.label}: ${p.detail}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="absolute inset-y-0 cursor-default outline-offset-0"
                  style={{ left: `${from}%`, width: `${to - from}%` }}
                />
              );
            })}
          </ol>
        </div>
      </div>
      {/* Ends only: every other date is one point or arrow key away, and a full
          row of nowrap labels would set the chart's minimum width. */}
      <div aria-hidden="true" className="mt-2 flex justify-between gap-4 pl-9 font-mono text-xs text-faint">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>

      <TableView head={[labelHead, valueHead]} rows={points.map((p) => [p.label, p.detail])} />
    </figure>
  );
}

/* ------------------------------------------------------------- sparkline */

/**
 * One dimension's recent scores, on the full 0-100 scale. Zooming the axis to
 * the data would turn a three-point wobble into a cliff.
 */
export function Sparkline({ label, values }: { label: string; values: number[] }) {
  if (values.length < 2) {
    return <span className="font-mono text-xs text-faint">Needs 2+ scored sessions</span>;
  }
  const step = 100 / (values.length - 1);
  const points = values.map((v, i) => `${i * step},${100 - v}`).join(" ");
  const last = values[values.length - 1]!;

  return (
    <span className="relative block h-9 w-full">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}: last ${values.length} scores, from ${values[0]} to ${last}`}
        className="absolute inset-0 h-full w-full overflow-visible"
      >
        <line x1="0" y1="50" x2="100" y2="50" className="stroke-line" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline
          points={points}
          fill="none"
          className="stroke-signal"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        aria-hidden="true"
        className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 bg-signal"
        style={{ left: "100%", top: `${100 - last}%` }}
      />
    </span>
  );
}

/* -------------------------------------------------------------- calendar */

const LEVELS = [
  "border-line-strong bg-transparent",
  "border-transparent bg-signal/35",
  "border-transparent bg-signal/70",
  "border-transparent bg-signal",
];
const level = (count: number) => Math.min(count, 3);

/**
 * Days down, weeks across, Monday first. Shade steps at 1, 2 and 3+ sessions,
 * with the counts spelled out in the legend so the scale is never guesswork.
 */
export function PracticeCalendar({ days }: { days: { day: string; count: number }[] }) {
  const practised = days.filter((d) => d.count > 0);

  return (
    <figure>
      <div
        role="img"
        aria-label={`Practised on ${practised.length} of the last ${days.length} days`}
        className="grid w-fit grid-flow-col grid-rows-7 gap-1"
      >
        {days.map((d) => (
          <span
            key={d.day}
            title={`${formatDay(d.day)}: ${d.count} session${d.count === 1 ? "" : "s"}`}
            className={`h-4 w-4 border sm:h-5 sm:w-5 ${LEVELS[level(d.count)]}`}
          />
        ))}
      </div>
      <figcaption className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs text-muted">
        {["0", "1", "2", "3+"].map((label, i) => (
          <span key={label} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-3 w-3 border ${LEVELS[i]}`} />
            {label}
          </span>
        ))}
        <span>sessions a day</span>
      </figcaption>
      <TableView
        head={["Day", "Sessions"]}
        rows={practised.length ? practised.map((d) => [formatDay(d.day), String(d.count)]) : [["No sessions", "0"]]}
      />
    </figure>
  );
}
