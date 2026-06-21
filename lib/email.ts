/**
 * lib/email.ts — transactional email via Resend (spec §8).
 *
 * Dark-themed, copy-friendly. When RESEND_API_KEY is unset, sends are a logged
 * no-op so local dev never fails on email. Never logs the token contents.
 */

import "server-only";
import { Resend } from "resend";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { PLANS, type PlanId } from "@/lib/plans";

function fmtDate(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function fmtMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const BG = "#f4eedb";
const SURFACE = "#fffcf4";
const FG = "#3a2b24";
const MUTED = "#6e5d52";
const TEAL = "#d97757";
const BORDER = "#e7ddc4";

function shell(inner: string): string {
  return `<!doctype html><html><body style="margin:0;background:${BG};color:${FG};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:520px" cellpadding="0" cellspacing="0">
      <tr><td style="padding-bottom:24px">
        <span style="font-size:18px;font-weight:700;letter-spacing:-.02em">soundn<span style="color:${TEAL}">'</span>t</span>
      </td></tr>
      <tr><td style="background:${SURFACE};border:1px solid ${BORDER};border-radius:12px;padding:28px">
        ${inner}
      </td></tr>
      <tr><td style="padding-top:20px;color:${MUTED};font-size:12px;line-height:1.6">
        Need help? <a href="mailto:${env.supportEmail()}" style="color:${TEAL};text-decoration:none">${env.supportEmail()}</a><br/>
        soundn't — local, no-account AI mic noise suppression.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function keyBlock(token: string): string {
  return `<div style="background:${BG};border:1px solid ${BORDER};border-radius:8px;padding:14px;margin:16px 0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.6;color:${FG};word-break:break-all">${token}</div>`;
}

let _resend: Resend | null = null;
function client(): Resend | null {
  const key = env.resendApiKey();
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

async function send(to: string, subject: string, html: string): Promise<{ sent: boolean }> {
  const resend = client();
  if (!resend) {
    log.warn("email skipped: RESEND_API_KEY not set", { to, subject });
    return { sent: false };
  }
  try {
    await resend.emails.send({ from: env.emailFrom(), to, subject, html });
    log.info("email sent", { to, subject });
    return { sent: true };
  } catch (e) {
    log.error("email send failed", { to, subject, err: String(e) });
    return { sent: false };
  }
}

export interface LicenseEmailInput {
  to: string;
  lic: string;
  token: string;
  plan: PlanId;
  exp: number;
  amountCents: number;
  orderRef: string;
}

export async function sendLicenseEmail(input: LicenseEmailInput): Promise<{ sent: boolean }> {
  const plan = PLANS[input.plan];
  const inner = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700">Your soundn't Pro license</h1>
    <p style="margin:0 0 8px;color:${MUTED};font-size:14px;line-height:1.6">Thanks for going Pro. Here's your license key:</p>
    ${keyBlock(input.token)}
    <p style="margin:0 0 18px;color:${MUTED};font-size:13px;line-height:1.6">
      Paste it into soundn't and it'll activate — or just return to the app, it activates automatically.
    </p>
    <table role="presentation" width="100%" style="font-size:13px;color:${FG};border-top:1px solid ${BORDER};padding-top:14px" cellpadding="0" cellspacing="0">
      <tr><td style="color:${MUTED};padding:4px 0">Plan</td><td align="right">${plan.term} (Pro)</td></tr>
      <tr><td style="color:${MUTED};padding:4px 0">Expires</td><td align="right">${fmtDate(input.exp)}</td></tr>
      <tr><td style="color:${MUTED};padding:4px 0">Amount</td><td align="right">${fmtMoney(input.amountCents)} USD</td></tr>
      <tr><td style="color:${MUTED};padding:4px 0">License</td><td align="right" style="font-family:ui-monospace,monospace">${input.lic}</td></tr>
      <tr><td style="color:${MUTED};padding:4px 0">Order</td><td align="right" style="font-family:ui-monospace,monospace;font-size:11px">${input.orderRef}</td></tr>
    </table>`;
  return send(input.to, "Your soundn't Pro license", shell(inner));
}

export interface RecoveryEmailInput {
  to: string;
  licenses: Array<{ lic: string; token: string; plan: PlanId; exp: number }>;
}

export async function sendRecoveryEmail(input: RecoveryEmailInput): Promise<{ sent: boolean }> {
  const blocks = input.licenses
    .map(
      (l) => `
      <div style="margin-bottom:18px">
        <div style="font-size:13px;color:${MUTED};margin-bottom:4px">${PLANS[l.plan].term} · expires ${fmtDate(l.exp)} · ${l.lic}</div>
        ${keyBlock(l.token)}
      </div>`
    )
    .join("");
  const inner = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700">Your soundn't Pro license${input.licenses.length > 1 ? "s" : ""}</h1>
    <p style="margin:0 0 8px;color:${MUTED};font-size:14px;line-height:1.6">As requested, here ${input.licenses.length > 1 ? "are your keys" : "is your key"}:</p>
    ${blocks}
    <p style="margin:0;color:${MUTED};font-size:13px">Paste into soundn't to activate.</p>`;
  return send(input.to, "Your soundn't Pro license", shell(inner));
}

export async function sendMagicLinkEmail(to: string, url: string): Promise<{ sent: boolean }> {
  const inner = `
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:700">Sign in to your soundn't account</h1>
    <p style="margin:0 0 18px;color:${MUTED};font-size:14px;line-height:1.6">Click below to view your licenses and devices. This link expires in 15 minutes.</p>
    <a href="${url}" style="display:inline-block;background:${TEAL};color:#fff7f0;font-weight:600;font-size:14px;text-decoration:none;padding:11px 20px;border-radius:8px">View my licenses</a>
    <p style="margin:18px 0 0;color:${MUTED};font-size:12px;line-height:1.6">If you didn't request this, you can ignore this email.</p>`;
  return send(to, "Sign in to soundn't", shell(inner));
}
