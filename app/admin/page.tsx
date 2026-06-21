"use client";

import * as React from "react";
import {
  LockKeyhole,
  Unlock,
  LogOut,
  RefreshCw,
  Search,
  Ban,
  AlertTriangle,
  DollarSign,
  ShoppingCart,
} from "lucide-react";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const TOKEN_KEY = "soundnt.admin.token";

// ---- API response shapes (mirrors lib/services/admin.ts) ------------------

interface RevenueData {
  totals: { paidOrders: number; revenueCents: number };
  byPlan: Array<{ plan: string; count: number; revenueCents: number }>;
  byDay: Array<{ day: string; count: number; revenueCents: number }>;
}

interface LicenseRow {
  lic: string;
  plan: string;
  exp: number; // UNIX seconds
  status: string; // active | revoked | refunded
  email: string | null;
  orderRef: string | null;
  createdAt: string; // ISO
  revokedAt: string | null;
  revokeReason: string | null;
}

interface OrderRow {
  ref: string;
  plan: string;
  amountCents: number;
  status: string; // pending | paid | expired | failed
  provider: string;
  deviceId: string | null;
  email: string | null;
  appVersion: string | null;
  createdAt: string; // ISO
  paidAt: string | null;
}

type Tab = "revenue" | "licenses" | "orders";

class UnauthorizedError extends Error {}

// ---- formatting helpers ---------------------------------------------------

function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

