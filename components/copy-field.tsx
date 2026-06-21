"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** A monospace, copy-friendly block for license keys/tokens. */
export function CopyField({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — user can still select the text */
    }
  }

  return (
    <div className={className}>
      {label ? <div className="mb-1.5 text-xs font-medium text-muted">{label}</div> : null}
      <div className="flex items-stretch gap-2">
        <code className="tnum min-w-0 flex-1 break-all rounded-md border border-border bg-bg px-3 py-2.5 font-mono text-xs leading-relaxed text-fg">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-elevated px-3 text-xs font-medium text-fg transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/50"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-teal" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
