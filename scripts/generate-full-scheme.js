const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = '/Users/xiaofan/.gemini/antigravity/brain/e9d382a7-99f6-44d0-9e60-e1478f04297d';
const PUBLIC_DIR = path.join(__dirname, '../public');

// Apple HIG / Pro Dark Palette
const C = {
  bg: '#0a0e17',
  cardBg: '#111827',
  cardHeader: '#1e293b',
  cardInner: '#182234',
  border: '#334155',
  borderLight: '#475569',
  borderStrong: '#64748b',
  textMain: '#f8fafc',
  textSub: '#cbd5e1',
  textMuted: '#94a3b8',
  blue: '#38bdf8',
  cyan: '#22d3ee',
  emerald: '#34d399',
  amber: '#fbbf24',
  purple: '#c084fc',
  rose: '#f43f5e',
  orange: '#fb923c',
  indigo: '#818cf8',
  violet: '#a78bfa'
};

function escapeXml(unsafe) {
  return String(unsafe).replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

// -------------------------------------------------------------
// METADATA STORE FOR INTERACTIVE INSPECTOR
// -------------------------------------------------------------
const nodeMetadata = {};

function registerNode(id, meta) {
  nodeMetadata[id] = meta;
}

// -------------------------------------------------------------
// SVG COMPONENT BUILDERS
// -------------------------------------------------------------
function buildModelCard(id, x, y, w, h, modelName, domainTag, accentColor, fields, relations, securityNotes) {
  registerNode(id, {
    type: 'PRISMA_MODEL',
    name: modelName,
    domain: domainTag,
    accentColor,
    fields,
    relations,
    securityNotes
  });

  const r = 8;
  let curY = y + 54;
  let content = '';

  // Render fields
  fields.forEach(f => {
    let tag = '';
    let color = C.textMuted;
    if (f.pk) { tag = '[PK]'; color = C.amber; }
    else if (f.fk) { tag = '[FK]'; color = C.cyan; }
    else if (f.unique) { tag = '[UQ]'; color = C.purple; }
    else { tag = '    '; color = C.textMuted; }

    content += `
      <text x="${x + 14}" y="${curY}" fill="${color}" font-size="10.5" font-family="ui-monospace, SFMono-Regular, monospace" font-weight="700">${tag}</text>
      <text x="${x + 48}" y="${curY}" fill="${C.textMain}" font-size="11.5" font-family="ui-monospace, SFMono-Regular, monospace">${escapeXml(f.name)}</text>
      <text x="${x + w - 14}" y="${curY}" text-anchor="end" fill="${C.textMuted}" font-size="11" font-family="ui-monospace, SFMono-Regular, monospace">${escapeXml(f.type)}</text>
    `;
    curY += 18;
  });

  if (relations && relations.length > 0) {
    content += `<line x1="${x + 12}" y1="${curY - 4}" x2="${x + w - 12}" y2="${curY - 4}" stroke="${C.border}" stroke-dasharray="2,2" stroke-width="1"/>`;
    curY += 12;
    relations.forEach(r => {
      content += `
        <text x="${x + 14}" y="${curY}" fill="${C.textMuted}" font-size="10" font-family="ui-monospace, monospace">REL</text>
        <text x="${x + 48}" y="${curY}" fill="${C.cyan}" font-size="11" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">${escapeXml(r)}</text>
      `;
      curY += 16;
    });
  }

  return `
    <g id="${id}" class="diagram-node model-node" data-id="${id}" style="cursor: pointer;">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${C.cardBg}" stroke="${C.border}" stroke-width="1.5" />
      <path d="M ${x} ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} L ${x + w - r} ${y} A ${r} ${r} 0 0 1 ${x + w} ${y + r} L ${x + w} ${y + 34} L ${x} ${y + 34} Z" fill="${C.cardHeader}" />
      <line x1="${x + r}" y1="${y}" x2="${x + w - r}" y2="${y}" stroke="${accentColor}" stroke-width="3" stroke-linecap="round"/>
      <line x1="${x}" y1="${y + 34}" x2="${x + w}" y2="${y + 34}" stroke="${C.border}" stroke-width="1" />
      
      <text x="${x + 14}" y="${y + 22}" fill="${C.textMain}" font-size="13" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">${escapeXml(modelName)}</text>
      <rect x="${x + w - 84}" y="${y + 8}" width="72" height="18" rx="4" fill="rgba(255,255,255,0.06)" stroke="${accentColor}" stroke-width="0.8"/>
      <text x="${x + w - 48}" y="${y + 21}" text-anchor="middle" fill="${accentColor}" font-size="9.5" font-weight="700" font-family="ui-monospace, monospace">${escapeXml(domainTag)}</text>
      ${content}
    </g>
  `;
}

function buildFlowNode(id, x, y, w, h, title, flowType, accentColor, steps, metadata) {
  registerNode(id, {
    type: 'RUNTIME_FLOW',
    title,
    flowType,
    accentColor,
    steps,
    ...metadata
  });

  const r = 8;
  let curY = y + 54;
  let content = '';

  steps.forEach(st => {
    if (st.type === 'step') {
      content += `
        <rect x="${x + 12}" y="${curY - 12}" width="${w - 24}" height="24" rx="4" fill="${st.bg || C.cardInner}" stroke="${st.stroke || C.border}" stroke-width="1"/>
        <text x="${x + 20}" y="${curY + 4}" fill="${st.color || C.textMain}" font-size="11" font-weight="600" font-family="ui-monospace, monospace">${escapeXml(st.label)}</text>
        <text x="${x + w - 20}" y="${curY + 4}" text-anchor="end" fill="${st.subColor || C.textMuted}" font-size="10.5" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">${escapeXml(st.sub)}</text>
      `;
      curY += 28;
    } else if (st.type === 'condition') {
      content += `
        <rect x="${x + 12}" y="${curY - 12}" width="${w - 24}" height="24" rx="4" fill="${st.bg || 'rgba(244,63,94,0.1)'}" stroke="${st.stroke || C.rose}" stroke-width="1" stroke-dasharray="2,2"/>
        <text x="${x + 20}" y="${curY + 4}" fill="${st.color || C.rose}" font-size="10.5" font-weight="700" font-family="ui-monospace, monospace">${escapeXml(st.label)}</text>
        <text x="${x + w - 20}" y="${curY + 4}" text-anchor="end" fill="${C.textSub}" font-size="10.5" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">${escapeXml(st.sub)}</text>
      `;
      curY += 28;
    } else if (st.type === 'note') {
      content += `
        <text x="${x + 14}" y="${curY}" fill="${st.color || C.textMuted}" font-size="10.5" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-style="italic">${escapeXml(st.text)}</text>
      `;
      curY += 17;
    }
  });

  return `
    <g id="${id}" class="diagram-node flow-node" data-id="${id}" style="cursor: pointer;">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${C.cardBg}" stroke="${C.border}" stroke-width="1.5" />
      <path d="M ${x} ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} L ${x + w - r} ${y} A ${r} ${r} 0 0 1 ${x + w} ${y + r} L ${x + w} ${y + 34} L ${x} ${y + 34} Z" fill="${C.cardHeader}" />
      <line x1="${x + r}" y1="${y}" x2="${x + w - r}" y2="${y}" stroke="${accentColor}" stroke-width="3" stroke-linecap="round"/>
      <line x1="${x}" y1="${y + 34}" x2="${x + w}" y2="${y + 34}" stroke="${C.border}" stroke-width="1" />
      
      <text x="${x + 14}" y="${y + 22}" fill="${C.textMain}" font-size="13" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">${escapeXml(title)}</text>
      <rect x="${x + w - 94}" y="${y + 8}" width="82" height="18" rx="4" fill="rgba(255,255,255,0.06)" stroke="${accentColor}" stroke-width="0.8"/>
      <text x="${x + w - 53}" y="${y + 21}" text-anchor="middle" fill="${accentColor}" font-size="9.5" font-weight="700" font-family="ui-monospace, monospace">${escapeXml(flowType)}</text>
      ${content}
    </g>
  `;
}

function buildConnector(id, x1, y1, x2, y2, color, label, style = {}) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const cx1 = x1 + (x2 > x1 ? dx * 0.45 : -dx * 0.45);
  const cy1 = y1;
  const cx2 = x2 - (x2 > x1 ? dx * 0.45 : -dx * 0.45);
  const cy2 = y2;

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const dash = style.dashed ? 'stroke-dasharray="4,4"' : '';
  const marker = style.noArrow ? '' : `marker-end="url(#arrow-${color.replace(/[^a-zA-Z0-9]/g, '')})"`;

  let labelMarkup = '';
  if (label) {
    const lw = label.length * 6.5 + 14;
    labelMarkup = `
      <g>
        <rect x="${midX - lw/2}" y="${midY - 9}" width="${lw}" height="18" rx="4" fill="${C.cardBg}" stroke="${color}" stroke-width="0.9" />
        <text x="${midX}" y="${midY + 3.5}" text-anchor="middle" fill="${C.textMain}" font-size="9.5" font-family="ui-monospace, monospace" font-weight="600">${escapeXml(label)}</text>
      </g>
    `;
  }

  return `
    <g class="diagram-edge" id="${id}">
      <path d="M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${style.width || 2}" ${dash} ${marker} stroke-opacity="${style.opacity || 0.85}" />
      ${labelMarkup}
    </g>
  `;
}

