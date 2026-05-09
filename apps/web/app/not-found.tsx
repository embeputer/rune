import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-6">
      <div className="w-full max-w-md space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-6 text-center">
        <div className="text-3xl font-bold text-[var(--color-fg-muted)]">404</div>
        <h1 className="text-sm font-semibold">Rune not found</h1>
        <p className="text-xs text-[var(--color-fg-muted)]">
          This rune, project, or page doesn&apos;t exist (or you don&apos;t have
          access).
        </p>
        <Button asChild>
          <Link href="/">Back to scratchbook</Link>
        </Button>
      </div>
    </div>
  );
}
