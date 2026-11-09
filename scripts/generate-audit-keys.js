/**
 * Generates an Ed25519 keypair for Vercel Environment Variables:
 * - AUDIT_SIGNING_PRIVATE_KEY
 * - AUDIT_SIGNING_PUBLIC_KEY
 */

const crypto = require("node:crypto");

function generateKeys() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

  // Convert to single-line base64 for easy copying into Vercel Dashboard / .env
  const privB64 = Buffer.from(privateKeyPem).toString("base64");
  const pubB64 = Buffer.from(publicKeyPem).toString("base64");

  console.log("================================================================================");
  console.log("ED25519 AUDIT CHAIN SIGNING KEYS GENERATED");
  console.log("================================================================================\n");
  console.log("Add the following variables to your .env or Vercel Environment Variables:\n");
  console.log(`AUDIT_SIGNING_PRIVATE_KEY="${privB64}"`);
  console.log(`AUDIT_SIGNING_PUBLIC_KEY="${pubB64}"`);
  console.log("\n================================================================================\n");

  return { privateKeyPem, publicKeyPem, privB64, pubB64 };
}

if (require.main === module) {
  generateKeys();
}

module.exports = { generateKeys };
