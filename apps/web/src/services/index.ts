import type { JessicaApi } from "./api";
import { mockApi } from "./mock/mockApi";
import { httpApi, isSupabaseConfigured } from "./http/httpApi";

/**
 * VITE_USE_MOCKS=true (the default) runs the whole app on localStorage with no
 * accounts and no API keys. Set it to false once Supabase and the Worker are
 * configured; the UI never learns which one it is talking to.
 */
const mocksRequested = import.meta.env.VITE_USE_MOCKS !== "false";

// Asking for the real backend and quietly getting mocks instead is how a deploy
// ends up storing real signups in a visitor's localStorage while looking
// completely normal. There is no safe fallback here, so there isn't one: fail
// loudly. `vite build` refuses this combination outright (see vite.config.ts),
// which is what stops it reaching production in the first place.
if (!mocksRequested && !isSupabaseConfigured()) {
  throw new Error(
    "VITE_USE_MOCKS=false but VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing. " +
      "Set them in apps/web/.env.local, or set VITE_USE_MOCKS=true to run on mock data.",
  );
}

export const api: JessicaApi = mocksRequested ? mockApi : httpApi;
