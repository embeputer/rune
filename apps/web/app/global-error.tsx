"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary — handles errors thrown by the root layout itself.
 * Must render its own <html>/<body> because the layout failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          background: "#0d0d10",
          color: "#f1f1f3",
        }}
      >
        <div
          style={{
            maxWidth: 400,
            padding: 24,
            border: "1px solid #2a2a30",
            borderRadius: 12,
            background: "#16161b",
          }}
        >
          <h1 style={{ fontSize: 14, marginTop: 0 }}>Rune crashed at the root</h1>
          <p style={{ fontSize: 12, color: "#a3a3a8" }}>
            {error.message || "Unknown root error."}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 12,
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #2a2a30",
              background: "#22222a",
              color: "#f1f1f3",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
