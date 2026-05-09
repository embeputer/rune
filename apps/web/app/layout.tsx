import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rune",
  description: "The most in-depth, simple environment for agents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--color-bg-elev-2)",
              color: "var(--color-fg)",
              border: "1px solid var(--color-border-strong)",
            },
          }}
        />
      </body>
    </html>
  );
}
