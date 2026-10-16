const win: Record<string, string> = {
  'é': '\\351',
  'è': '\\350',
  'ê': '\\352',
  'ë': '\\353',
  'à': '\\340',
  'â': '\\342',
  'ù': '\\371',
  'û': '\\373',
  'ô': '\\364',
  'î': '\\356',
  'ï': '\\357',
  'ç': '\\347',
  'É': '\\311',
  'È': '\\310',
  'À': '\\300',
  'Ç': '\\307',
  '’': "'",
  '—': '-',
};

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

export function certificatePdf(title: string, lines: string[]): Buffer {
  const commands = [`BT /F1 18 Tf 48 780 Td (${pdfText(title)}) Tj`];
  lines.forEach((line, index) => {
    commands.push(`0 ${index === 0 ? -36 : -18} Td (${pdfText(line)}) Tj`);
  });
  commands.push('ET');
  const stream = `${commands.join('\n')}\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
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
