/**
 * Database Immutability & Tamper-Evident Triggers Deployment Script
 * Supports:
 * - Production PostgreSQL (Neon / Supabase / Vercel Postgres)
 * - Local & CI SQLite environments
 *
 * Idempotently creates or replaces trigger functions and binds triggers
 * forbidding UPDATE/DELETE operations on AuditLog and preventing modifications
 * to DELIVERED outbox entries.
 */

import { prisma } from "../src/lib/db";
import fs from "node:fs";
import path from "node:path";

async function applyTriggers() {
  console.log("================================================================================");
  console.log("APPLYING DATABASE IMMUTABILITY TRIGGERS");
  console.log("================================================================================");

  const dbUrl =
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    "file:./dev.db";

  const isPostgres = dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://");

  if (isPostgres) {
    console.log("[Target: PostgreSQL] Connecting to production database cluster...");

    const sqlFilePath = path.join(process.cwd(), "prisma/migrations_pg/001_audit_triggers.sql");
    const fullSql = fs.readFileSync(sqlFilePath, "utf-8");

    // Split SQL statements separated by semicolons (handling plpgsql blocks)
    // 1. AuditLog function & trigger
    const fnAuditLogSql = `
      CREATE OR REPLACE FUNCTION enforce_audit_log_immutable()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'Audit logs are immutable and append-only. UPDATE and DELETE operations are forbidden.';
      END;
      $$ LANGUAGE plpgsql;
    `;

    const dropTrgAuditLog = `DROP TRIGGER IF EXISTS trg_audit_log_immutable ON "AuditLog";`;
    const createTrgAuditLog = `
      CREATE TRIGGER trg_audit_log_immutable
      BEFORE UPDATE OR DELETE ON "AuditLog"
      FOR EACH ROW
      EXECUTE FUNCTION enforce_audit_log_immutable();
    `;

    // 2. AuditOutbox function & trigger
    const fnAuditOutboxSql = `
      CREATE OR REPLACE FUNCTION enforce_audit_outbox_immutable()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'Audit outbox records are durable and cannot be deleted.';
        END IF;

        IF TG_OP = 'UPDATE' THEN
          IF OLD.status = 'DELIVERED' THEN
            RAISE EXCEPTION 'Delivered audit outbox records are permanently immutable.';
          END IF;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `;

    const dropTrgAuditOutbox = `DROP TRIGGER IF EXISTS trg_audit_outbox_immutable ON "AuditOutbox";`;
    const createTrgAuditOutbox = `
      CREATE TRIGGER trg_audit_outbox_immutable
      BEFORE UPDATE OR DELETE ON "AuditOutbox"
      FOR EACH ROW
      EXECUTE FUNCTION enforce_audit_outbox_immutable();
    `;

    await prisma.$executeRawUnsafe(fnAuditLogSql);
    await prisma.$executeRawUnsafe(dropTrgAuditLog);
    await prisma.$executeRawUnsafe(createTrgAuditLog);

    await prisma.$executeRawUnsafe(fnAuditOutboxSql);
    await prisma.$executeRawUnsafe(dropTrgAuditOutbox);
    await prisma.$executeRawUnsafe(createTrgAuditOutbox);

    console.log("[Status: APPLIED] Successfully configured PostgreSQL triggers on AuditLog and AuditOutbox.");

    // Query information_schema to verify
    try {
      const activeTriggers: any = await prisma.$queryRawUnsafe(`
        SELECT trigger_name, event_manipulation, event_object_table
        FROM information_schema.triggers
        WHERE event_object_table IN ('AuditLog', 'AuditOutbox');
      `);
      console.log("[Verification: ACTIVE]", activeTriggers);
    } catch {
      // ignore
    }
  } else {
    console.log("[Target: SQLite] Connecting to local database...");

    // 1. AuditLog: Block UPDATE
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS prevent_audit_log_update
      BEFORE UPDATE ON AuditLog
      BEGIN
        SELECT RAISE(FAIL, 'Audit logs are immutable and append-only');
      END;
    `);

    // 2. AuditLog: Block DELETE
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS prevent_audit_log_delete
      BEFORE DELETE ON AuditLog
      BEGIN
        SELECT RAISE(FAIL, 'Audit logs are immutable and append-only');
      END;
    `);

    // 3. AuditOutbox: Block updating DELIVERED rows
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS prevent_outbox_delivered_update
      BEFORE UPDATE OF status ON AuditOutbox
      WHEN OLD.status = 'DELIVERED'
      BEGIN
        SELECT RAISE(FAIL, 'Delivered outbox records are immutable');
      END;
    `);

    // 4. AuditOutbox: Block DELETE
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS prevent_outbox_delete
      BEFORE DELETE ON AuditOutbox
      BEGIN
        SELECT RAISE(FAIL, 'Outbox records are immutable and cannot be deleted');
      END;
    `);

    const triggers: any = await prisma.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type = 'trigger';"
    );
    console.log("[Status: APPLIED] SQLite triggers successfully verified:", triggers.map((t: any) => t.name));
  }

  console.log("================================================================================");
}

applyTriggers()
  .catch((e) => {
    console.error("[Fatal Error] Failed to apply database triggers:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
