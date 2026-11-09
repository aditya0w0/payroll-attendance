-- ==============================================================================
-- PostgreSQL Append-Only & Immutability Triggers (Production Vercel / Neon / Supabase)
-- ==============================================================================

-- 1. AuditLog Immutability Trigger
CREATE OR REPLACE FUNCTION enforce_audit_log_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable and append-only. UPDATE and DELETE operations are forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON "AuditLog";
CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION enforce_audit_log_immutable();

-- 2. AuditOutbox Immutability Trigger
CREATE OR REPLACE FUNCTION enforce_audit_outbox_immutable()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Audit outbox records are durable and cannot be deleted.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- If already DELIVERED, forbid any further updates
    IF OLD.status = 'DELIVERED' THEN
      RAISE EXCEPTION 'Delivered audit outbox records are permanently immutable.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_outbox_immutable ON "AuditOutbox";
CREATE TRIGGER trg_audit_outbox_immutable
BEFORE UPDATE OR DELETE ON "AuditOutbox"
FOR EACH ROW
EXECUTE FUNCTION enforce_audit_outbox_immutable();
