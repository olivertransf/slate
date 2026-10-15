import { hashPassphrase } from "../lib/session.ts";

const passphrase = process.argv[2];
if (!passphrase) {
  console.error("Usage: node scripts/hash-passphrase.mjs <passphrase>");
  process.exit(1);
}
console.log(await hashPassphrase(passphrase));
