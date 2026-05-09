"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] p-6">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-6">
        <div className="flex items-center gap-2 text-[var(--color-warn)]">
          <AlertTriangle className="h-4 w-4" />
          <h1 className="text-sm font-semibold">Something snapped</h1>
        </div>
        <p className="text-xs text-[var(--color-fg-muted)]">
          {error.message || "An unexpected error occurred."}
        </p>
        {error.digest && (
          <code className="block break-all rounded-md bg-[var(--color-bg-elev-2)] px-2 py-1 font-mono text-[10px] text-[var(--color-fg-subtle)]">
            digest: {error.digest}
          </code>
        )}
        <Button onClick={reset} className="w-full">
          <RotateCcw className="h-3.5 w-3.5" /> Try again
        </Button>
      </div>
    </div>
  );
}
