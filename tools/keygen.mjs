#!/usr/bin/env node
/**
 * tools/keygen.mjs — generate a production Ed25519 license keypair (spec §2.5).
 *
 *   npm run keygen
 *
 * Prints:
 *   - LICENSE_SIGNING_KEY_JWK  → put in the server env (SECRET, never commit).
 *   - LICENSE_PUBKEY_B64 (x)   → send to the app team to embed in the app build.
 *
 * The site and the app MUST share the same keypair or tokens won't verify.
 * Optionally writes the private JWK to a file with `--out <path>` (gitignored).
 */

import crypto from "node:crypto";
import { writeFileSync } from "node:fs";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const priv = privateKey.export({ format: "jwk" });
const pub = publicKey.export({ format: "jwk" });

const privJson = JSON.stringify(priv);

console.log("\n=== soundn't license keypair (Ed25519) ===\n");
console.log("PUBLIC x (base64url) — send to the app team, embed as LICENSE_PUBKEY_B64:");
console.log("  " + pub.x + "\n");
console.log("PRIVATE JWK — set as server env LICENSE_SIGNING_KEY_JWK (SECRET):");
console.log("  " + privJson + "\n");

const outIdx = process.argv.indexOf("--out");
if (outIdx !== -1 && process.argv[outIdx + 1]) {
  const path = process.argv[outIdx + 1];
  writeFileSync(path, privJson + "\n", { mode: 0o600 });
  console.log(`Wrote private JWK to ${path} (keep it secret; it is gitignored by *.local / .env).\n`);
}

console.log("Reminder: do NOT go live until the app build with this public key is shipped.\n");