// -------------------------------------------------------------
// ASSEMBLE FULL SVG
// -------------------------------------------------------------
function generateSvg() {
  const width = 2800;
  const height = 1950;

  let markers = `
    <defs>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" stroke-width="0.5" stroke-opacity="0.6"/>
      </pattern>
  `;

  [C.blue, C.cyan, C.emerald, C.amber, C.purple, C.rose, C.orange, C.indigo, C.violet, C.borderStrong].forEach(col => {
    const cleanId = col.replace(/[^a-zA-Z0-9]/g, '');
    markers += `
      <marker id="arrow-${cleanId}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="${col}" />
      </marker>
    `;
  });
  markers += `</defs>`;

  // Top Title Bar
  const header = `
    <!-- Canvas Background -->
    <rect width="${width}" height="${height}" fill="${C.bg}" />
    <rect width="${width}" height="${height}" fill="url(#grid)" />

    <!-- Top Master Header -->
    <g id="master-header">
      <rect x="40" y="30" width="${width - 80}" height="90" rx="12" fill="${C.cardBg}" stroke="${C.border}" stroke-width="1.5" />
      <line x1="40" y1="30" x2="${width - 40}" y2="30" stroke="${C.cyan}" stroke-width="4" />
      
      <text x="70" y="66" fill="${C.textMain}" font-size="20" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">
        SYSTEM SCHEME &amp; RUNTIME ARCHITECTURE FLOW
      </text>
      <text x="70" y="94" fill="${C.textMuted}" font-size="13" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">
        Zero-Trust Payroll Attendance: 14 Prisma Data Models, WebAuthn Passkeys, Anti-Cheat Dual Geofence (Haversine + WiFi IP), 15s QR Tokens &amp; Ed25519 Audit Chain
      </text>

      <!-- Architecture Badges -->
      <g transform="translate(${width - 860}, 50)">
        <rect x="0" y="0" width="105" height="26" rx="6" fill="rgba(56,189,248,0.1)" stroke="${C.blue}" stroke-width="1"/>
        <text x="52.5" y="17" text-anchor="middle" fill="${C.blue}" font-size="11" font-weight="700" font-family="ui-monospace, monospace">[Next.js 14]</text>

        <rect x="115" y="0" width="115" height="26" rx="6" fill="rgba(34,211,238,0.1)" stroke="${C.cyan}" stroke-width="1"/>
        <text x="172.5" y="17" text-anchor="middle" fill="${C.cyan}" font-size="11" font-weight="700" font-family="ui-monospace, monospace">[Prisma SQLite]</text>

        <rect x="240" y="0" width="125" height="26" rx="6" fill="rgba(52,211,153,0.1)" stroke="${C.emerald}" stroke-width="1"/>
        <text x="302.5" y="17" text-anchor="middle" fill="${C.emerald}" font-size="11" font-weight="700" font-family="ui-monospace, monospace">[WebAuthn/FIDO2]</text>

        <rect x="375" y="0" width="140" height="26" rx="6" fill="rgba(251,191,36,0.1)" stroke="${C.amber}" stroke-width="1"/>
        <text x="445" y="17" text-anchor="middle" fill="${C.amber}" font-size="11" font-weight="700" font-family="ui-monospace, monospace">[Haversine Geofence]</text>

        <rect x="525" y="0" width="130" height="26" rx="6" fill="rgba(244,63,94,0.1)" stroke="${C.rose}" stroke-width="1"/>
        <text x="590" y="17" text-anchor="middle" fill="${C.rose}" font-size="11" font-weight="700" font-family="ui-monospace, monospace">[15s Token Burn]</text>

        <rect x="665" y="0" width="125" height="26" rx="6" fill="rgba(251,146,60,0.1)" stroke="${C.orange}" stroke-width="1"/>
        <text x="727.5" y="17" text-anchor="middle" fill="${C.orange}" font-size="11" font-weight="700" font-family="ui-monospace, monospace">[Ed25519 Audit]</text>
      </g>
    </g>
  `;

  // -------------------------------------------------------------
  // COLUMN HEADERS (Swimlanes)
  // -------------------------------------------------------------
  const columnHeaders = `
    <!-- Column 1 Header -->
    <rect x="40" y="145" width="840" height="36" rx="6" fill="${C.cardHeader}" stroke="${C.border}" stroke-width="1"/>
    <text x="55" y="168" fill="${C.cyan}" font-size="13" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">
      ZONE 1: PRISMA SCHEMA &amp; DATABASE DOMAINS (14 ENTITIES)
    </text>

    <!-- Column 2 Header -->
    <rect x="910" y="145" width="940" height="36" rx="6" fill="${C.cardHeader}" stroke="${C.border}" stroke-width="1"/>
    <text x="925" y="168" fill="${C.emerald}" font-size="13" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">
      ZONE 2: RUNTIME WORKFLOWS &amp; ANTI-CHEAT SECURITY ENCLAVES
    </text>

    <!-- Column 3 Header -->
    <rect x="1880" y="145" width="880" height="36" rx="6" fill="${C.cardHeader}" stroke="${C.border}" stroke-width="1"/>
    <text x="1895" y="168" fill="${C.orange}" font-size="13" font-weight="800" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">
      ZONE 3: PAYROLL FINALIZATION, ZERO-TRUST AUDIT &amp; GOVERNANCE
    </text>
  `;

  // -------------------------------------------------------------
  // ZONE 1: PRISMA DATABASE SCHEMAS (x: 40 - 880)
  // -------------------------------------------------------------
  const col1X = 50;
  const cardW1 = 385;
  const col1X_B = 475;

  let modelsMarkup = '';

  // 1. User
  modelsMarkup += buildModelCard(
    'model-user',
    col1X, 200, cardW1, 230,
    'User', 'AUTH', C.blue,
    [
      { name: 'id', type: 'String (CUID)', pk: true },
      { name: 'email', type: 'String', unique: true },
      { name: 'username', type: 'String', unique: true },
      { name: 'passwordHash', type: 'String (Argon2/bcrypt)' },
      { name: 'role', type: 'String ("OWNER"|"EMPLOYEE")' },
      { name: 'status', type: 'String ("ACTIVE"|"SUSPENDED")' },
      { name: 'createdAt / updatedAt', type: 'DateTime' }
    ],
    ['1:1 EmployeeProfile', '1:1 DeviceRegistration', '1:N Sessions', '1:N AuditLogs'],
    'Primary principal entity. Enforces strict role-based route guards and credential storage.'
  );

  // 2. Session
  modelsMarkup += buildModelCard(
    'model-session',
    col1X_B, 200, cardW1, 150,
    'Session', 'AUTH', C.blue,
    [
      { name: 'id', type: 'String (CUID)', pk: true },
      { name: 'sessionToken', type: 'String (HMAC/UUID)', unique: true },
      { name: 'userId', type: 'String', fk: true },
      { name: 'deviceFingerprint', type: 'String?' },
      { name: 'expiresAt / createdAt', type: 'DateTime' }
    ],
    ['N:1 User'],
    'HTTP-only session cookie store (payroll_auth_token). Preserved during WebAuthn passkey binding.'
  );

  // 3. DeviceRegistration
  modelsMarkup += buildModelCard(
    'model-device-reg',
    col1X, 450, cardW1, 270,
    'DeviceRegistration', 'HARDWARE', C.purple,
    [
      { name: 'id', type: 'String (CUID)', pk: true },
      { name: 'userId', type: 'String', fk: true, unique: true },
      { name: 'credentialId', type: 'String (Base64URL)', unique: true },
      { name: 'credentialPublicKey', type: 'String (COSE Base64URL)' },
      { name: 'counter', type: 'Int (Clone detection)' },
      { name: 'transports', type: 'String? (JSON array)' },
      { name: 'assuranceTier', type: 'String ("HIGH_HARDWARE_BOUND")' },
      { name: 'status', type: 'String ("ACTIVE"|"REVOKED")' },
      { name: 'deviceName / platform', type: 'String (UA-derived)' }
    ],
    ['1:1 User'],
    'Stores WebAuthn FIDO2 public keys. Tied to physical Touch ID/Face ID platform authenticator.'
  );

  // 4. WebAuthnChallenge & DeviceUnlockRequest
  modelsMarkup += buildModelCard(
    'model-webauthn-challenge',
    col1X_B, 370, cardW1, 150,
    'WebAuthnChallenge', 'FIDO2', C.purple,
    [
      { name: 'id', type: 'String (CUID)', pk: true },
      { name: 'challenge', type: 'String (Cryptographic Nonce)', unique: true },
      { name: 'userId', type: 'String?' },
      { name: 'purpose', type: 'String ("REGISTRATION"|"AUTH")' },
      { name: 'expiresAt', type: 'DateTime (5-min TTL)' }
    ],
    ['Transient Nonce Table'],
    'Prevents WebAuthn replay attacks. Strictly single-use with timestamp expiration.'
  );

  modelsMarkup += buildModelCard(
    'model-unlock-request',
    col1X_B, 540, cardW1, 180,
    'DeviceUnlockRequest', 'SEC_OVERRIDE', C.rose,
    [
      { name: 'id', type: 'String (CUID)', pk: true },
      { name: 'requestCode', type: 'String ("REQ-XXXXX")', unique: true },
      { name: 'unlockCode', type: 'String (6-Digit OTP)' },
      { name: 'userId', type: 'String', fk: true },
      { name: 'requestedDeviceName', type: 'String' },
      { name: 'status', type: 'String ("PENDING"|"APPROVED"|"USED")' },
      { name: 'expiresAt', type: 'DateTime (5-min TTL)' }
    ],
    ['N:1 User'],
    'Generated when an employee attempts to log in or scan from an unregistered secondary device.'
  );

  // 5. EmployeeProfile
  modelsMarkup += buildModelCard(
    'model-employee',
    col1X, 740, cardW1, 230,
    'EmployeeProfile', 'WORKFORCE', C.emerald,
    [
      { name: 'id', type: 'String (CUID)', pk: true },
      { name: 'userId', type: 'String', fk: true, unique: true },
      { name: 'employeeId', type: 'String ("EMP-XXX")', unique: true },
      { name: 'fullName', type: 'String' },
      { name: 'dailySalary', type: 'Int (IDR, e.g. 150000)' },
      { name: 'shiftId', type: 'String', fk: true },
      { name: 'employmentStatus', type: 'String ("PERMANENT"|...)' },
      { name: 'joinedAt', type: 'DateTime' }
    ],
    ['1:1 User', 'N:1 Shift', '1:N AttendanceRecord', '1:N SalaryHistory'],
    'Core business employee model. Maintains daily rate and assigned operational work shift.'
  );

  // 6. EmployeeSalaryHistory
  modelsMarkup += buildModelCard(
    'model-salary-hist',
    col1X_B, 740, cardW1, 150,
    'EmployeeSalaryHistory', 'AUDIT_RATE', C.amber,
    [
      { name: 'id', type: 'String (CUID)', pk: true },
      { name: 'employeeId', type: 'String', fk: true },
      { name: 'previousSalary', type: 'Int (IDR)' },
      { name: 'newSalary', type: 'Int (IDR)' },
      { name: 'effectiveDate', type: 'DateTime' },
      { name: 'changedByUserId', type: 'String' }
    ],
    ['N:1 EmployeeProfile'],
    'Tracks base rate modifications so retroactive calculations never corrupt past finalized payrolls.'
  );

  // 7. Shift & DeductionPolicy
  modelsMarkup += buildModelCard(
    'model-shift',
    col1X, 990, cardW1, 230,
    'Shift', 'WORK_SHIFT', C.indigo,
    [
      { name: 'id', type: 'String (CUID)', pk: true },
      { name: 'name', type: 'String ("Morning 08:00-17:00")' },
      { name: 'startTime', type: 'String ("08:00")' },
      { name: 'endTime', type: 'String ("17:00")' },
      { name: 'isOvernight', type: 'Boolean (spans midnight)' },
      { name: 'gracePeriodMinutes', type: 'Int (e.g. 10m)' },
      { name: 'applicableDays', type: 'String ("1,2,3,4,5")' },
      { name: 'deductionPolicyId', type: 'String', fk: true }
    ],
    ['N:1 DeductionPolicy', '1:N EmployeeProfile', '1:N AttendanceRecord'],
    'Defines scheduled hours, overnight flags, and active weekdays for absence (alpa) projections.'
  );

  modelsMarkup += buildModelCard(
    'model-deduction',
    col1X_B, 910, cardW1, 180,
    'DeductionPolicy', 'POLICY', C.indigo,
    [
      { name: 'id', type: 'String (CUID)', pk: true },
      { name: 'name', type: 'String ("Per Minute Standard")' },
      { name: 'mode', type: 'String ("PER_MINUTE"|"PER_HOUR")' },
      { name: 'rate', type: 'Int (e.g. Rp500/min or Rp10k/hr)' },
      { name: 'hourlyRounding', type: 'String ("EXACT"|"ROUND_UP"|...)' },
      { name: 'gracePeriodMinutes', type: 'Int' }
    ],
    ['1:N Shift'],
    'Formula specification for automatic salary deductions on late punch events.'
  );

  // 8. OfficeConfig
  modelsMarkup += buildModelCard(
    'model-office-config',
    col1X_B, 1110, cardW1, 190,
    'OfficeConfig', 'GEOFENCE', C.amber,
    [
      { name: 'id', type: 'String (CUID)', pk: true },
      { name: 'officeName', type: 'String ("Kantor Utama")' },
      { name: 'latitude', type: 'Float (-6.2088)' },
      { name: 'longitude', type: 'Float (106.8456)' },
      { name: 'radiusMeters', type: 'Int (Default: 50m)' },
      { name: 'officePublicIp', type: 'String? (WAN IP)' },
      { name: 'enforceWifiIp', type: 'Boolean' },
      { name: 'maxGpsAccuracy', type: 'Int (Default: 80m)' }
    ],
    ['Global Singleton / Multi-Tenant Store'],
    'Source of truth for GPS Haversine boundaries, ISP WAN verification, and accuracy thresholds.'
  );

  // 9. QRChallenge & QRScanLog
  modelsMarkup += buildModelCard(
    'model-qr-challenge',
    col1X, 1240, cardW1, 170,
    'QRChallenge', 'DYNAMIC_QR', C.rose,
    [
      { name: 'id', type: 'String (CUID)', pk: true },
      { name: 'token', type: 'String (Cryptographic Token)', unique: true },
      { name: 'issuedAt / expiresAt', type: 'DateTime (15s Window)' },
      { name: 'isActive', type: 'Boolean' },
      { name: 'consumedAt', type: 'DateTime?' },
      { name: 'consumedByUserId', type: 'String?' }
    ],
    ['1:N QRScanLog'],
    'Dynamic kiosk token rotating every 15 seconds. Single-use burn prevents proxy photo sharing.'
  );

  modelsMarkup += buildModelCard(
    'model-qr-scanlog',
    col1X_B, 1320, cardW1, 150,
    'QRScanLog', 'AUDIT_SCAN', C.rose,
    [
      { name: 'id', type: 'String (CUID)', pk: true },
      { name: 'challengeId', type: 'String', fk: true },
      { name: 'userId', type: 'String' },
      { name: 'action', type: 'String ("CHECK_IN"|"CHECK_OUT")' },
      { name: 'scannedAt', type: 'DateTime' }
    ],
    ['N:1 QRChallenge', '@@unique([challengeId, userId])'],
    'Enforces token exclusivity. Second scan attempt triggers CHEATING_ALERT_QR_SHARING_REUSE.'
  );

  // 10. AttendanceRecord
  modelsMarkup += buildModelCard(
    'model-attendance',
    col1X, 1430, 810, 240,
    'AttendanceRecord', 'CORE_RECORDS', C.emerald,
    [
      { name: 'id', type: 'String (CUID)', pk: true },
      { name: 'employeeId', type: 'String', fk: true },
      { name: 'shiftId', type: 'String', fk: true },
      { name: 'shiftDate', type: 'String ("YYYY-MM-DD")', unique: true },
      { name: 'checkInTime / checkOutTime', type: 'DateTime' },
      { name: 'scheduledStartTime / scheduledEndTime', type: 'DateTime' },
      { name: 'status', type: 'String ("CHECKED_IN"|"COMPLETED"|"LATE_COMPLETED")' },
      { name: 'lateMinutes', type: 'Int' },
      { name: 'dailySalarySnapshot', type: 'Int (Frozen IDR)' },
      { name: 'deductionPolicySnapshot', type: 'String (Frozen JSON Formula)' },
      { name: 'lateDeduction / netDailyEarnings', type: 'Int (IDR Accrued)' },
      { name: 'checkInLatitude / checkInLongitude / checkInDistanceMeters / checkInClientIp', type: 'GPS & Telemetry' }
    ],
    ['N:1 EmployeeProfile', 'N:1 Shift', '@@unique([employeeId, shiftDate])'],
    'Authoritative daily punch event with immutable wage snapshots and audited GPS/IP verification.'
  );

  // 11. Payroll & Adjustments
  modelsMarkup += buildModelCard(
    'model-payroll-period',
    col1X, 1690, cardW1, 210,
    'PayrollPeriod', 'PAYROLL', C.purple,
    [
      { name: 'id', type: 'String (CUID)', pk: true },
      { name: 'year / month', type: 'Int', unique: true },
      { name: 'startDate / endDate', type: 'DateTime' },
      { name: 'status', type: 'String ("DRAFT"|"FINALIZED")' },
      { name: 'finalizedAt', type: 'DateTime?' },
      { name: 'finalizedByUserId', type: 'String?' }
    ],
    ['1:N PayrollRecord', '1:N PayrollAdjustment'],
    'Period container. Locking to FINALIZED freezes all records against future wage adjustments.'
  );

  modelsMarkup += buildModelCard(
    'model-payroll-record',
    col1X_B, 1690, cardW1, 210,
    'PayrollRecord', 'PAYROLL_SNAPSHOT', C.purple,
    [
      { name: 'id', type: 'String (CUID)', pk: true },
      { name: 'payrollPeriodId', type: 'String', fk: true },
      { name: 'employeeId', type: 'String', fk: true },
      { name: 'completedDays', type: 'Int' },
      { name: 'dailySalary', type: 'Int (Locked Snapshot)' },
      { name: 'lateArrivalCount / totalLateMinutes', type: 'Int' },
      { name: 'totalLateDeductions', type: 'Int (IDR)' },
      { name: 'grossEarnings / netEarnings', type: 'Int (IDR Final Pay)' },
      { name: 'isFinalized', type: 'Boolean' }
    ],
    ['N:1 PayrollPeriod', 'N:1 EmployeeProfile', '@@unique([periodId, employeeId])'],
    'Monthly statement row. Historical pay cannot be rewritten once isFinalized is true.'
  );

  // -------------------------------------------------------------
  // ZONE 2: RUNTIME WORKFLOWS & ANTI-CHEAT ENGINES (x: 910 - 1850)
  // -------------------------------------------------------------
  let flowsMarkup = '';
  const col2X = 925;
  const flowW = 910;

  // Flow A: WebAuthn Hardware Passkey Binding
  flowsMarkup += buildFlowNode(
    'flow-webauthn',
    col2X, 200, flowW, 310,
    'SCHEME A: WEBAUTHN PASSKEY & HARDWARE DEVICE BINDING FLOW',
    'FIDO2_SEC', C.blue,
    [
      { type: 'step', label: '1. /api/auth/webauthn/register-options', sub: 'Server creates challenge nonce with 5-minute TTL & user ID bound', color: C.blue },
      { type: 'step', label: '2. navigator.credentials.create()', sub: 'Invokes Touch ID / Face ID hardware enclave (authenticatorAttachment: "platform")', color: C.blue },
      { type: 'step', label: '3. /api/auth/webauthn/register-verify', sub: 'Verifies clientDataJSON signature & extracts COSE public key bytes', color: C.cyan },
      { type: 'step', label: '4. DeviceRegistration Persistence', sub: 'Saves Base64URL credentialID, deviceName parsed from UA, counter: 0', color: C.emerald },
      { type: 'step', label: '5. Non-Destructive Session Preservation', sub: 'Preserves active session token (payroll_auth_token) avoiding 401 unauth', color: C.emerald },
      { type: 'condition', label: 'UNREGISTERED DEVICE ATTEMPT DETECTED', sub: 'HTTP 403 DEVICE_MISMATCH -> Generates 6-Digit Unlock Code -> Owner Approval Required' },
      { type: 'note', text: 'Hardware-bound private key never leaves the secure enclave; clones rejected via WebAuthn counter validation.' }
    ],
    {
      routes: ['/api/auth/webauthn/register-options', '/api/auth/webauthn/register-verify', '/api/auth/verify-device-unlock'],
      securityGuarantees: 'Zero credential export, immune to phishing, platform Touch ID prioritization without hybrid QR prompts.'
    }
  );

  // Flow B: 15-Second Dynamic QR Token Burn
  flowsMarkup += buildFlowNode(
    'flow-qr-kiosk',
    col2X, 530, flowW, 280,
    'SCHEME B: 15-SECOND DYNAMIC QR KIOSK & SINGLE-USE TOKEN BURN',
    'ANTI_REPLAY', C.rose,
    [
      { type: 'step', label: '1. /api/qr/active (Owner Kiosk Screen)', sub: 'Generates secure cryptographic challenge token; rotates every 15 seconds', color: C.rose },
      { type: 'step', label: '2. Kiosk Countdown Display', sub: 'Client renders SVG QR with synchronized 15-second radial progress timer', color: C.textSub },
      { type: 'step', label: '3. Employee Mobile Scan (/employee/scan)', sub: 'Captures challenge token via camera stream with soft facingMode constraints', color: C.cyan },
      { type: 'step', label: '4. Immediate Token Consumption (Burn)', sub: 'Atomic DB write: isActive = false, consumedAt = now(), consumedBy = employeeId', color: C.emerald },
      { type: 'condition', label: 'REUSE / PHOTO SHARING REJECTED', sub: 'HTTP 400 QR_ALREADY_USED -> Flags CHEATING_ALERT_QR_SHARING_REUSE in Audit Trail' },
      { type: 'condition', label: 'EXPIRED TOKEN REJECTED', sub: 'If scannedAt > expiresAt (TTL + 5s grace) -> HTTP 400 QR_EXPIRED denied' }
    ],
    {
      routes: ['/api/qr/active', '/api/qr/scan', '/api/employee/attendance/scan-verify'],
      antiCheatStrategy: 'Permanently burns QR tokens upon first use to stop photo forwarding via WhatsApp/Telegram.'
    }
  );

  // Flow C: Anti-Cheat Dual Location Verification
  flowsMarkup += buildFlowNode(
    'flow-anti-cheat',
    col2X, 830, flowW, 350,
    'SCHEME C: ANTI-CHEAT DUAL LOCATION VERIFICATION (GEOFENCE + WIFI IP)',
    'LOCATION_SEC', C.amber,
    [
      { type: 'step', label: '1. Client Geolocation & IP Capture', sub: 'Acquires high-accuracy GPS coordinates (lat, lng, accuracy) & WAN IP from request headers', color: C.amber },
      { type: 'step', label: '2. GPS Accuracy Validation Check', sub: 'If gpsAccuracy > OfficeConfig.maxGpsAccuracy (80m) -> HTTP 403 GPS_LOW_ACCURACY', color: C.amber },
      { type: 'step', label: '3. Haversine Distance Calculation', sub: 'Computes spherical distance (d = 2R * asin(sqrt(...))) between scanner & OfficeConfig', color: C.cyan },
      { type: 'condition', label: 'GEOFENCE DISTANCE CHECK', sub: 'If distanceMeters > radiusMeters (50m) -> HTTP 403 GEO_OUT_OF_BOUNDS + Audit Cheating Alert' },
      { type: 'step', label: '4. Office WiFi Public IP Matching (Optional)', sub: 'If enforceWifiIp: compares client WAN IP with OfficeConfig.officePublicIp', color: C.purple },
      { type: 'condition', label: 'WIFI WAN MISMATCH CHECK', sub: 'If clientIp !== officePublicIp -> HTTP 403 WIFI_IP_MISMATCH + Transactional Rollback' },
      { type: 'step', label: '5. Verified Telemetry Persistence', sub: 'Logs checkInLatitude, checkInLongitude, checkInDistanceMeters, checkInClientIp to AttendanceRecord', color: C.emerald }
    ],
    {
      routes: ['src/lib/geo.ts', 'src/lib/attendance-scan-handler.ts'],
      haversineFormula: 'd = 2 * R * asin(sqrt(sin^2(dlat/2) + cos(lat1)*cos(lat2)*sin^2(dlng/2)))',
      accuracyGuarantee: 'Rejects cell-tower spoofing and distant proxies outside 50m radius.'
    }
  );

  // Flow D: Shift Evaluation & Lateness Penalty Engine
  flowsMarkup += buildFlowNode(
    'flow-shift-engine',
    col2X, 1200, flowW, 330,
    'SCHEME D: SHIFT EVALUATION, OVERNIGHT BINDING & LATENESS CALCULATION',
    'CALC_ENGINE', C.indigo,
    [
      { type: 'step', label: '1. Authoritative Shift Date Resolution', sub: 'For overnight shifts (e.g. 22:00 - 06:00), binds check-in and next-day check-out to shiftDate', color: C.indigo },
      { type: 'step', label: '2. Grace Period Application', sub: 'graceDeadline = scheduledStartTime + gracePeriodMinutes (e.g. 08:00 + 10m = 08:10)', color: C.textSub },
      { type: 'condition', label: 'ON-TIME VS LATE DETERMINATION', sub: 'If punchTime <= graceDeadline: lateMinutes = 0, status = "CHECKED_IN", netDaily = dailySalary' },
      { type: 'step', label: '3. Lateness Deduction Formula Evaluation', sub: 'Evaluates DeductionPolicy: PER_MINUTE (lateMinutes * rate) or PER_HOUR (rounded hours * rate)', color: C.rose },
      { type: 'step', label: '4. Max Deduction Salary Cap', sub: 'Deduction is strictly capped at (dailySalary * maxDeductionPercent / 100); netDaily >= 0', color: C.amber },
      { type: 'step', label: '5. Immutable Wage Snapshotting', sub: 'Stores dailySalarySnapshot and deductionPolicySnapshot directly in AttendanceRecord row', color: C.emerald }
    ],
    {
      roundingModes: ['EXACT', 'ROUND_UP', 'ROUND_DOWN', 'ROUND_NEAREST'],
      snapshotGuarantee: 'Historical salary adjustments never alter previously punched attendance records.'
    }
  );

  // Flow E: Owner Analytics & Roster Breakdown
  flowsMarkup += buildFlowNode(
    'flow-owner-analytics',
    col2X, 1550, flowW, 350,
    'SCHEME E: OWNER REAL-TIME ANALYTICS & ATTENDANCE BREAKDOWN (HADIR/TELAT/ALPA)',
    'DATA_VIZ', C.emerald,
    [
      { type: 'step', label: '1. /api/owner/analytics/attendance (GET)', sub: 'Accepts query range: 7d, 14d, 30d, or current_period; verifies OWNER authorization', color: C.emerald },
      { type: 'step', label: '2. Shift Schedule Matching Matrix', sub: 'Checks employeeProfile.joinedAt & shift.applicableDays (0-6) for each calendar day', color: C.textSub },
      { type: 'step', label: '3. Virtual Absence (Alpa) Calculation', sub: 'absentCount = assignedShiftCount - presentCount (no manual alpa entry needed)', color: C.rose },
      { type: 'step', label: '4. Recharts Stacked Visual Trend Graph', sub: 'Renders dynamic Hadir (green), Terlambat (amber), Alpa (rose) bar chart with dark/light themes', color: C.cyan },
      { type: 'step', label: '5. Performance Roster & Detail Modal', sub: 'Lists employee punctuality rates, total late minutes, accrued daily wages, and raw audit logs', color: C.emerald }
    ],
    {
      routes: ['src/app/api/owner/analytics/attendance/route.ts', 'src/components/owner/DashboardAnalytics.tsx', 'src/components/owner/EmployeeAttendanceRoster.tsx'],
      kpiFormula: 'Attendance Rate % = (Present Count / Assigned Shifts) * 100'
    }
  );

  // -------------------------------------------------------------
  // ZONE 3: PAYROLL, CRYPTO AUDIT & GOVERNANCE (x: 1880 - 2760)
  // -------------------------------------------------------------
  let zone3Markup = '';
  const col3X = 1895;
  const col3W = 850;

  // Flow F: Immutable Payroll Finalization
  zone3Markup += buildFlowNode(
    'flow-payroll-locking',
    col3X, 200, col3W, 360,
    'SCHEME F: IMMUTABLE MONTHLY PAYROLL FINALIZATION & SNAPSHOT FREEZE',
    'PAYROLL_LOCK', C.purple,
    [
      { type: 'step', label: '1. Monthly Aggregation Pipeline', sub: 'Queries all finalized AttendanceRecords + approved PayrollAdjustments for billing month', color: C.purple },
      { type: 'step', label: '2. Gross & Net Wage Calculation', sub: 'grossEarnings = completedDays * dailySalary; netEarnings = gross - lateDeductions + adjustments', color: C.cyan },
      { type: 'step', label: '3. Draft State Review (/owner/payroll)', sub: 'Owner inspects breakdowns, adds one-time bonuses or deductions (PayrollAdjustment)', color: C.textSub },
      { type: 'step', label: '4. Atomic Finalization (/api/owner/payroll)', sub: 'Sets PayrollPeriod.status = "FINALIZED", finalizedAt = now(), isFinalized = true', color: C.emerald },
      { type: 'condition', label: 'RETROACTIVE TAMPER PROTECTION', sub: 'Modifying EmployeeProfile.dailySalary afterward NEVER changes finalized PayrollRecord' },
      { type: 'step', label: '5. Signed Audit Trail Event', sub: 'Creates tamper-proof AuditLog: PAYROLL_PERIOD_FINALIZED with cryptographic sequence', color: C.orange }
    ],
    {
      routes: ['src/app/api/owner/payroll/route.ts', 'src/lib/payroll.ts'],
      integrityGuarantee: 'WORM (Write Once, Read Many) invariant ensures legal payroll reproducibility.'
    }
  );

  // Flow G: Ed25519 Cryptographic Hash-Chained Audit Trail
  zone3Markup += buildFlowNode(
    'flow-crypto-audit',
    col3X, 580, col3W, 460,
    'SCHEME G: ZERO-TRUST Ed25519 CRYPTOGRAPHIC AUDIT CHAIN & OUTBOX',
    'TAMPER_PROOF', C.orange,
    [
      { type: 'step', label: '1. Canonical Event Normalization', sub: 'Serializes actor, action, targetEntity, previousValues, newValues via deterministic JSON', color: C.orange },
      { type: 'step', label: '2. Cryptographic Hash Chaining', sub: 'currentHash = SHA-256(canonicalPayload + previousRecord.currentHash)', color: C.orange },
      { type: 'step', label: '3. Asymmetric Ed25519 Signature', sub: 'Signs currentHash using AUDIT_SIGNING_PRIVATE_KEY; verifiable with public key', color: C.cyan },
      { type: 'step', label: '4. Monotonic Sequence Allocation', sub: 'Strict sequenceNumber increment enforced; gaps immediately indicate deleted records', color: C.amber },
      { type: 'condition', label: 'SQLITE IMMUTABILITY TRIGGER', sub: 'prevent_audit_log_update trigger blocks all UPDATE and DELETE queries at DB level' },
      { type: 'step', label: '5. Transactional AuditOutbox Pattern', sub: 'Inserts PENDING outbox item in same ACID transaction for reliable log forwarding', color: C.indigo },
      { type: 'step', label: '6. /api/cron/audit-flush Dispatcher', sub: 'Delivers outbox logs to secondary cold storage; retries with exponential backoff', color: C.emerald }
    ],
    {
      routes: ['src/lib/audit-crypto.ts', 'src/lib/audit-outbox.ts', 'src/lib/audit-verifier.ts'],
      math: 'currentHash = SHA256(canonical(event) || prevHash); Sig = Ed25519Sign(privKey, currentHash)',
      dbTrigger: 'CREATE TRIGGER prevent_audit_log_update BEFORE UPDATE ON AuditLog BEGIN SELECT RAISE(FAIL, ...); END;'
    }
  );

  // Flow H: Instant Owner Device Revocation & Security Controls
  zone3Markup += buildFlowNode(
    'flow-owner-controls',
    col3X, 1060, col3W, 360,
    'SCHEME H: OWNER UNILATERAL DEVICE REVOCATION & REAL-TIME CONTROLS',
    'OWNER_ADMIN', C.rose,
    [
      { type: 'step', label: '1. /owner/devices Management Dashboard', sub: 'Displays all enrolled employee hardware passkeys, device names, and assurance tiers', color: C.rose },
      { type: 'step', label: '2. Unilateral "Revoke Access" Action', sub: 'Owner can immediately disconnect any compromised employee terminal with a single click', color: C.rose },
      { type: 'step', label: '3. Atomic Invalidation Handler', sub: 'Sets DeviceRegistration.isActive = false, status = "REVOKED", purges active Sessions', color: C.amber },
      { type: 'step', label: '4. Immediate Client Session Invalidation', sub: 'Next employee request receives HTTP 401/403, forcing device re-registration', color: C.textSub },
      { type: 'step', label: '5. Owner Dynamic Geofence Configuration', sub: 'Interactive map / input on /owner/settings updates OfficeConfig coordinates & WiFi IP', color: C.cyan }
    ],
    {
      routes: ['/api/owner/devices/revoke', '/api/owner/devices', '/api/owner/office-config'],
      securityCapability: 'Zero downtime credential kill-switch for lost phones, terminated staff, or detected spoofing.'
    }
  );

  // -------------------------------------------------------------
  // CROSS-DOMAIN CONNECTIONS (Bezier Edges)
  // -------------------------------------------------------------
  let edgesMarkup = '';

  // 1. User -> Session
  edgesMarkup += buildConnector('edge-user-session', col1X + cardW1, 280, col1X_B, 270, C.blue, 'issues cookie');
  // 2. User -> DeviceRegistration
  edgesMarkup += buildConnector('edge-user-devreg', col1X + cardW1/2, 430, col1X + cardW1/2, 450, C.purple, 'binds passkey');
  // 3. User -> EmployeeProfile
  edgesMarkup += buildConnector('edge-user-emp', col1X + cardW1/2, 720, col1X + cardW1/2, 740, C.emerald, '1:1 profile');
  // 4. DeviceRegistration -> Flow A (WebAuthn Flow)
  edgesMarkup += buildConnector('edge-devreg-flowA', col1X + cardW1, 560, col2X, 360, C.blue, 'credentials verified');
  // 5. Flow B (QR Kiosk) -> QRChallenge
  edgesMarkup += buildConnector('edge-flowB-qrchal', col2X, 680, col1X + cardW1, 1310, C.rose, 'consumes token');
  // 6. OfficeConfig -> Flow C (Anti-Cheat)
  edgesMarkup += buildConnector('edge-office-flowC', col1X_B + cardW1, 1200, col2X, 980, C.amber, 'geofence bounds');
  // 7. Flow C (Anti-Cheat) -> AttendanceRecord
  edgesMarkup += buildConnector('edge-flowC-attend', col2X, 1080, col1X + 810, 1500, C.emerald, 'verified coordinates');
  // 8. Shift -> AttendanceRecord
  edgesMarkup += buildConnector('edge-shift-attend', col1X + cardW1/2, 1220, col1X + cardW1/2, 1430, C.indigo, 'bounds shift hours');
  // 9. AttendanceRecord -> Flow E (Owner Analytics)
  edgesMarkup += buildConnector('edge-attend-analytics', col1X + 810, 1560, col2X, 1680, C.emerald, 'aggregates roster');
  // 10. AttendanceRecord -> Flow F (Payroll Locking)
  edgesMarkup += buildConnector('edge-attend-payroll', col1X + 810, 1620, col3X, 350, C.purple, 'locks net pay');
  // 11. All DB Changes -> Flow G (Cryptographic Audit)
  edgesMarkup += buildConnector('edge-all-audit', col2X + flowW, 950, col3X, 780, C.orange, 'SHA256 chained');

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" class="flow-svg">
      ${markers}
      ${header}
      ${columnHeaders}
      <g id="zone-1-models">
        ${modelsMarkup}
      </g>
      <g id="zone-2-flows">
        ${flowsMarkup}
      </g>
      <g id="zone-3-governance">
        ${zone3Markup}
      </g>
      <g id="connectors">
        ${edgesMarkup}
      </g>
    </svg>
  `;
}

// -------------------------------------------------------------
// BUILD INTERACTIVE HTML VISUALIZER (generative_ui compatible)
// -------------------------------------------------------------
function generateInteractiveHtml(svgContent) {
  const metadataJson = JSON.stringify(nodeMetadata);

  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payroll & QR Attendance - System Scheme & Architecture Visualizer</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --border: #334155;
    }
    body {
      background-color: var(--bg);
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      overflow: hidden;
      margin: 0;
      padding: 0;
      height: 100vh;
      width: 100vw;
    }
    .flow-svg {
      transform-origin: 0 0;
      cursor: grab;
      user-select: none;
    }
    .flow-svg:active {
      cursor: grabbing;
    }
    .diagram-node {
      transition: transform 0.15s ease, filter 0.15s ease;
    }
    .diagram-node:hover rect:first-child {
      stroke: #38bdf8 !important;
      stroke-width: 2.5px !important;
      filter: drop-shadow(0 4px 12px rgba(56, 189, 248, 0.25));
    }
    .diagram-edge:hover path {
      stroke-width: 3.5px !important;
      stroke-opacity: 1 !important;
      filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.6));
    }
    /* Custom Scrollbar */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: #0f172a;
    }
    ::-webkit-scrollbar-thumb {
      background: #334155;
      border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #475569;
    }
  </style>
</head>
<body class="flex flex-col bg-[#090d16] text-neutral-100 antialiased select-none">

  <!-- Top Control Bar -->
  <header class="h-14 bg-[#0f172a] border-b border-[#334155] px-4 flex items-center justify-between shrink-0 z-20">
    <div class="flex items-center space-x-3">
      <div class="w-3 h-3 rounded-full bg-cyan-400"></div>
      <h1 class="font-bold text-sm tracking-wide text-white">
        PAYROLL ATTENDANCE SCHEME FLOW INSPECTOR
      </h1>
      <span class="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
        14 PRISMA MODELS &bull; 8 RUNTIME SCHEMES
      </span>
    </div>

    <!-- Filter Buttons -->
    <div class="flex items-center space-x-1.5 text-xs">
      <button onclick="filterZone('all')" id="btn-all" class="px-2.5 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-white font-medium border border-neutral-700">All Schemes</button>
      <button onclick="filterZone('zone-1-models')" id="btn-zone-1" class="px-2.5 py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-medium border border-neutral-800">1. Data Models (ERD)</button>
      <button onclick="filterZone('zone-2-flows')" id="btn-zone-2" class="px-2.5 py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-medium border border-neutral-800">2. Attendance &amp; Anti-Cheat</button>
      <button onclick="filterZone('zone-3-governance')" id="btn-zone-3" class="px-2.5 py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-medium border border-neutral-800">3. Payroll &amp; Audit Chain</button>
    </div>

    <!-- Zoom & Actions -->
    <div class="flex items-center space-x-2 text-xs">
      <div class="flex items-center bg-[#1e293b] rounded border border-[#334155] px-1">
        <button onclick="zoomOut()" class="px-2 py-1 hover:text-cyan-400 font-bold" title="Zoom Out">-</button>
        <span id="zoom-indicator" class="px-2 font-mono text-[11px] text-neutral-300 min-w-[50px] text-center">60%</span>
        <button onclick="zoomIn()" class="px-2 py-1 hover:text-cyan-400 font-bold" title="Zoom In">+</button>
        <button onclick="resetZoom()" class="px-2 py-1 hover:text-cyan-400 font-mono text-[10px] border-l border-[#334155]" title="Reset View">RESET</button>
      </div>
      <a href="/scheme-architecture-flow.svg" download="scheme-architecture-flow.svg" class="px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium flex items-center space-x-1">
        <span>Download SVG</span>
      </a>
    </div>
  </header>

  <!-- Main Viewport + Side Inspector -->
  <div class="flex flex-1 relative overflow-hidden">
    
    <!-- SVG Canvas Area -->
    <div id="viewport-container" class="flex-1 h-full w-full relative overflow-hidden bg-[#090d16]">
      <div id="svg-transform-layer" style="transform: matrix(0.6, 0, 0, 0.6, 20, 20); transform-origin: 0 0;">
        ${svgContent}
      </div>
    </div>

    <!-- Side Inspector Drawer -->
    <div id="inspector-drawer" class="w-96 bg-[#0f172a] border-l border-[#334155] h-full flex flex-col shrink-0 transform transition-transform duration-200 z-10 shadow-2xl">
      <div class="p-4 border-b border-[#334155] flex items-center justify-between bg-[#1e293b]">
        <div class="flex items-center space-x-2">
          <span id="inspect-badge" class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-900 text-cyan-300 border border-cyan-700">ENTITY</span>
          <h2 id="inspect-title" class="font-bold text-sm text-white truncate max-w-[200px]">AttendanceRecord</h2>
        </div>
        <button onclick="closeInspector()" class="text-neutral-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-neutral-800">Close</button>
      </div>

      <div id="inspect-content" class="p-4 overflow-y-auto flex-1 space-y-4 text-xs">
        <p class="text-neutral-400">Click any entity model, verification gate, or workflow card in the diagram to inspect its schema fields, database constraints, API endpoints, and zero-trust security guarantees.</p>
      </div>
    </div>

  </div>

  <script>
    const nodeMeta = ${metadataJson};

    // Viewport Pan and Zoom
    let scale = 0.58;
    let panX = 30;
    let panY = 20;
    let isPanning = false;
    let startX = 0;
    let startY = 0;

    const layer = document.getElementById('svg-transform-layer');
    const container = document.getElementById('viewport-container');
    const zoomIndicator = document.getElementById('zoom-indicator');

    function updateTransform() {
      layer.style.transform = \`matrix(\${scale}, 0, 0, \${scale}, \${panX}, \${panY})\`;
      zoomIndicator.textContent = Math.round(scale * 100) + '%';
    }

    function zoomIn() {
      scale = Math.min(scale * 1.25, 2.5);
      updateTransform();
    }

    function zoomOut() {
      scale = Math.max(scale / 1.25, 0.25);
      updateTransform();
    }

    function resetZoom() {
      scale = 0.58;
      panX = 30;
      panY = 20;
      updateTransform();
    }

    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.max(0.25, Math.min(scale * zoomFactor, 2.5));
      
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      panX = mouseX - (mouseX - panX) * (newScale / scale);
      panY = mouseY - (mouseY - panY) * (newScale / scale);
      scale = newScale;
      updateTransform();
    }, { passive: false });

    container.addEventListener('mousedown', (e) => {
      if (e.target.closest('#inspector-drawer')) return;
      isPanning = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      layer.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isPanning) return;
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      updateTransform();
    });

    window.addEventListener('mouseup', () => {
      isPanning = false;
      layer.style.cursor = 'grab';
    });

    // Inspector Node Selection
    document.querySelectorAll('.diagram-node').forEach(node => {
      node.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = node.getAttribute('data-id');
        openInspector(id);
      });
    });

    function openInspector(id) {
      const data = nodeMeta[id];
      if (!data) return;

      const titleEl = document.getElementById('inspect-title');
      const badgeEl = document.getElementById('inspect-badge');
      const contentEl = document.getElementById('inspect-content');

      titleEl.textContent = data.name || data.title || id;
      badgeEl.textContent = data.type === 'PRISMA_MODEL' ? 'PRISMA MODEL' : 'RUNTIME SCHEME';
      badgeEl.style.borderColor = data.accentColor;
      badgeEl.style.color = data.accentColor;

      let html = '';

      if (data.type === 'PRISMA_MODEL') {
        html += \`
          <div class="bg-[#182234] p-3 rounded border border-[#334155]">
            <span class="text-neutral-400 font-semibold uppercase text-[10px]">Domain:</span>
            <div class="text-sm font-bold text-white mt-0.5">\${data.domain}</div>
            <div class="text-[11px] text-neutral-300 mt-1">\${data.securityNotes || ''}</div>
          </div>

          <div>
            <h3 class="font-bold text-neutral-300 uppercase text-[11px] mb-2">Schema Fields (\${data.fields.length}):</h3>
            <div class="space-y-1.5 font-mono text-[11px] bg-[#111827] p-2.5 rounded border border-[#334155] max-h-60 overflow-y-auto">
        \`;

        data.fields.forEach(f => {
          let badge = '';
          if (f.pk) badge = '<span class="text-amber-400 font-bold">[PK]</span>';
          else if (f.fk) badge = '<span class="text-cyan-400 font-bold">[FK]</span>';
          else if (f.unique) badge = '<span class="text-purple-400 font-bold">[UQ]</span>';
          else badge = '<span class="text-neutral-500">    </span>';

          html += \`
            <div class="flex justify-between items-center py-0.5 border-b border-neutral-800">
              <div>\${badge} <span class="text-neutral-200">\${f.name}</span></div>
              <div class="text-neutral-400">\${f.type}</div>
            </div>
          \`;
        });

        html += \`</div></div>\`;

        if (data.relations && data.relations.length > 0) {
          html += \`
            <div>
              <h3 class="font-bold text-neutral-300 uppercase text-[11px] mb-2">Model Relations:</h3>
              <ul class="list-disc pl-4 space-y-1 text-cyan-300">
                \${data.relations.map(r => \`<li>\${r}</li>\`).join('')}
              </ul>
            </div>
          \`;
        }

      } else {
        html += \`
          <div class="bg-[#182234] p-3 rounded border border-[#334155]">
            <span class="text-neutral-400 font-semibold uppercase text-[10px]">Scheme Category:</span>
            <div class="text-sm font-bold text-white mt-0.5">\${data.flowType}</div>
          </div>

          <div>
            <h3 class="font-bold text-neutral-300 uppercase text-[11px] mb-2">Execution Pipeline:</h3>
            <div class="space-y-2">
        \`;

        data.steps.forEach((st, idx) => {
          const bg = st.type === 'condition' ? 'bg-rose-950/40 border-rose-800' : 'bg-[#111827] border-[#334155]';
          const titleColor = st.type === 'condition' ? 'text-rose-400' : 'text-neutral-200';
          html += \`
            <div class="p-2.5 rounded border \${bg}">
              <div class="font-mono font-bold \${titleColor} text-[11px]">\${st.label}</div>
              <div class="text-neutral-400 text-[11px] mt-1">\${st.sub || ''}</div>
            </div>
          \`;
        });

        html += \`</div></div>\`;

        if (data.routes) {
          html += \`
            <div>
              <h3 class="font-bold text-neutral-300 uppercase text-[11px] mb-2">Associated Handlers &amp; Source Files:</h3>
              <div class="space-y-1 font-mono text-[10.5px]">
                \${data.routes.map(rt => \`<div class="p-1.5 rounded bg-neutral-900 text-cyan-400 border border-neutral-800 truncate">\${rt}</div>\`).join('')}
              </div>
            </div>
          \`;
        }
      }

      contentEl.innerHTML = html;
      document.getElementById('inspector-drawer').style.transform = 'translateX(0)';
    }

    function closeInspector() {
      document.getElementById('inspector-drawer').style.transform = 'translateX(100%)';
    }

    // Zone Filtering
    function filterZone(zoneId) {
      const z1 = document.getElementById('zone-1-models');
      const z2 = document.getElementById('zone-2-flows');
      const z3 = document.getElementById('zone-3-governance');
      const conn = document.getElementById('connectors');

      [z1, z2, z3, conn].forEach(el => el.style.opacity = '1');

      if (zoneId === 'zone-1-models') {
        z1.style.opacity = '1';
        z2.style.opacity = '0.15';
        z3.style.opacity = '0.15';
        conn.style.opacity = '0.2';
        panX = 30; panY = 20; scale = 0.65;
      } else if (zoneId === 'zone-2-flows') {
        z1.style.opacity = '0.15';
        z2.style.opacity = '1';
        z3.style.opacity = '0.15';
        conn.style.opacity = '0.2';
        panX = -500; panY = 20; scale = 0.65;
      } else if (zoneId === 'zone-3-governance') {
        z1.style.opacity = '0.15';
        z2.style.opacity = '0.15';
        z3.style.opacity = '1';
        conn.style.opacity = '0.2';
        panX = -1100; panY = 20; scale = 0.65;
      } else {
        panX = 30; panY = 20; scale = 0.58;
      }
      updateTransform();
    }
  </script>
</body>
</html>
`;
}