/** ISO timestamp → short local date. */
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** UNIX seconds → short local date. */
function fmtExp(exp: number): string {
  if (!exp) return "—";
  return new Date(exp * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function planLabel(plan: string): string {
  return plan.replace(/^pro_/, "").replace(/_/g, " ");
}

function licenseBadgeVariant(status: string): "success" | "danger" | "warn" | "muted" {
  switch (status) {
    case "active":
      return "success";
    case "revoked":
      return "danger";
    case "refunded":
      return "warn";
    default:
      return "muted";
  }
}

function orderBadgeVariant(status: string): "success" | "danger" | "warn" | "muted" {
  switch (status) {
    case "paid":
      return "success";
    case "failed":
      return "danger";
    case "pending":
      return "warn";
    default:
      return "muted";
  }
}

export default function AdminPage() {
  const [token, setToken] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);

  // Restore a previously-entered token from sessionStorage on mount.
  React.useEffect(() => {
    try {
      const saved = sessionStorage.getItem(TOKEN_KEY);
      if (saved) setToken(saved);
    } catch {
      /* sessionStorage unavailable — operator can re-enter */
    }
    setReady(true);
  }, []);

  const signIn = React.useCallback((t: string) => {
    try {
      sessionStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* ignore */
    }
    setToken(t);
  }, []);

  const signOut = React.useCallback(() => {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    setToken(null);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">
        {!ready ? null : token ? (
          <Dashboard token={token} onLock={signOut} onUnauthorized={signOut} />
        ) : (
          <Unlocker onUnlock={signIn} />
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

// ===========================================================================
// Unlock screen
// ===========================================================================

function Unlocker({ onUnlock }: { onUnlock: (token: string) => void }) {
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function attempt(e: React.FormEvent) {
    e.preventDefault();
    const candidate = value.trim();
    if (!candidate || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/revenue", {
        headers: { Authorization: `Bearer ${candidate}` },
      });
      if (res.status === 401) {
        setError("Invalid token");
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Request failed (${res.status})`);
        return;
      }
      onUnlock(candidate);
    } catch {
      setError("Network error — could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="relative overflow-hidden">
      <div className="glow-teal pointer-events-none absolute inset-x-0 top-0 h-[360px]" />
      <div className="relative mx-auto flex max-w-md flex-col items-center px-4 py-24">
        <Card className="w-full">
          <CardContent className="space-y-5">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-elevated">
                <LockKeyhole className="h-5 w-5 text-teal" />
              </div>
              <h1 className="mt-4 text-lg font-bold tracking-tight text-fg">Admin access</h1>
              <p className="mt-1 text-sm text-muted">
                Enter the operator token to open the ops dashboard.
              </p>
            </div>

            <form onSubmit={attempt} className="space-y-3">
              <div>
                <label htmlFor="admin-token" className="mb-1.5 block text-xs font-medium text-muted">
                  Admin token
                </label>
                <Input
                  id="admin-token"
                  type="password"
                  autoComplete="off"
                  autoFocus
                  placeholder="••••••••••••••••"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    if (error) setError(null);
                  }}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "admin-token-error" : undefined}
                />
              </div>

              {error ? (
                <p
                  id="admin-token-error"
                  role="alert"
                  className="flex items-center gap-1.5 text-sm text-danger"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {error}
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={busy || !value.trim()}>
                <Unlock className="h-4 w-4" />
                {busy ? "Unlocking…" : "Unlock"}
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-faint">
          The token is held in this tab only and sent as a bearer header.
        </p>
      </div>
    </section>
  );
}

// ===========================================================================
// Dashboard
// ===========================================================================

function Dashboard({
  token,
  onLock,
  onUnauthorized,
}: {
  token: string;
  onLock: () => void;
  onUnauthorized: () => void;
}) {
  const [tab, setTab] = React.useState<Tab>("revenue");

  /** Authed fetch helper — throws UnauthorizedError on 401 so callers can bail. */
  const api = React.useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const res = await fetch(path, {
        ...init,
        headers: {
          ...(init?.headers ?? {}),
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.status === 401) {
        onUnauthorized();
        throw new UnauthorizedError("unauthorized");
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      return (await res.json()) as T;
    },
    [token, onUnauthorized]
  );

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "revenue", label: "Revenue" },
    { id: "licenses", label: "Licenses" },
    { id: "orders", label: "Orders" },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-fg">Ops dashboard</h1>
          <p className="mt-1 text-sm text-muted">Revenue, licenses, and orders.</p>
        </div>
        <Button variant="outline" size="sm" onClick={onLock}>
          <LogOut className="h-4 w-4" />
          Lock
        </Button>
      </div>

      <div
        role="tablist"
        aria-label="Dashboard sections"
        className="glass mt-6 inline-flex gap-1 rounded-xl p-1"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-[7px] px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/60",
              tab === t.id ? "bg-elevated text-fg" : "text-muted hover:text-fg"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "revenue" ? <RevenueSection api={api} /> : null}
        {tab === "licenses" ? <LicensesSection api={api} /> : null}
        {tab === "orders" ? <OrdersSection api={api} /> : null}
      </div>
    </div>
  );
}

type Api = <T>(path: string, init?: RequestInit) => Promise<T>;

// ---- shared section chrome -----------------------------------------------

function SectionError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-md border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

function SectionLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-4 py-6 text-sm text-muted">
      <RefreshCw className="h-4 w-4 animate-spin text-teal" />
      {label}
    </div>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-faint">
        {label}
      </td>
    </tr>
  );
}

// ===========================================================================
// Revenue
// ===========================================================================

function RevenueSection({ api }: { api: Api }) {
  const [data, setData] = React.useState<RevenueData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<RevenueData>("/api/admin/revenue");
      setData(res);
    } catch (err) {
      if (err instanceof UnauthorizedError) return;
      setError(err instanceof Error ? err.message : "Failed to load revenue");
    } finally {
      setLoading(false);
    }
  }, [api]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">Revenue</h2>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {error ? <SectionError message={error} /> : null}
      {loading && !data ? <SectionLoading label="Loading revenue…" /> : null}

      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted">
                  <DollarSign className="h-4 w-4 text-teal" />
                  Total revenue
                </div>
                <div className="tnum mt-2 text-3xl font-bold tracking-tight text-fg">
                  ${usd(data.totals.revenueCents)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted">
                  <ShoppingCart className="h-4 w-4 text-teal" />
                  Paid orders
                </div>
                <div className="tnum mt-2 text-3xl font-bold tracking-tight text-fg">
                  {fmtNum(data.totals.paidOrders)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="space-y-3">
              <div className="text-xs font-medium text-muted">By plan</div>
              {data.byPlan.length === 0 ? (
                <div className="py-4 text-center text-sm text-faint">No paid orders yet.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {data.byPlan.map((p) => (
                    <li key={p.plan} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="flex items-center gap-2">
                        <Badge variant="muted" className="uppercase">
                          {planLabel(p.plan)}
                        </Badge>
                        <span className="tnum text-faint">{fmtNum(p.count)} orders</span>
                      </span>
                      <span className="tnum font-medium text-fg">${usd(p.revenueCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-border px-5 py-3 text-xs font-medium text-muted">
              By day (most recent first)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-faint">
                    <th className="px-5 py-2.5 font-medium">Day</th>
                    <th className="px-5 py-2.5 text-right font-medium">Orders</th>
                    <th className="px-5 py-2.5 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.byDay.length === 0 ? (
                    <EmptyRow colSpan={3} label="No paid days yet." />
                  ) : (
                    data.byDay.map((d) => (
                      <tr key={d.day} className="hover:bg-elevated/50">
                        <td className="tnum px-5 py-2.5 text-fg">{d.day}</td>
                        <td className="tnum px-5 py-2.5 text-right text-muted">{fmtNum(d.count)}</td>
                        <td className="tnum px-5 py-2.5 text-right font-medium text-fg">
                          ${usd(d.revenueCents)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}

// ===========================================================================
// Licenses
// ===========================================================================

function LicensesSection({ api }: { api: Api }) {
  const [licenses, setLicenses] = React.useState<LicenseRow[]>([]);
  const [query, setQuery] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [revoking, setRevoking] = React.useState<string | null>(null);

  const load = React.useCallback(
    async (q: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
        const res = await api<{ licenses: LicenseRow[] }>(`/api/admin/licenses${params}`);
        setLicenses(res.licenses);
      } catch (err) {
        if (err instanceof UnauthorizedError) return;
        setError(err instanceof Error ? err.message : "Failed to load licenses");
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  React.useEffect(() => {
    void load("");
  }, [load]);

  // Debounced search as the operator types.
  React.useEffect(() => {
    const id = setTimeout(() => void load(query), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function revoke(lic: string) {
    const reason = window.prompt(`Revoke ${lic}?\nEnter a reason (refund, abuse, etc.):`);
    if (reason === null) return; // cancelled
    const trimmed = reason.trim();
    if (!trimmed) {
      window.alert("A reason is required to revoke.");
      return;
    }
    setRevoking(lic);
    setError(null);
    try {
      await api("/api/admin/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lic, reason: trimmed }),
      });
      await load(query);
    } catch (err) {
      if (err instanceof UnauthorizedError) return;
      setError(err instanceof Error ? err.message : "Failed to revoke license");
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-fg">Licenses</h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input
              type="search"
              placeholder="Search lic, email or order ref…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void load(query);
              }}
              className="w-full pl-9 sm:w-72"
              aria-label="Search licenses"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load(query)}
            disabled={loading}
            aria-label="Refresh licenses"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {error ? <SectionError message={error} /> : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-faint">
                <th className="px-4 py-2.5 font-medium">License</th>
                <th className="px-4 py-2.5 font-medium">Plan</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Expires</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
                <th className="px-4 py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && licenses.length === 0 ? (
                <EmptyRow colSpan={7} label="Loading licenses…" />
              ) : licenses.length === 0 ? (
                <EmptyRow colSpan={7} label="No licenses match." />
              ) : (
                licenses.map((l) => (
                  <tr key={l.lic} className="align-middle hover:bg-elevated/50">
                    <td className="px-4 py-2.5">
                      <span className="tnum font-mono text-xs text-fg">{l.lic}</span>
                    </td>
                    <td className="px-4 py-2.5 uppercase text-muted">{planLabel(l.plan)}</td>
                    <td className="max-w-[14rem] truncate px-4 py-2.5 text-muted" title={l.email ?? ""}>
                      {l.email ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={licenseBadgeVariant(l.status)}>{l.status}</Badge>
                    </td>
                    <td className="tnum px-4 py-2.5 text-muted">{fmtExp(l.exp)}</td>
                    <td className="tnum px-4 py-2.5 text-muted">{fmtDate(l.createdAt)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {l.status === "active" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void revoke(l.lic)}
                          disabled={revoking === l.lic}
                          className="text-danger hover:bg-danger/10"
                        >
                          <Ban className="h-3.5 w-3.5" />
                          {revoking === l.lic ? "Revoking…" : "Revoke"}
                        </Button>
                      ) : l.revokeReason ? (
                        <span className="text-xs text-faint" title={l.revokeReason}>
                          {l.revokeReason}
                        </span>
                      ) : (
                        <span className="text-xs text-faint">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ===========================================================================
// Orders
// ===========================================================================

function OrdersSection({ api }: { api: Api }) {
  const [orders, setOrders] = React.useState<OrderRow[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ orders: OrderRow[] }>("/api/admin/orders");
      setOrders(res.orders);
    } catch (err) {
      if (err instanceof UnauthorizedError) return;
      setError(err instanceof Error ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [api]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">Recent orders</h2>
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {error ? <SectionError message={error} /> : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-faint">
                <th className="px-4 py-2.5 font-medium">Ref</th>
                <th className="px-4 py-2.5 font-medium">Plan</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && orders.length === 0 ? (
                <EmptyRow colSpan={6} label="Loading orders…" />
              ) : orders.length === 0 ? (
                <EmptyRow colSpan={6} label="No orders yet." />
              ) : (
                orders.map((o) => (
                  <tr key={o.ref} className="hover:bg-elevated/50">
                    <td className="px-4 py-2.5">
                      <span
                        className="tnum block max-w-[10rem] truncate font-mono text-xs text-fg"
                        title={o.ref}
                      >
                        {o.ref}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 uppercase text-muted">{planLabel(o.plan)}</td>
                    <td className="tnum px-4 py-2.5 text-right font-medium text-fg">
                      ${usd(o.amountCents)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={orderBadgeVariant(o.status)}>{o.status}</Badge>
                    </td>
                    <td className="max-w-[14rem] truncate px-4 py-2.5 text-muted" title={o.email ?? ""}>
                      {o.email ?? "—"}
                    </td>
                    <td className="tnum px-4 py-2.5 text-muted">{fmtDate(o.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
