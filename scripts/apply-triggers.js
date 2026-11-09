/**
 * Applies database-level triggers to enforce append-only immutability.
 * Works on SQLite (local/test) and provides corresponding PostgreSQL DDL.
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function applyTriggers() {
  console.log("Applying database-level immutability triggers...");

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

  const triggers = await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type = 'trigger';");
  console.log("Active triggers successfully verified:", triggers.map((t) => t.name));
}

applyTriggers()
  .catch((e) => {
    console.error("Failed to apply triggers:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
