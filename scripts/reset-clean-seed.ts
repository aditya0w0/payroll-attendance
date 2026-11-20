/**
 * Database Clean Reset and Seeding Utility
 * Purges all synthetic development/test data and re-seeds clean production-ready defaults.
 */

import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";

const prisma = new PrismaClient();

async function resetCleanDatabase() {
  console.log("================================================================================");
  console.log("CLEANING DATABASE: PURGING TEST DATA & RE-SEEDING CANONICAL RECORDS");
  console.log("================================================================================\n");

  const dbUrl = process.env.DATABASE_URL || "";
  const isPostgres = dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://");

  if (isPostgres) {
    console.log("[1/4] Dropping PostgreSQL immutability triggers temporarily...");
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_audit_log_immutable ON "AuditLog";`);
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS trg_audit_outbox_immutable ON "AuditOutbox";`);

    console.log("[2/4] Truncating all application and audit tables (CASCADE)...");
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE 
        "AuditOutbox", 
        "AuditLog", 
        "AttendanceRecord", 
        "DeviceUnlockRequest", 
        "WebAuthnChallenge", 
        "QRChallenge",
        "Session", 
        "DeviceRegistration", 
        "EmployeeSalaryHistory", 
        "PayrollRecord", 
        "PayrollAdjustment", 
        "PayrollPeriod", 
        "EmployeeProfile", 
        "Shift", 
        "DeductionPolicy", 
        "OfficeConfig", 
        "User" 
      CASCADE;
    `);

    console.log("[3/4] Re-applying database immutability triggers...");
    execSync("npx tsx scripts/apply-pg-triggers.ts", { stdio: "inherit" });
  } else {
    console.log("[SQLite] Dropping SQLite triggers and clearing tables...");
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS prevent_audit_log_update;`);
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS prevent_audit_log_delete;`);
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS prevent_outbox_delivered_update;`);
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS prevent_outbox_delete;`);

    await prisma.auditOutbox.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.attendanceRecord.deleteMany();
    await prisma.deviceUnlockRequest.deleteMany();
    await prisma.webAuthnChallenge.deleteMany();
    await prisma.session.deleteMany();
    await prisma.deviceRegistration.deleteMany();
    await prisma.employeeSalaryHistory.deleteMany();
    await prisma.payrollRecord.deleteMany();
    await prisma.payrollAdjustment.deleteMany();
    await prisma.payrollPeriod.deleteMany();
    await prisma.employeeProfile.deleteMany();
    await prisma.shift.deleteMany();
    await prisma.deductionPolicy.deleteMany();
    await prisma.officeConfig.deleteMany();
    await prisma.user.deleteMany();

    execSync("npx tsx scripts/apply-pg-triggers.ts", { stdio: "inherit" });
  }

  console.log("[4/4] Executing canonical seed script...");
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });

  console.log("\n[VERIFICATION] Verifying cryptographic hash chain integrity...");
  execSync("npx tsx scripts/verify-audit-chain.js", { stdio: "inherit" });

  console.log("\n================================================================================");
  console.log("DATABASE SUCCESSFULLY RESTORED TO CLEAN PRODUCTION SEED STATE");
  console.log("================================================================================");
}

resetCleanDatabase()
  .catch((e) => {
    console.error("Clean reset error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
