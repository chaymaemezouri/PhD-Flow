const win: Record<string, string> = {
  é: '\\351',
  è: '\\350',
  ê: '\\352',
  ë: '\\353',
  à: '\\340',
  â: '\\342',
  ù: '\\371',
  û: '\\373',
  ô: '\\364',
  î: '\\356',
  ï: '\\357',
  ç: '\\347',
  É: '\\311',
  È: '\\310',
  Ê: '\\312',
  À: '\\300',
  Â: '\\302',
  Ô: '\\324',
  Ù: '\\331',
  Ç: '\\307',
  '’': "'",
  '‘': "'",
  '“': '"',
  '”': '"',
  '—': '-',
  '–': '-',
  '…': '...',
};

export interface CertificatePdfInput {
  kind: 'certificate' | 'receipt' | 'attestation';
  brand?: string;
  conferenceName: string;
  conferencePlace?: string;
  conferenceDates?: string;
  paperTitle: string;
  publicId: string;
  authors: string;
  doi?: string;
  issuedOn: string;
  statusLine?: string;
}

function pdfText(value: string): string {
  let out = '';
  for (const char of value) {
    if (win[char]) {
      out += win[char];
      continue;
    }
    if (char === '\\' || char === '(' || char === ')') {
      out += `\\${char}`;
      continue;
    }
    out += char.charCodeAt(0) < 128 ? char : '?';
  }
  return out;
}

function wrap(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [''];
  }
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function titleFor(kind: CertificatePdfInput['kind']): string {
  if (kind === 'certificate') {
    return 'Certificat d\'acceptation';
  }
  if (kind === 'receipt') {
    return 'Recu de paiement';
  }
  return 'Attestation d\'acceptation pour publication';
}

function subtitleFor(kind: CertificatePdfInput['kind']): string {
  if (kind === 'certificate') {
    return 'Document officiel de la conference';
  }
  if (kind === 'receipt') {
    return 'Confirmation d\'inscription et de paiement';
  }
  return 'Document final apres publication';
}

/**
 * Hand-rolled A4 PDF (no extra dependency). Layout: brand bar, title block,
 * paper meta, optional DOI, signature footer.
 */
export function certificatePdf(input: CertificatePdfInput): Buffer {
  const brand = input.brand ?? 'PapersManagement';
  const pageW = 595;
  const pageH = 842;
  const margin = 48;
  const contentW = pageW - margin * 2;

  const ops: string[] = [];

  const rect = (x: number, y: number, w: number, h: number, fill: string) => {
    ops.push(`${fill} rg ${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`);
  };

  // Soft page wash
  rect(0, 0, pageW, pageH, '0.97 0.98 0.99');
  // Top brand bar
  rect(0, pageH - 56, pageW, 56, '0.24 0.31 0.83');
  // Accent strip under bar
  rect(0, pageH - 60, pageW, 4, '0.12 0.60 0.34');
  // Left decorative rule
  rect(margin, 120, 3, 520, '0.24 0.31 0.83');
  // Bottom footer band
  rect(0, 0, pageW, 56, '0.24 0.31 0.83');

  // White content card
  ops.push('1 1 1 rg');
  ops.push(
    `${margin + 18} 110 ${contentW - 18} 620 re f`,
  );
  // Card border
  ops.push('0.89 0.90 0.93 RG 1.2 w');
  ops.push(`${margin + 18} 110 ${contentW - 18} 620 re S`);

  const text = (
    font: 'F1' | 'F2',
    size: number,
    x: number,
    y: number,
    value: string,
    r = 0.11,
    g = 0.15,
    b = 0.27,
  ) => {
    ops.push('BT');
    ops.push(`${r} ${g} ${b} rg`);
    ops.push(`/${font} ${size} Tf`);
    ops.push(`${x.toFixed(1)} ${y.toFixed(1)} Td`);
    ops.push(`(${pdfText(value)}) Tj`);
    ops.push('ET');
  };

  // Brand in header
  text('F2', 14, margin, pageH - 34, brand, 1, 1, 1);
  text('F1', 9, pageW - margin - 150, pageH - 32, 'Gestion scientifique', 0.85, 0.88, 1);

  // Document title
  let y = 680;
  text('F1', 9, margin + 36, y, subtitleFor(input.kind).toUpperCase(), 0.55, 0.58, 0.65);
  y -= 22;
  for (const line of wrap(titleFor(input.kind), 42)) {
    text('F2', 18, margin + 36, y, line, 0.11, 0.15, 0.27);
    y -= 22;
  }

  // Conference block
  y -= 10;
  rect(margin + 36, y - 52, contentW - 54, 62, '0.95 0.96 1');
  text('F1', 8, margin + 48, y - 8, 'CONFERENCE', 0.55, 0.58, 0.65);
  y -= 24;
  for (const line of wrap(input.conferenceName, 48)) {
    text('F2', 12, margin + 48, y, line, 0.24, 0.31, 0.83);
    y -= 16;
  }
  const placeLine = [input.conferencePlace, input.conferenceDates]
    .filter(Boolean)
    .join('  ·  ');
  if (placeLine) {
    text('F1', 9, margin + 48, y, placeLine, 0.36, 0.39, 0.47);
    y -= 14;
  }
  y -= 28;

  // Paper meta
  const fields: { label: string; value: string }[] = [
    { label: 'Identifiant', value: input.publicId },
    { label: 'Titre', value: input.paperTitle },
    { label: 'Auteurs', value: input.authors || '—' },
  ];
  if (input.doi) {
    fields.push({ label: 'DOI', value: input.doi });
  }
  if (input.statusLine) {
    fields.push({ label: 'Statut', value: input.statusLine });
  }
  fields.push({ label: 'Delivre le', value: input.issuedOn });

  for (const field of fields) {
    text('F1', 8, margin + 36, y, field.label.toUpperCase(), 0.55, 0.58, 0.65);
    y -= 14;
    const lines = wrap(field.value, 62);
    for (const line of lines) {
      text('F2', 11, margin + 36, y, line, 0.11, 0.15, 0.27);
      y -= 15;
    }
    y -= 10;
    // Divider
    ops.push('0.90 0.91 0.94 RG 0.6 w');
    ops.push(`${margin + 36} ${y + 6} m ${margin + contentW - 18} ${y + 6} l S`);
    y -= 8;
  }

  // Signature block
  y = Math.min(y, 220);
  text('F1', 8, margin + 36, y, 'VALIDATION', 0.55, 0.58, 0.65);
  y -= 18;
  text('F1', 10, margin + 36, y, 'PapersManagement — plateforme de conference', 0.36, 0.39, 0.47);
  y -= 28;
  ops.push('0.24 0.31 0.83 RG 1.2 w');
  ops.push(`${margin + 36} ${y} m ${margin + 220} ${y} l S`);
  y -= 14;
  text('F1', 9, margin + 36, y, 'Signature electronique du systeme', 0.36, 0.39, 0.47);

  // Footer
  text('F1', 8, margin, 24, brand, 1, 1, 1);
  text('F1', 8, pageW - margin - 120, 24, input.publicId, 0.85, 0.88, 1);

  const stream = `${ops.join('\n')}\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`,
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}
