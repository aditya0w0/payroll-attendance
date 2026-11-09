const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = '/Users/xiaofan/.gemini/antigravity/brain/e9d382a7-99f6-44d0-9e60-e1478f04297d';
const PUBLIC_DIR = path.join(__dirname, '../public');

// Colors following Apple HIG / GitHub Dark High Contrast
const C = {
  bg: '#090d16',
  canvas: '#0f172a',
  panelBg: '#1e293b',
  cardBg: '#111827',
  cardSubBg: '#1f2937',
  border: '#334155',
  borderLight: '#475569',
  borderHighlight: '#64748b',
  textMain: '#f8fafc',
  textMuted: '#94a3b8',
  textSub: '#cbd5e1',
  blue: '#38bdf8',
  blueBg: 'rgba(56, 189, 248, 0.12)',
  green: '#34d399',
  greenBg: 'rgba(52, 211, 153, 0.12)',
  amber: '#fbbf24',
  amberBg: 'rgba(251, 191, 36, 0.12)',
  rose: '#f43f5e',
  roseBg: 'rgba(244, 63, 94, 0.12)',
  purple: '#c084fc',
  purpleBg: 'rgba(192, 132, 252, 0.12)',
  cyan: '#22d3ee',
  cyanBg: 'rgba(34, 211, 238, 0.12)',
  orange: '#fb923c',
  orangeBg: 'rgba(251, 146, 60, 0.12)'
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

function card(x, y, w, h, title, category, accentColor, lines, options = {}) {
  const cornerRadius = options.r || 10;
  const headerBg = options.headerBg || C.cardSubBg;
  const idAttr = options.id ? `id="${options.id}" class="flow-card" data-category="${category}" style="cursor: pointer;"` : '';
  
  let contentSvg = '';
  let curY = y + 54;
  
  lines.forEach(line => {
    if (typeof line === 'string') {
      contentSvg += `<text x="${x + 16}" y="${curY}" fill="${C.textSub}" font-size="12" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">${escapeXml(line)}</text>\n`;
      curY += 18;
    } else if (line.type === 'field') {
      const typeColor = line.isPk ? C.amber : (line.isFk ? C.cyan : (line.isUnique ? C.purple : C.textMuted));
      const badge = line.isPk ? '[PK]' : (line.isFk ? '[FK]' : (line.isUnique ? '[UQ]' : '    '));
      contentSvg += `
        <text x="${x + 16}" y="${curY}" fill="${typeColor}" font-size="11" font-family="ui-monospace, monospace" font-weight="600">${badge}</text>
        <text x="${x + 52}" y="${curY}" fill="${C.textMain}" font-size="12" font-family="ui-monospace, monospace" font-weight="500">${escapeXml(line.name)}</text>
        <text x="${x + w - 16}" y="${curY}" text-anchor="end" fill="${C.textMuted}" font-size="11" font-family="ui-monospace, monospace">${escapeXml(line.typeStr)}</text>
      `;
      curY += 19;
    } else if (line.type === 'divider') {
      contentSvg += `<line x1="${x + 12}" y1="${curY - 6}" x2="${x + w - 12}" y2="${curY - 6}" stroke="${C.border}" stroke-width="1" stroke-dasharray="3,3" />\n`;
      curY += 8;
    } else if (line.type === 'step') {
      contentSvg += `
        <rect x="${x + 14}" y="${curY - 12}" width="${w - 28}" height="24" rx="4" fill="${line.bg || 'rgba(255,255,255,0.03)'}" stroke="${line.border || C.border}" stroke-width="1"/>
        <text x="${x + 22}" y="${curY + 4}" fill="${line.color || C.textMain}" font-size="11" font-weight="600" font-family="ui-monospace, monospace">${escapeXml(line.label)}</text>
        <text x="${x + w - 22}" y="${curY + 4}" text-anchor="end" fill="${line.subColor || C.textMuted}" font-size="11" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">${escapeXml(line.sub || '')}</text>
      `;
      curY += 28;
    } else if (line.type === 'note') {
      contentSvg += `<text x="${x + 16}" y="${curY}" fill="${line.color || C.textMuted}" font-size="11" font-style="italic" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">${escapeXml(line.text)}</text>\n`;
      curY += 16;
    }
  });

  return `
  <g ${idAttr}>
    <!-- Base Card Shadow & Background -->
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${cornerRadius}" fill="${C.cardBg}" stroke="${options.stroke || C.border}" stroke-width="${options.strokeWidth || 1.5}" />
    <!-- Header Surface -->
    <path d="M ${x} ${y + cornerRadius} A ${cornerRadius} ${cornerRadius} 0 0 1 ${x + cornerRadius} ${y} L ${x + w - cornerRadius} ${y} A ${cornerRadius} ${cornerRadius} 0 0 1 ${x + w} ${y + cornerRadius} L ${x + w} ${y + 36} L ${x} ${y + 36} Z" fill="${headerBg}" />
    <!-- Top Accent Bar -->
    <path d="M ${x + cornerRadius} ${y} L ${x + w - cornerRadius} ${y}" stroke="${accentColor}" stroke-width="3" stroke-linecap="round" />
    <line x1="${x}" y1="${y + 36}" x2="${x + w}" y2="${y + 36}" stroke="${C.border}" stroke-width="1" />
    
    <!-- Title and Category Badge -->
    <text x="${x + 14}" y="${y + 23}" fill="${C.textMain}" font-size="13" font-weight="700" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif">${escapeXml(title)}</text>
    <rect x="${x + w - 90}" y="${y + 9}" width="78" height="18" rx="4" fill="${options.badgeBg || 'rgba(255,255,255,0.08)'}" stroke="${accentColor}" stroke-width="0.8"/>
    <text x="${x + w - 51}" y="${y + 22}" text-anchor="middle" fill="${accentColor}" font-size="10" font-weight="700" font-family="ui-monospace, monospace">${escapeXml(category)}</text>
    
    <!-- Body Content -->
    ${contentSvg}
  </g>
  `;
}

function connection(id, x1, y1, x2, y2, color, label, style = {}) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const cx1 = x1 + (x2 > x1 ? dx * 0.45 : -dx * 0.45);
  const cy1 = y1;
  const cx2 = x2 - (x2 > x1 ? dx * 0.45 : -dx * 0.45);
  const cy2 = y2;
  
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  
  const dash = style.dashed ? 'stroke-dasharray="5,4"' : '';
  const marker = style.noArrow ? '' : `marker-end="url(#arrow-${color.replace(/[^a-zA-Z0-9]/g, '')})"`;

  let labelSvg = '';
  if (label) {
    const lw = label.length * 6.8 + 14;
    labelSvg = `
      <g>
        <rect x="${midX - lw/2}" y="${midY - 10}" width="${lw}" height="20" rx="4" fill="${C.cardBg}" stroke="${color}" stroke-width="1" />
        <text x="${midX}" y="${midY + 4}" text-anchor="middle" fill="${C.textMain}" font-size="10" font-family="ui-monospace, monospace" font-weight="600">${escapeXml(label)}</text>
      </g>
    `;
  }

  return `
    <g class="flow-connection" id="${id}">
      <path d="M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${style.width || 2}" ${dash} ${marker} stroke-opacity="${style.opacity || 0.85}" />
      ${labelSvg}
    </g>
  `;
}

console.log("Helper functions defined successfully.");
