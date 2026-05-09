import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/scratchbook";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const redirect = new URL("/login", url.origin);
      redirect.searchParams.set("error", error.message);
      return NextResponse.redirect(redirect);
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
