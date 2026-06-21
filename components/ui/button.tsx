import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        default: "bg-teal text-teal-fg hover:bg-teal/90 font-semibold",
        outline: "border border-border bg-transparent text-fg hover:bg-elevated",
        ghost: "bg-transparent text-muted hover:text-fg hover:bg-elevated",
        secondary: "bg-elevated text-fg hover:bg-surface border border-border",
        link: "text-teal underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3 text-[13px]",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

/**
 * Minimal Slot: when `asChild` is set, render the single child element and merge
 * the button's className/props onto it (so e.g. a Next <Link> becomes a styled,
 * accessible link instead of an invalid <button><a/></button>). Mirrors the
 * shadcn/Radix Slot behavior for our usage without adding a dependency.
 */
function Slot({
  className,
  children,
  ...props
}: { className?: string; children?: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  if (!React.isValidElement(children)) return null;
  const child = children as React.ReactElement<{ className?: string }>;
  return React.cloneElement(child, {
    ...props,
    ...child.props,
    className: cn(className, child.props?.className),
  } as Record<string, unknown>);
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size, className }));
    if (asChild) {
      return (
        <Slot className={classes} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button ref={ref} className={classes} {...props}>
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
