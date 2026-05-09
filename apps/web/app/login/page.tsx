import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const params = await searchParams;
  if (user) redirect(params.next ?? "/scratchbook");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-stretch justify-center gap-8 px-6">
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-fg-muted)]">
          Rune
        </div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          Markdown-first agent workspace. We&apos;ll send you a magic link.
        </p>
      </div>
      <LoginForm next={params.next} initialError={params.error} />
    </main>
  );
}
