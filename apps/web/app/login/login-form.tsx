"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next, initialError }: { next?: string; initialError?: string }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState<"email" | "github" | null>(null);
  const [sent, setSent] = useState(false);

  async function signInEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading("email");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next ?? "/scratchbook")}`,
      },
    });
    setLoading(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
    toast.success("Magic link sent. Check your inbox.");
  }

  async function signInGithub() {
    setLoading("github");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next ?? "/scratchbook")}`,
        scopes: "read:user user:email repo",
      },
    });
    if (error) {
      toast.error(error.message);
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      {initialError && (
        <div className="rounded-md border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-3 py-2 text-sm text-[var(--color-danger)]">
          {initialError}
        </div>
      )}
      <form onSubmit={signInEmail} className="space-y-3">
        <Input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading !== null || sent}
        />
        <Button type="submit" className="w-full" disabled={loading !== null || sent}>
          {sent ? "Magic link sent" : loading === "email" ? "Sending…" : "Send magic link"}
        </Button>
      </form>
      <div className="relative my-4">
        <div className="absolute inset-x-0 top-1/2 h-px bg-[var(--color-border)]" />
        <div className="relative flex justify-center">
          <span className="bg-[var(--color-bg)] px-2 text-xs text-[var(--color-fg-subtle)]">
            or
          </span>
        </div>
      </div>
      <Button
        variant="outline"
        className="w-full"
        onClick={signInGithub}
        disabled={loading !== null}
      >
        {loading === "github" ? "Redirecting…" : "Continue with GitHub"}
      </Button>
    </div>
  );
}
