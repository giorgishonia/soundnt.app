import Link from "next/link";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type Plan } from "@/lib/plans";

export function PlanCard({ plan }: { plan: Plan }) {
  const price = (plan.amountCents / 100).toFixed(2);
  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl p-5 transition-all duration-300",
        plan.highlight
          ? "glass glass-teal"
          : "glass hover:-translate-y-0.5 hover:border-[rgba(58,43,36,0.2)]"
      )}
    >
      {plan.highlight ? (
        <Badge className="absolute -top-2.5 left-5 shadow-lg shadow-teal/20">Best value</Badge>
      ) : null}

      <div className="text-sm font-medium text-muted">{plan.term}</div>

      <div className="mt-2 flex items-baseline gap-1">
        <span className="tnum text-4xl font-bold tracking-tight text-fg">${price}</span>
      </div>
      <div className="tnum mt-1 text-sm text-faint">
        {plan.perMonth}
        {plan.save ? <span className="ml-2 font-medium text-teal">save {plan.save}</span> : null}
      </div>

      <ul className="mt-4 space-y-2 text-sm text-muted">
        <li className="flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0 text-teal" /> {plan.termMonths * 30}+ days of Pro
        </li>
        <li className="flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0 text-teal" /> Up to 3 devices
        </li>
        <li className="flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0 text-teal" /> Pay in 300+ coins
        </li>
      </ul>

      <Link
        href={`/buy?plan=${plan.id}`}
        className={cn(
          "mt-5 inline-flex h-10 items-center justify-center rounded-lg text-sm font-semibold transition-all duration-200",
          plan.highlight
            ? "bg-teal text-teal-fg shadow-lg shadow-teal/25 hover:bg-teal/90 hover:shadow-teal/40"
            : "border border-[rgba(58,43,36,0.14)] bg-[rgba(58,43,36,0.04)] text-fg hover:border-teal/40 hover:bg-teal/10 hover:text-teal"
        )}
      >
        Get {plan.term} Pro
      </Link>
    </div>
  );
}
