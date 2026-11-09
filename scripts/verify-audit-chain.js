/**
 * Audit Ledger Integrity Verification CLI
 * Run via: npm run audit:verify
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { verifyAuditChainIntegrity } = require("../src/lib/audit-verifier");

async function main() {
  console.log("================================================================================");
  console.log("AUDIT LEDGER HASH-CHAIN INTEGRITY VERIFIER");
  console.log("================================================================================\n");

  const result = await verifyAuditChainIntegrity();

  console.log(`Total Records Verified : ${result.totalRecordsChecked}`);
  console.log(`Genesis Sequence       : #${result.genesisSequence}`);
  console.log(`Latest Sequence        : #${result.latestSequence}`);
  console.log(`Checked At             : ${result.checkedAt}`);
  console.log("--------------------------------------------------------------------------------");

  if (result.valid) {
    console.log("Status: VERIFIED (All sequence hashes and Ed25519 signatures are authentic)\n");
    process.exit(0);
  } else {
    console.error(`Status: COMPROMISED!`);
    console.error(`Broken Sequence : #${result.brokenSequence}`);
    console.error(`Entity ID       : ${result.brokenEntityId}`);
    console.error(`Error Details   : ${result.error}\n`);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("Verification error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
