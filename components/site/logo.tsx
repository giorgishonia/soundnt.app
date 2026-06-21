import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  href = "/",
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="soundn't home"
      className={cn("group inline-flex items-center", className)}
    >
      <span className="text-lg font-bold tracking-tight text-fg">
        soundn<span className="text-teal">&apos;</span>t
      </span>
    </Link>
  );
}
