import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Read the current session's access token from cookies (server-side only).
 * Use in API Route Handlers to forward auth to FastAPI.
 */
export async function getServerAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Route Handlers are read-only — session refresh is handled by proxy.ts
        },
      },
    }
  );
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

/**
 * Returns Authorization header object for fetch calls.
 * Returns empty object if no token (FastAPI will return 401).
 */
export function bearerHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
