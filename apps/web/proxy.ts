import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Renamed from `middleware.ts` for Next.js 16 (middleware → proxy migration).
// The Supabase helper file kept its `middleware` filename for stability;
// our exported function is now `proxy` per the framework requirement.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skip API routes — each handler enforces auth via `getUser()` and returns
  // 401 directly. Running the proxy on API requests would just duplicate
  // work without changing behavior. Static asset and image routes are also
  // excluded as before.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
