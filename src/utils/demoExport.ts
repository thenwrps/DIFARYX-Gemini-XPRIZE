export type DemoExportFormat = 'pdf' | 'docx' | 'csv' | 'txt' | 'png' | 'md';

export type DemoExportSection = {
  heading: string;
  lines: Array<string | number | boolean | undefined | null>;
};

type DemoExportOptions = {
  filenameBase: string;
  title: string;
  sections: DemoExportSection[];
  csvRows?: Array<Record<string, string | number | boolean | undefined | null>>;
};

const mimeByFormat: Record<Exclude<DemoExportFormat, 'png'>, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv',
  txt: 'text/plain',
  md: 'text/markdown;charset=utf-8',
};

function cleanFilename(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 400);
}

function buildTextReport(options: DemoExportOptions) {
  const body = options.sections
    .map((section) => {
      const lines = section.lines.filter((line) => line !== undefined && line !== null && String(line).trim() !== '');
      return [`## ${section.heading}`, ...lines.map((line) => String(line))].join('\n');
    })
    .join('\n\n');

  return `${options.title}\nDIFARYX Notebook Report\n${new Date().toLocaleString()}\n\n${body}\n`;
}

function buildCsv(options: DemoExportOptions) {
  const rows = options.csvRows ?? options.sections.flatMap((section) => section.lines.map((line) => ({
    section: section.heading,
    value: line ?? '',
  })));
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const escapeCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(','))].join('\n');
}

export async function exportDemoArtifact(format: DemoExportFormat, options: DemoExportOptions): Promise<void> {
  const filenameBase = cleanFilename(options.filenameBase || options.title || 'difaryx-export');

  if (format === 'png') {
    exportDemoPng(filenameBase, options.title, options.sections);
    return;
  }

  if (format === 'pdf') {
    await exportDemoPdf(filenameBase, options.title, options.sections);
    return;
  }

  const content = format === 'csv' ? buildCsv(options) : buildTextReport(options);
  const blob = new Blob([content], { type: mimeByFormat[format] });
  downloadBlob(blob, `${filenameBase}.${format}`);
}

async function exportDemoPdf(filenameBase: string, title: string, sections: DemoExportSection[]): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 18;
  const pageWidth = 210;
  const pageHeight = 297;
  const contentWidth = pageWidth - margin * 2;
  const bottom = pageHeight - margin;
  let y = margin;

  const addPageIfNeeded = (height: number) => {
    if (y + height <= bottom) return;
    pdf.addPage();
    y = margin;
  };

  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, 0, pageWidth, 24, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text('DIFARYX', margin, 15);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text('Scientific Workflow Intelligence', pageWidth - margin, 15, { align: 'right' });

  y = 38;
  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.text(title, margin, y);
  y += 7;
  pdf.setTextColor(100, 116, 139);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text(`Generated ${new Date().toLocaleString('en-GB')}`, margin, y);
  y += 11;

  sections.forEach((section) => {
    const lines = section.lines
      .filter((line) => line !== undefined && line !== null && String(line).trim() !== '')
      .flatMap((line) => pdf.splitTextToSize(String(line), contentWidth - 4));
    addPageIfNeeded(12 + lines.length * 4.4);

    pdf.setFillColor(239, 246, 255);
    pdf.rect(margin, y - 4.5, contentWidth, 7, 'F');
    pdf.setTextColor(30, 64, 175);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(section.heading, margin + 3, y);
    y += 7;

    pdf.setTextColor(51, 65, 85);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    lines.forEach((line) => {
      addPageIfNeeded(4.4);
      pdf.text(line, margin + 2, y);
      y += 4.4;
    });
    y += 6;
  });

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(226, 232, 240);
    pdf.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    pdf.setTextColor(148, 163, 184);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text('DIFARYX - Local report export', margin, pageHeight - 7);
    pdf.text(`${page} / ${pageCount}`, pageWidth - margin, pageHeight - 7, { align: 'right' });
  }

  pdf.save(`${filenameBase}.pdf`);
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const words = text.split(/\s+/);
  let line = '';
  let currentY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const metrics = context.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      context.fillText(line, x, currentY);
      line = word;
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    context.fillText(line, x, currentY);
    currentY += lineHeight;
  }
  return currentY;
}

export function exportDemoPng(filenameBase: string, title: string, sections: DemoExportSection[]) {
  const width = 1500;
  const padding = 72;
  const contentWidth = width - padding * 2 - 20; // 20px extra left indent for body text
  const lineHeight = 26;

  // Pre-calculate required height
  let estimatedHeight = 180; // header space
  sections.forEach((section) => {
    estimatedHeight += 34; // heading
    section.lines.forEach((line) => {
      const text = String(line ?? '');
      if (!text.trim()) return;
      const words = text.split(/\s+/);
      let lineCount = 1;
      let currentLine = '';
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        // Approximate: 16px Arial ~9px per char average
        if (testLine.length * 9 > contentWidth && currentLine) {
          lineCount++;
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      estimatedHeight += lineCount * lineHeight;
    });
    estimatedHeight += 24; // section gap
  });
  estimatedHeight += 60; // bottom padding

  const height = Math.max(estimatedHeight, 500);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    const fallback = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#f8fafc"/><text x="48" y="72" font-family="Arial" font-size="32" fill="#0f172a">${title}</text></svg>`;
    downloadBlob(new Blob([fallback], { type: 'image/svg+xml' }), `${cleanFilename(filenameBase)}.svg`);
    return;
  }

  // Background
  context.fillStyle = '#f8fafc';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#ffffff';
  context.strokeStyle = '#cbd5e1';
  context.lineWidth = 2;
  context.roundRect(40, 36, width - 80, height - 72, 18);
  context.fill();
  context.stroke();

  // Header
  context.fillStyle = '#1d4ed8';
  context.font = '700 24px Arial';
  context.fillText('DIFARYX', padding, 86);
  context.fillStyle = '#0f172a';
  context.font = '700 34px Arial';
  context.fillText(title, padding, 132);

  // Sections with word-wrapping
  let y = 184;
  sections.forEach((section) => {
    context.fillStyle = '#0f172a';
    context.font = '700 20px Arial';
    context.fillText(section.heading, padding, y);
    y += 34;
    context.fillStyle = '#475569';
    context.font = '16px Arial';
    section.lines.forEach((line) => {
      const text = String(line ?? '').trim();
      if (!text) return;
      y = wrapText(context, text, padding + 20, y, contentWidth, lineHeight);
    });
    y += 24;
  });

  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, `${cleanFilename(filenameBase)}.png`);
  }, 'image/png');
}
