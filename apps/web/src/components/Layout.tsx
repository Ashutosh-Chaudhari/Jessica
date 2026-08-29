import { Link, NavLink, Outlet, useNavigate } from "react-router";
import type { ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import { Button } from "./Button";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/history", label: "History" },
];

export function Layout({ children }: { children?: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link to="/dashboard" className="font-mono text-sm font-bold tracking-widest text-emerald-300">
            JESSICA
          </Link>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm transition-colors ${
                    isActive ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <span className="mx-2 hidden text-xs text-zinc-600 sm:inline">
              {user?.display_name}
            </span>
            <Button
              variant="ghost"
              className="px-3 py-1.5"
              onClick={() => {
                void logout().then(() => navigate("/"));
              }}
            >
              Sign out
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children ?? <Outlet />}</main>
    </div>
  );
}
