import { useTheme, type ThemeMode } from "../hooks/useTheme";

const MODES: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "system", label: "Auto" },
  { value: "dark", label: "Dark" },
];

const GLYPH: Record<ThemeMode, string> = { light: "○", system: "◐", dark: "●" };

/** Header control: one target that cycles, because the header has no room for three. */
export function ThemeCycle({ compact = false }: { compact?: boolean }) {
  const { mode, setMode } = useTheme();
  const index = MODES.findIndex((m) => m.value === mode);
  const next = MODES[(index + 1) % MODES.length]!;

  return (
    <button
      onClick={() => setMode(next.value)}
      // The label states what pressing it does, not what is currently set -
      // the visible text already says that.
      aria-label={`Switch appearance to ${next.label.toLowerCase()}`}
      className="inline-flex h-11 min-w-11 cursor-pointer items-center justify-center gap-2 border border-control px-3 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-fg transition-colors hover:border-fg hover:bg-fg hover:text-bg"
    >
      <span aria-hidden="true" className="text-sm">
        {GLYPH[mode]}
      </span>
      <span className={compact ? "max-sm:sr-only" : ""}>{MODES[index]?.label ?? "Auto"}</span>
    </button>
  );
}

/**
 * Settings control: all three visible, because this is where you decide.
 * Native radios underneath, so arrow keys move between them for free.
 */
export function ThemeSegmented() {
  const { mode, setMode, resolved } = useTheme();

  return (
    <fieldset>
      <legend className="sr-only">Appearance</legend>
      <div className="flex border border-control">
        {MODES.map((m, i) => {
          const active = mode === m.value;
          return (
            <label
              key={m.value}
              className={`relative flex h-14 flex-1 cursor-pointer items-center justify-center gap-2 font-mono text-sm font-semibold uppercase tracking-[0.12em] transition-colors has-[:focus-visible]:[outline:3px_solid_var(--signal)] has-[:focus-visible]:[outline-offset:3px] has-[:focus-visible]:z-10 ${
                i > 0 ? "border-l border-control" : ""
              } ${active ? "bg-signal text-signal-fg" : "text-muted hover:bg-raised hover:text-fg"}`}
            >
              <input
                type="radio"
                name="appearance"
                value={m.value}
                checked={active}
                onChange={() => setMode(m.value)}
                className="sr-only"
              />
              <span aria-hidden="true">{GLYPH[m.value]}</span>
              {m.label}
            </label>
          );
        })}
      </div>
      <p className="mt-3 font-mono text-xs text-muted">
        {mode === "system"
          ? `Following your device, which is currently ${resolved}.`
          : `Always ${mode}, on this browser.`}
      </p>
    </fieldset>
  );
}
