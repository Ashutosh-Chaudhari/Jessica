import { useTheme, type ThemeMode } from "../hooks/useTheme";

const MODES: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "system", label: "Auto" },
  { value: "dark", label: "Dark" },
];

/** Header control: one target that cycles, because the header has no room for three. */
export function ThemeCycle() {
  const { mode, setMode } = useTheme();
  const index = MODES.findIndex((m) => m.value === mode);
  const next = MODES[(index + 1) % MODES.length]!;

  return (
    <button
      onClick={() => setMode(next.value)}
      // The label states what pressing it does, not what is currently set -
      // the visible text already says that.
      aria-label={`Switch appearance to ${next.label.toLowerCase()}`}
      className="inline-flex cursor-pointer items-center gap-2 border-2 rule bg-surface px-3 py-1.5 font-mono text-sm font-bold uppercase tracking-[0.1em] transition-transform hover:-translate-y-[2px]"
    >
      <span aria-hidden="true">{mode === "light" ? "○" : mode === "dark" ? "●" : "◐"}</span>
      {MODES[index]?.label ?? "Auto"}
    </button>
  );
}

/** Settings control: all three visible, because this is where you decide. */
export function ThemeSegmented() {
  const { mode, setMode, resolved } = useTheme();

  return (
    <div>
      <div role="radiogroup" aria-label="Appearance" className="flex border-2 rule">
        {MODES.map((m, i) => {
          const active = mode === m.value;
          return (
            <button
              key={m.value}
              role="radio"
              aria-checked={active}
              onClick={() => setMode(m.value)}
              className={`flex-1 cursor-pointer px-4 py-3 font-mono text-sm font-bold uppercase tracking-[0.1em] ${
                i > 0 ? "border-l-2 rule" : ""
              } ${active ? "bg-signal text-signal-fg" : "bg-surface text-muted hover:text-fg"}`}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 font-mono text-xs text-muted">
        {mode === "system"
          ? `Following your device, which is currently ${resolved}.`
          : `Always ${mode}, on this browser.`}
      </p>
    </div>
  );
}
