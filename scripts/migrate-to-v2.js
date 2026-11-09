/**
 * Database Migration & Backfill Script
 * Migrates AuditLog to cryptographic hash-chain schema v2.
 * Migrates DeviceRegistration to WebAuthn FIDO2 passkey schema.
 * Creates WebAuthnChallenge, AuditOutbox, and immutable DB triggers.
 */

const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const prisma = new PrismaClient();

async function runMigration() {
  console.log("Starting safe database migration & schema upgrade...");

  // 1. AuditLog Column Migrations
  const auditCols = await prisma.$queryRawUnsafe("PRAGMA table_info(AuditLog);");
  const auditColNames = auditCols.map((c) => c.name);

  if (!auditColNames.includes("sequenceNumber")) {
    await prisma.$executeRawUnsafe("ALTER TABLE AuditLog ADD COLUMN sequenceNumber INTEGER;");
  }
  if (!auditColNames.includes("schemaVersion")) {
    await prisma.$executeRawUnsafe("ALTER TABLE AuditLog ADD COLUMN schemaVersion INTEGER DEFAULT 2;");
  }
  if (!auditColNames.includes("previousHash")) {
    await prisma.$executeRawUnsafe("ALTER TABLE AuditLog ADD COLUMN previousHash TEXT DEFAULT 'GENESIS';");
  }
  if (!auditColNames.includes("currentHash")) {
    await prisma.$executeRawUnsafe("ALTER TABLE AuditLog ADD COLUMN currentHash TEXT DEFAULT 'GENESIS';");
  }
  if (!auditColNames.includes("signature")) {
    await prisma.$executeRawUnsafe("ALTER TABLE AuditLog ADD COLUMN signature TEXT DEFAULT 'UNSIGNED';");
  }

  // 2. Backfill existing legacy audit logs
  const existingAuditLogs = await prisma.auditLog.findMany({
    orderBy: { timestamp: "asc" },
  });

  console.log(`Backfilling ${existingAuditLogs.length} existing audit logs with sequence and legacy anchor...`);
  let seq = 1;
  let prevHash = "GENESIS_ANCHOR_0000000000000000000000000000000000000000000000000000000000000000";

  for (const log of existingAuditLogs) {
    if (!log.sequenceNumber || log.sequenceNumber === 0) {
      const canonicalData = JSON.stringify({
        id: log.id,
        sequenceNumber: seq,
        action: log.action,
        actorId: log.actorId,
        actorRole: log.actorRole,
        actorName: log.actorName,
        targetEntity: log.targetEntity,
        targetId: log.targetId,
        previousValues: log.previousValues,
        newValues: log.newValues,
        timestamp: log.timestamp.toISOString(),
        previousHash: prevHash,
      });

      const hash = crypto.createHash("sha256").update(canonicalData).digest("hex");

      await prisma.$executeRawUnsafe(
        `UPDATE AuditLog SET sequenceNumber = ?, schemaVersion = 1, previousHash = ?, currentHash = ?, signature = 'LEGACY_BASELINE' WHERE id = ?`,
        seq,
        prevHash,
        hash,
        log.id
      );

      prevHash = hash;
      seq++;
    } else {
      seq = Math.max(seq, log.sequenceNumber + 1);
      prevHash = log.currentHash || prevHash;
    }
  }

  // Create unique index on sequenceNumber
  try {
    await prisma.$executeRawUnsafe("CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_log_seq ON AuditLog(sequenceNumber);");
  } catch (e) {
    console.log("Index already exists or created:", e.message);
  }

  // 3. DeviceRegistration Column Migrations
  const devCols = await prisma.$queryRawUnsafe("PRAGMA table_info(DeviceRegistration);");
  const devColNames = devCols.map((c) => c.name);

  if (!devColNames.includes("credentialId")) {
    await prisma.$executeRawUnsafe("ALTER TABLE DeviceRegistration ADD COLUMN credentialId TEXT;");
  }
  if (!devColNames.includes("credentialPublicKey")) {
    await prisma.$executeRawUnsafe("ALTER TABLE DeviceRegistration ADD COLUMN credentialPublicKey TEXT;");
  }
  if (!devColNames.includes("counter")) {
    await prisma.$executeRawUnsafe("ALTER TABLE DeviceRegistration ADD COLUMN counter INTEGER DEFAULT 0;");
  }
  if (!devColNames.includes("transports")) {
    await prisma.$executeRawUnsafe("ALTER TABLE DeviceRegistration ADD COLUMN transports TEXT;");
  }
  if (!devColNames.includes("credentialBackedUp")) {
    await prisma.$executeRawUnsafe("ALTER TABLE DeviceRegistration ADD COLUMN credentialBackedUp INTEGER DEFAULT 0;");
  }
  if (!devColNames.includes("credentialDeviceType")) {
    await prisma.$executeRawUnsafe("ALTER TABLE DeviceRegistration ADD COLUMN credentialDeviceType TEXT DEFAULT 'singleDevice';");
  }
  if (!devColNames.includes("assuranceTier")) {
    await prisma.$executeRawUnsafe("ALTER TABLE DeviceRegistration ADD COLUMN assuranceTier TEXT DEFAULT 'LEGACY_FINGERPRINT';");
  }
  if (!devColNames.includes("aaguid")) {
    await prisma.$executeRawUnsafe("ALTER TABLE DeviceRegistration ADD COLUMN aaguid TEXT;");
  }
  if (!devColNames.includes("lastAuthenticatedAt")) {
    await prisma.$executeRawUnsafe("ALTER TABLE DeviceRegistration ADD COLUMN lastAuthenticatedAt DATETIME;");
  }

  // Create unique index on credentialId
  try {
    await prisma.$executeRawUnsafe("CREATE UNIQUE INDEX IF NOT EXISTS idx_device_credential_id ON DeviceRegistration(credentialId);");
  } catch (e) {}

  // 4. DeviceUnlockRequest Column Migrations
  const unlockCols = await prisma.$queryRawUnsafe("PRAGMA table_info(DeviceUnlockRequest);");
  const unlockColNames = unlockCols.map((c) => c.name);

  if (!unlockColNames.includes("previousAssuranceTier")) {
    await prisma.$executeRawUnsafe("ALTER TABLE DeviceUnlockRequest ADD COLUMN previousAssuranceTier TEXT DEFAULT 'LEGACY_FINGERPRINT';");
  }
  if (!unlockColNames.includes("riskScore")) {
    await prisma.$executeRawUnsafe("ALTER TABLE DeviceUnlockRequest ADD COLUMN riskScore INTEGER DEFAULT 0;");
  }
  if (!unlockColNames.includes("reason")) {
    await prisma.$executeRawUnsafe("ALTER TABLE DeviceUnlockRequest ADD COLUMN reason TEXT;");
  }

  // 5. Create WebAuthnChallenge table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS WebAuthnChallenge (
      id TEXT PRIMARY KEY,
      challenge TEXT UNIQUE NOT NULL,
      userId TEXT,
      purpose TEXT NOT NULL,
      expiresAt DATETIME NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_webauthn_challenge_user ON WebAuthnChallenge(userId, purpose);`);

  // 6. Create AuditOutbox table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS AuditOutbox (
      id TEXT PRIMARY KEY,
      auditLogId TEXT UNIQUE NOT NULL,
      sequenceNumber INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      retryCount INTEGER NOT NULL DEFAULT 0,
      nextAttemptAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      lastError TEXT,
      batchKey TEXT,
      deliveredAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (auditLogId) REFERENCES AuditLog(id) ON DELETE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_audit_outbox_status ON AuditOutbox(status, nextAttemptAt);`);

  // 7. Create Immutable Triggers on AuditLog
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS prevent_audit_log_update
    BEFORE UPDATE ON AuditLog
    BEGIN
      SELECT RAISE(FAIL, 'Audit logs are immutable and append-only');
    END;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS prevent_audit_log_delete
    BEFORE DELETE ON AuditLog
    BEGIN
      SELECT RAISE(FAIL, 'Audit logs are immutable and append-only');
    END;
  `);

  // 8. Create Triggers on AuditOutbox
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS prevent_outbox_delivered_update
    BEFORE UPDATE OF status ON AuditOutbox
    WHEN OLD.status = 'DELIVERED'
    BEGIN
      SELECT RAISE(FAIL, 'Delivered outbox records are immutable');
    END;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER IF NOT EXISTS prevent_outbox_delete
    BEFORE DELETE ON AuditOutbox
    BEGIN
      SELECT RAISE(FAIL, 'Outbox records are immutable and cannot be deleted');
    END;
  `);

  console.log("Migration and triggers successfully applied!");
}

runMigration()
  .catch((e) => {
    console.error("Migration error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
