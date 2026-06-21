import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card — frosted glass over the shader by default. Pass `variant="solid"` for an
 * opaque surface (e.g. dense tables) or `variant="teal"` for a featured edge.
 */
export function Card({
  className,
  variant = "glass",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: "glass" | "solid" | "teal" }) {
  return (
    <div
      className={cn(
        "rounded-xl",
        variant === "solid" && "border border-border bg-surface",
        variant === "glass" && "glass",
        variant === "teal" && "glass glass-teal",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pb-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold tracking-tight", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}
