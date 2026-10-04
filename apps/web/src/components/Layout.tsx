import { Link, NavLink, Outlet, useNavigate } from "react-router";
import type { ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import { ThemeCycle } from "./ThemeToggle";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/challenge", label: "Practice" },
  { to: "/history", label: "History" },
  { to: "/progress", label: "Progress" },
  { to: "/profile", label: "Profile" },
];

/** Profile lives in the mobile header instead, so four labels fit a 320px bar. */
const BOTTOM_NAV = NAV.filter((item) => item.to !== "/profile");

function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("");
  return letters.toUpperCase() || "?";
}

function Wordmark({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <span className="block">
      <span
        className={`display block leading-[0.85] ${size === "lg" ? "text-[2rem]" : "text-[1.35rem]"}`}
      >
        Jessica
      </span>
      <span className="eyebrow mt-1.5 block">The Communicator</span>
    </span>
  );
}

function Initials({ name, active = false }: { name: string; active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-11 w-11 shrink-0 items-center justify-center border font-display text-sm font-extrabold tracking-[-0.02em] ${
        active ? "border-fg bg-fg text-bg" : "border-control"
      }`}
    >
      {initials(name)}
    </span>
  );
}

/**
 * `focus` is the practice room with the door pulled to: while the microphone is
 * open or the answer is being scored, the navigation shrinks to a quiet strip
 * so nothing competes with the question. Every link, the appearance switch and
 * sign out are still there and still work - only quieter.
 */
export function Layout({ children, focus = false }: { children?: ReactNode; focus?: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const name = user?.display_name ?? "";

  const content = (
    <main
      id="main"
      className="page-in mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10 lg:px-14 lg:py-14"
    >
      {children ?? <Outlet />}
    </main>
  );

  const skip = (
    <a
      href="#main"
      className="fixed left-2 top-2 z-50 -translate-y-24 bg-signal px-4 py-3 font-mono text-sm font-bold uppercase text-signal-fg focus:translate-y-0"
    >
      Skip to content
    </a>
  );

  if (focus) {
    return (
      <div className="min-h-screen">
        {skip}
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-5 py-2 sm:px-8 lg:px-14">
            <Link to="/dashboard" className="display mr-auto py-2 text-lg leading-none text-muted hover:text-fg">
              Jessica
            </Link>
            {/* Links wrap onto their own line on a phone rather than disappearing. */}
            <nav
              aria-label="Main"
              className="order-last flex w-full flex-wrap items-center gap-x-5 md:order-none md:w-auto"
            >
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `inline-flex min-h-11 items-center font-mono text-xs uppercase tracking-[0.12em] ${
                      isActive ? "text-fg" : "text-faint hover:text-fg"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="flex items-center gap-4">
              <ThemeCycle compact />
              <button
                onClick={() => void logout().then(() => navigate("/"))}
                className="min-h-11 cursor-pointer font-mono text-xs uppercase tracking-[0.12em] text-faint hover:text-fg"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>
        {content}
      </div>
    );
  }

  return (
    <>
      {skip}
      <div className="min-h-screen lg:grid lg:grid-cols-[16rem_1fr]">
        {/* ------------------------------------------------ desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen flex-col overflow-y-auto border-r border-line lg:flex">
          <Link to="/dashboard" className="block px-7 pb-8 pt-9">
            <Wordmark size="lg" />
          </Link>

          <nav aria-label="Main" className="flex-1 border-t border-line pt-3">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `group flex h-12 items-center justify-between border-l-4 pl-6 pr-7 font-mono text-[0.8125rem] font-semibold uppercase tracking-[0.12em] transition-colors ${
                    isActive
                      ? "border-signal bg-surface text-fg"
                      : "border-transparent text-muted hover:bg-surface hover:text-fg"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {item.label}
                    <span
                      aria-hidden="true"
                      className={`transition-transform ${
                        isActive ? "text-signal-text" : "-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100"
                      }`}
                    >
                      →
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-line px-7 py-6">
            {user && (
              <NavLink to="/profile" className="group flex items-center gap-3">
                {({ isActive }) => (
                  <>
                    <Initials name={name} active={isActive} />
                    <span className="min-w-0">
                      <span className="block truncate font-display text-sm font-bold group-hover:text-signal-text">
                        {name}
                      </span>
                      <span className="block truncate font-mono text-xs text-faint">{user.email}</span>
                    </span>
                  </>
                )}
              </NavLink>
            )}
            <div className="mt-5 flex items-center justify-between gap-3">
              <ThemeCycle />
              <button
                onClick={() => void logout().then(() => navigate("/"))}
                className="min-h-11 cursor-pointer font-mono text-xs uppercase tracking-[0.12em] text-muted underline decoration-1 underline-offset-[6px] hover:text-fg hover:decoration-signal"
              >
                Sign out
              </button>
            </div>
          </div>
        </aside>

        {/* -------------------------------------------------- mobile header */}
        <header className="sticky top-0 z-20 border-b border-line bg-bg lg:hidden">
          <div className="flex h-16 items-center justify-between gap-3 px-5 sm:px-8">
            <Link to="/dashboard">
              <Wordmark />
            </Link>
            <div className="flex items-center gap-2">
              <ThemeCycle compact />
              <NavLink to="/profile" aria-label="Profile">
                {({ isActive }) => <Initials name={name} active={isActive} />}
              </NavLink>
            </div>
          </div>
        </header>

        <div className="min-w-0 pb-24 lg:pb-0">{content}</div>

        {/* ---------------------------------------------- mobile bottom nav */}
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-rule bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {BOTTOM_NAV.map((item, i) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `relative flex h-16 items-center justify-center font-mono text-xs font-semibold uppercase tracking-[0.04em] ${
                  i > 0 ? "border-l border-line" : ""
                } ${isActive ? "bg-surface text-fg" : "text-muted"}`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-signal" />}
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </>
  );
}
