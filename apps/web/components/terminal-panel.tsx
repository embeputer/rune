"use client";

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { fetchGatewayToken, openPtyWebSocket } from "@/lib/gateway-client";

interface Props {
  cwd: string;
  gatewayId: string | null;
}

export function TerminalPanel({ cwd, gatewayId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "closed" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let term: import("@xterm/xterm").Terminal | null = null;
    let fit: import("@xterm/addon-fit").FitAddon | null = null;
    let resizeObs: ResizeObserver | null = null;
    let cancelled = false;

    async function setup() {
      if (!gatewayId) return;
      if (!containerRef.current) return;

      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (cancelled || !containerRef.current) return;

      term = new Terminal({
        convertEol: true,
        cursorBlink: true,
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
        fontSize: 12.5,
        theme: {
          background: "#0f1115",
          foreground: "#d8dde6",
          cursor: "#d8dde6",
          selectionBackground: "rgba(150, 150, 200, 0.2)",
        },
      });
      fit = new FitAddon();
      term.loadAddon(fit);
      term.open(containerRef.current);
      try {
        fit.fit();
      } catch {
        // ignore
      }

      try {
        setStatus("connecting");
        const { token } = await fetchGatewayToken(gatewayId);
        if (cancelled) return;
        const ws = openPtyWebSocket(token, cwd);
        wsRef.current = ws;
        ws.binaryType = "arraybuffer";
        ws.addEventListener("open", () => {
          setStatus("connected");
        });
        ws.addEventListener("message", (ev) => {
          const data = ev.data;
          if (typeof data === "string") {
            term?.write(data);
          } else if (data instanceof ArrayBuffer) {
            term?.write(new Uint8Array(data));
          }
        });
        ws.addEventListener("close", () => {
          setStatus("closed");
        });
        ws.addEventListener("error", () => {
          setStatus("error");
          setError("WebSocket error — is the gateway online?");
        });
        term.onData((data) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(data);
          }
        });
        term.onResize(({ cols, rows }) => {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: "resize", cols, rows }));
          }
        });
      } catch (err) {
        setStatus("error");
        setError((err as Error).message);
      }

      // Resize the terminal when our container changes size.
      if (containerRef.current && fit) {
        const fitAddon = fit;
        resizeObs = new ResizeObserver(() => {
          try {
            fitAddon.fit();
          } catch {
            // ignore
          }
        });
        resizeObs.observe(containerRef.current);
      }
    }

    void setup();

    return () => {
      cancelled = true;
      resizeObs?.disconnect();
      try {
        wsRef.current?.close();
      } catch {
        // ignore
      }
      try {
        term?.dispose();
      } catch {
        // ignore
      }
    };
  }, [cwd, gatewayId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0f1115]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-1.5 text-[10px] uppercase tracking-widest text-[var(--color-fg-subtle)]">
        <span>terminal</span>
        <span className="ml-auto normal-case tracking-normal">
          {!gatewayId
            ? "no gateway"
            : status === "connecting"
              ? "connecting…"
              : status === "connected"
                ? "connected"
                : status === "closed"
                  ? "closed"
                  : status === "error"
                    ? error ?? "error"
                    : ""}
        </span>
      </div>
      {!gatewayId ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-[var(--color-fg-subtle)]">
          Start your gateway to use the terminal.
        </div>
      ) : (
        <div ref={containerRef} className="min-h-0 flex-1" />
      )}
    </div>
  );
}
