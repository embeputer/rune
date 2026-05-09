import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/scratchbook");

  return (
    <main className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-8 px-6">
      <div className="absolute inset-x-0 top-1/3 -z-10 mx-auto h-72 w-72 rounded-full bg-[var(--color-accent)] opacity-15 blur-[120px]" />
      <h1 className="text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl">
        Reach agentic flow state
      </h1>
      <p className="max-w-xl text-lg text-[var(--color-fg-muted)]">
        You think in chaos. Agents work in structure. Rune is the translator. Command in.
        Magic out.
      </p>
      <div className="flex gap-3">
        <Button asChild size="lg">
          <Link href="/login">Get started</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <a href="https://github.com/embeputer/rune" target="_blank" rel="noreferrer">
            View on GitHub
          </a>
        </Button>
      </div>
    </main>
  );
}