// -------------------------------------------------------------
// MAIN EXECUTION
// -------------------------------------------------------------
function run() {
  console.log("Generating SVG flow and scheme recap...");
  const svgContent = generateSvg();

  // 1. Write Standalone SVG to Artifact Directory
  const svgArtifactPath = path.join(ARTIFACT_DIR, 'scheme-architecture-flow.svg');
  fs.writeFileSync(svgArtifactPath, svgContent, 'utf8');
  console.log("Written:", svgArtifactPath);

  // 2. Write SVG to Public Directory for direct web serving
  const publicSvgPath = path.join(PUBLIC_DIR, 'scheme-architecture-flow.svg');
  fs.writeFileSync(publicSvgPath, svgContent, 'utf8');
  console.log("Written:", publicSvgPath);

  // 3. Write Interactive HTML Visualizer to Artifact Directory
  const htmlArtifactPath = path.join(ARTIFACT_DIR, 'scheme-architecture-visualizer.html');
  const htmlContent = generateInteractiveHtml(svgContent);
  fs.writeFileSync(htmlArtifactPath, htmlContent, 'utf8');
  console.log("Written:", htmlArtifactPath);

  // 4. Also copy HTML to public directory for direct browser viewing
  const publicHtmlPath = path.join(PUBLIC_DIR, 'scheme-architecture-visualizer.html');
  fs.writeFileSync(publicHtmlPath, htmlContent, 'utf8');
  console.log("Written:", publicHtmlPath);

  console.log("SVG Flow & Interactive Scheme visualizer generated successfully!");
}

run();
