import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[var(--color-bg-elev-2)] text-[var(--color-fg)]",
        accent: "border-transparent bg-[var(--color-accent)]/15 text-[var(--color-accent)]",
        success: "border-transparent bg-[var(--color-success)]/15 text-[var(--color-success)]",
        warn: "border-transparent bg-[var(--color-warn)]/15 text-[var(--color-warn)]",
        danger: "border-transparent bg-[var(--color-danger)]/15 text-[var(--color-danger)]",
        outline: "border-[var(--color-border-strong)] text-[var(--color-fg-muted)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
