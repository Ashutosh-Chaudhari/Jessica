import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // A production build with the real backend selected but not configured would
  // silently ship the localStorage mock app - it renders fine, accepts signups,
  // and stores everything in the visitor's browser. Refuse to build it.
  // .env.local is gitignored, so a fresh clone or CI machine hits this.
  if (mode === "production" && env.VITE_USE_MOCKS === "false") {
    const missing = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"].filter((k) => !env[k]);
    if (missing.length > 0) {
      throw new Error(
        `Refusing to build: VITE_USE_MOCKS=false but ${missing.join(" and ")} ` +
          `${missing.length > 1 ? "are" : "is"} missing. Supply them via apps/web/.env.local ` +
          `or the environment, otherwise the deployed site would run on mock data.`,
      );
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    server: { port: 5173 },
  };
});
