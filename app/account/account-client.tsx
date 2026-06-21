"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  KeyRound,
  Laptop,
  Loader2,
  Mail,
  MonitorSmartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CopyField } from "@/components/copy-field";
import { cn } from "@/lib/utils";

const DEFAULT_MAX_DEVICES = 3;

interface Device {
  deviceId: string;
  deviceName: string | null;
  appVersion: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
}

interface License {
  lic: string;
  plan: string;
  exp: number;
  status: string;
  token: string;
  devices: Device[];
}

interface SessionOk {
  ok: true;
  email: string;
  devicesMax?: number;
  licenses: License[];
}

/** Format a UNIX-seconds expiry into a readable date. */
function formatExp(exp: number): string {
  return new Date(exp * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Format an ISO-string device timestamp into a readable date. */
function formatDeviceDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function AccountClient() {
  const sp = useSearchParams();
  const token = sp.get("token");

  if (token) {
    return <SessionView token={token} />;
  }
  return <RequestView />;
}

/* ------------------------------------------------------------------ */
/* Mode 1: no token — request a sign-in link / re-send key            */
/* ------------------------------------------------------------------ */

function RequestView() {
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState<null | "link" | "key">(null);
  const [sent, setSent] = React.useState(false);

  async function submit(kind: "link" | "key") {
    const trimmed = email.trim();
    if (!trimmed || busy) return;
    setBusy(kind);
    const endpoint = kind === "link" ? "/api/account/request" : "/api/recover";
    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
    } catch {
      /* Never reveal whether the address exists — always show the same state. */
    } finally {
      // Always show the same confirmation, regardless of result.
      setSent(true);
      setBusy(null);
    }
  }

  return (
    <section className="mx-auto max-w-xl px-4 pb-20 pt-16">
      <div className="text-center">
        <Badge variant="muted" className="mb-5">
          <KeyRound className="mr-1.5 h-3.5 w-3.5 text-teal" /> Account-free by design
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight text-fg sm:text-4xl">My licenses</h1>
        <p className="mx-auto mt-3 max-w-md text-pretty text-sm text-muted sm:text-base">
          soundn&apos;t has no passwords. Enter the email you bought with and we&apos;ll send a
          one-time sign-in link to manage your licenses and devices.
        </p>
      </div>

      <Card className="mt-8">
        <CardContent>
          {sent ? (
            <div className="flex flex-col items-center py-4 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-teal/25 bg-teal/15">
                <Mail className="h-5 w-5 text-teal" />
              </div>
              <p className="mt-4 max-w-sm text-sm text-fg">
                If that email has licenses, we just sent a sign-in link.
              </p>
              <p className="mt-2 max-w-sm text-xs text-faint">
                Check your inbox (and spam). The link expires shortly for your security.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-5"
                onClick={() => {
                  setSent(false);
                  setEmail("");
                }}
              >
                Use a different email
              </Button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit("link");
              }}
              className="space-y-4"
            >
              <div>
                <label htmlFor="account-email" className="mb-1.5 block text-xs font-medium text-muted">
                  Email address
                </label>
                <Input
                  id="account-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy !== null}
                />
              </div>

              <Button type="submit" size="lg" className="w-full" disabled={busy !== null}>
                {busy === "link" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4" /> Email me a sign-in link
                  </>
                )}
              </Button>

              <div className="flex items-center gap-3 pt-1">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-faint">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <Button
                type="button"
                variant="outline"
                size="lg"
                className="w-full"
                disabled={busy !== null}
                onClick={() => submit("key")}
              >
                {busy === "key" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4" /> Just re-send my key
                  </>
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-faint">
        We never reveal whether an email is registered. Lost your link?{" "}
        <a href="mailto:support@soundnt.app" className="text-teal hover:underline">
          Contact support
        </a>
        .
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Mode 2: token present — load + manage the session                  */
/* ------------------------------------------------------------------ */

type SessionState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; data: SessionOk };

function SessionView({ token }: { token: string }) {
  const [state, setState] = React.useState<SessionState>({ phase: "loading" });

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/account/session?token=${encodeURIComponent(token)}`, {
        method: "GET",
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        setState({
          phase: "error",
          message: "This sign-in link is invalid or expired.",
        });
        return;
      }
      const data = (await res.json()) as SessionOk;
      setState({ phase: "ready", data });
    } catch {
      setState({
        phase: "error",
        message: "This sign-in link is invalid or expired.",
      });
    }
  }, [token]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (state.phase === "loading") {
    return (
      <section className="mx-auto max-w-2xl px-4 pb-20 pt-16">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-teal" /> Loading your licenses…
        </div>
        <div className="mt-6 space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 w-full animate-pulse rounded-lg border border-border bg-surface" />
          ))}
        </div>
      </section>
    );
  }

  if (state.phase === "error") {
    return (
      <section className="mx-auto max-w-xl px-4 pb-20 pt-20">
        <Card>
          <CardContent>
            <div className="flex flex-col items-center py-4 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-danger/25 bg-danger/15">
                <AlertTriangle className="h-5 w-5 text-danger" />
              </div>
              <p className="mt-4 text-sm font-medium text-fg">{state.message}</p>
              <p className="mt-2 max-w-sm text-xs text-faint">
                Sign-in links are single-use and expire quickly. Request a fresh one below.
              </p>
              <Button asChild variant="default" size="lg" className="mt-5">
                <Link href="/account">Request a new link</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  const { data } = state;

  return (
    <section className="mx-auto max-w-2xl px-4 pb-20 pt-16">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">My licenses</h1>
        <p className="mt-2 text-sm text-muted">
          Signed in as <span className="text-fg">{data.email}</span>
        </p>
      </div>

      {data.licenses.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-4 text-center text-sm text-muted">
              No licenses are associated with this account yet.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {data.licenses.map((license) => (
            <LicenseCard
              key={license.lic}
              token={token}
              license={license}
              devicesMax={data.devicesMax ?? DEFAULT_MAX_DEVICES}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function LicenseCard({
  token,
  license,
  devicesMax,
  onChanged,
}: {
  token: string;
  license: License;
  devicesMax: number;
  onChanged: () => Promise<void> | void;
}) {
  const isActive = license.status === "active";
  const deviceCount = license.devices.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="capitalize">{license.plan.replace(/_/g, " ")}</CardTitle>
          <Badge variant={license.status === "revoked" ? "danger" : "success"}>
            {license.status}
          </Badge>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-sm text-muted">
          <CalendarClock className="h-4 w-4 text-faint" />
          <span>
            {isActive ? "Expires" : "Expired"}{" "}
            <span className="tnum text-fg">{formatExp(license.exp)}</span>
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <CopyField value={license.token} label="License key" />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <MonitorSmartphone className="h-3.5 w-3.5" /> Devices
            </div>
            <span className="tnum text-xs text-faint">
              {deviceCount} of {devicesMax} used
            </span>
          </div>

          {deviceCount === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-faint">
              No devices activated yet. Sign in from the app with this key.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
              {license.devices.map((device) => (
                <DeviceRow
                  key={device.deviceId}
                  token={token}
                  lic={license.lic}
                  device={device}
                  onChanged={onChanged}
                />
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DeviceRow({
  token,
  lic,
  device,
  onChanged,
}: {
  token: string;
  lic: string;
  device: Device;
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const label = device.deviceName || device.deviceId;

  async function deactivate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/deactivate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, lic, deviceId: device.deviceId }),
      });
      if (!res.ok) {
        let message = "Couldn't deactivate this device.";
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) message = body.error;
        } catch {
          /* keep the default message */
        }
        setError(message);
        return;
      }
      await onChanged();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 bg-bg/40 px-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-elevated">
          <Laptop className="h-4 w-4 text-muted" />
        </div>
        <div className="min-w-0">
          <div
            className={cn("truncate font-mono text-xs text-fg")}
            title={label}
          >
            {label}
          </div>
          <div className="tnum mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-faint">
            <span>v{device.appVersion || "—"}</span>
            <span aria-hidden>·</span>
            <span>last seen {formatDeviceDate(device.lastSeen)}</span>
          </div>
          {error ? <div className="mt-1 text-[11px] text-danger">{error}</div> : null}
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={deactivate}
        disabled={busy}
        aria-label={`Deactivate ${label}`}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Deactivate
      </Button>
    </li>
  );
}
