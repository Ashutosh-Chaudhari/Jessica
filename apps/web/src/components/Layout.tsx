import { Link, NavLink, Outlet, useNavigate } from "react-router";
import type { ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import { ThemeCycle } from "./ThemeToggle";

const NAV = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/history", label: "History" },
  { to: "/profile", label: "Profile" },
];

export function Layout({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b-2 rule bg-bg">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <Link to="/dashboard" className="group shrink-0">
            <span className="display block text-xl leading-none">Jessica</span>
            <span className="eyebrow block">The Communicator</span>
          </Link>

          <nav className="flex items-center gap-1 max-sm:order-3 max-sm:w-full">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `border-2 px-3 py-1.5 font-mono text-sm font-bold uppercase tracking-[0.1em] transition-colors ${
                    isActive
                      ? "rule bg-fg text-bg"
                      : "border-transparent text-muted hover:border-current hover:text-fg"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeCycle />
            <button
              onClick={() => void logout().then(() => navigate("/"))}
              className="cursor-pointer font-mono text-sm uppercase tracking-[0.1em] text-muted underline decoration-2 underline-offset-4 hover:text-fg"
            >
              Sign out
            </button>
          </div>
        </div>

        {user && (
          <div className="border-t-2 rule bg-surface">
            <div className="mx-auto max-w-5xl px-4 py-1.5">
              <span className="font-mono text-sm uppercase tracking-[0.1em] text-muted">
                Signed in as {user.display_name}
              </span>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">{children ?? <Outlet />}</main>
    </div>
  );
}
