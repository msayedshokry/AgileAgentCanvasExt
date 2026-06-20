import PDFDocument from 'pdfkit';
import type { BmadArtifacts } from '../types';
import { generateAllArtifactsMarkdown } from './artifact-markdown-generator';

/**
 * ArtifactExporter — extracted from ArtifactStore.
 * Handles Jira CSV and PDF export of BMAD artifacts.
 * Pure functions — operates solely on passed-in state data.
 */

/**
 * Escape a value for safe inclusion in a CSV cell (RFC 4180).
 *
 * 1. Neutralises formula injection: if the value starts with `=`, `+`, `-`,
 *    `@`, `\t`, or `\r` the cell is prefixed with a single-quote so
 *    spreadsheet programs treat it as a literal string.
 * 2. Doubles any embedded double-quotes (`"` → `""`).
 * 3. Wraps the result in double-quotes so commas and newlines inside the
 *    value don't break the CSV structure.
 */
function csvEscape(value: string | undefined | null): string {
    if (value == null) return '""';
    let v = String(value);
    // Formula injection protection — prefix with ' (displayed literally by most spreadsheets)
    if (/^[=+\-@\t\r]/.test(v)) {
        v = `'${v}`;
    }
    // RFC 4180: double any embedded quotes, then wrap in quotes
    return `"${v.replace(/"/g, '""')}"`;
}

export function generateJiraCSV(state: BmadArtifacts): string {
    const headers = ['Issue Type', 'Summary', 'Description', 'Epic Link', 'Story Points', 'Acceptance Criteria'];
    const rows = [headers.join(',')];

    state.epics?.forEach(epic => {
        // Epic row
        rows.push([
            'Epic',
            csvEscape(epic.title),
            csvEscape(epic.goal),
            '',
            '',
            ''
        ].join(','));

        // Story rows
        epic.stories?.forEach(story => {
            const acText = story.acceptanceCriteria.map(ac => 
                ac.criterion
                    ? ac.criterion
                    : `Given ${ac.given}, When ${ac.when}, Then ${ac.then}`
            ).join('; ');

            rows.push([
                'Story',
                csvEscape(story.title),
                csvEscape(`As a ${story.userStory.asA}, I want ${story.userStory.iWant}, so that ${story.userStory.soThat}`),
                csvEscape(epic.title),
                story.storyPoints?.toString() || '',
                csvEscape(acText)
            ].join(','));
        });
    });

    return rows.join('\n');
}

export async function generatePDF(state: BmadArtifacts): Promise<Uint8Array> {
    const markdown = generateAllArtifactsMarkdown(state);

    return new Promise<Uint8Array>((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 56, bottom: 56, left: 56, right: 56 },
                info: {
                    Title: `${state.projectName} — Agile Agent Canvas Export`,
                    Author: 'Agile Agent Canvas',
                    Subject: 'Project Artifacts',
                    Creator: 'Agile Agent Canvas VSCode Extension',
                },
                bufferPages: true,
                autoFirstPage: true,
            });

            // Collect PDF into a buffer
            const chunks: Buffer[] = [];
            doc.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
            });
            doc.on('end', () => {
                const buf = Buffer.concat(chunks);
                resolve(buf);
            });
            doc.on('error', (err: Error) => {
                reject(err);
            });

        // ── Color palette ──
        const COLORS = {
            title: '#1a1d23',
            heading1: '#2b2d42',
            heading2: '#3a3d56',
            heading3: '#555770',
            body: '#333340',
            muted: '#6b7280',
            accent: '#3b82f6',
            rule: '#d1d5db',
            bullet: '#6366f1',
            bgSection: '#f8f9fb',
            codeBackground: '#f3f4f6',
            codeBorder: '#e5e7eb',
        };

        const PAGE_WIDTH = doc.page.width - doc.page.margins.left - doc.page.margins.right;

        // ── Helper: check page space and add page if needed ──
        // Returns true if a new page was added.
        const ensureSpace = (needed: number): boolean => {
            const bottom = doc.page.height - doc.page.margins.bottom;
            if (doc.y + needed > bottom) {
                doc.addPage();
                return true;
            }
            return false;
        };

        // Track whether we're at the top of a fresh page so we can
        // suppress leading whitespace (moveDown) that would otherwise
        // produce empty space at the top of a new page.
        let atPageTop = true;  // first page starts at top

        // Conditional moveDown that skips if we're at the top of a page
        const smartMoveDown = (lines: number) => {
            if (!atPageTop) {
                doc.moveDown(lines);
            }
        };

        // ── Helper: draw horizontal rule ──
        const drawRule = () => {
            const added = ensureSpace(16);
            if (added) { atPageTop = true; }
            smartMoveDown(0.4);
            const y = doc.y;
            doc.strokeColor(COLORS.rule).lineWidth(0.5)
                .moveTo(doc.page.margins.left, y)
                .lineTo(doc.page.margins.left + PAGE_WIDTH, y)
                .stroke();
            doc.moveDown(0.6);
            atPageTop = false;
        };

        // ── Cover section ──
        doc.fontSize(28).font('Helvetica-Bold').fillColor(COLORS.title)
            .text(state.projectName, { align: 'left' });
        doc.moveDown(0.3);
        doc.fontSize(12).font('Helvetica').fillColor(COLORS.muted)
            .text(`AgileAgentCanvas Project Export  •  ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'left' });
        doc.moveDown(0.2);
        drawRule();
        doc.moveDown(0.3);
        atPageTop = false;

        // ── Parse markdown line by line ──
        const lines = markdown.split('\n');
        let inCodeBlock = false;
        let codeBlockLines: string[] = [];
        let consecutiveEmptyLines = 0; // track to collapse runs of blank lines

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // ── Code blocks ──
            if (line.startsWith('```')) {
                consecutiveEmptyLines = 0;
                if (inCodeBlock) {
                    // End of code block: render collected lines
                    if (ensureSpace(14 * codeBlockLines.length + 16)) { atPageTop = true; }
                    const codeText = codeBlockLines.join('\n');
                    const codeX = doc.page.margins.left;
                    const codeY = doc.y;
                    // Measure text height
                    doc.font('Courier').fontSize(9);
                    const codeHeight = doc.heightOfString(codeText, {
                        width: PAGE_WIDTH - 16,
                    });
                    // Background rect
                    doc.save();
                    doc.roundedRect(codeX, codeY, PAGE_WIDTH, codeHeight + 12, 3)
                        .fill(COLORS.codeBackground);
                    doc.restore();
                    doc.fontSize(9).font('Courier').fillColor(COLORS.body)
                        .text(codeText, codeX + 8, codeY + 6, { width: PAGE_WIDTH - 16 });
                    doc.y = codeY + codeHeight + 16;
                    codeBlockLines = [];
                    inCodeBlock = false;
                    atPageTop = false;
                } else {
                    inCodeBlock = true;
                    codeBlockLines = [];
                }
                continue;
            }

            if (inCodeBlock) {
                codeBlockLines.push(line);
                continue;
            }

            // ── Horizontal rules (---) ──
            if (/^---+$/.test(line.trim())) {
                consecutiveEmptyLines = 0;
                drawRule();
                continue;
            }

            // ── Empty lines ──
            // Collapse runs of consecutive empty lines: only allow the
            // first one to add vertical space.  Also skip if we're at
            // the top of a fresh page.
            if (line.trim() === '') {
                consecutiveEmptyLines++;
                if (consecutiveEmptyLines <= 1 && !atPageTop) {
                    doc.moveDown(0.3);
                }
                continue;
            }

            // Any non-empty line resets the counter
            consecutiveEmptyLines = 0;

            // ── Headings ──
            const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
            if (headingMatch) {
                const level = headingMatch[1].length;
                const text = headingMatch[2].replace(/\*\*/g, ''); // strip bold markers

                if (level === 1) {
                    const added = ensureSpace(40);
                    if (added) { atPageTop = true; }
                    smartMoveDown(0.4);
                    doc.fontSize(22).font('Helvetica-Bold').fillColor(COLORS.heading1)
                        .text(text, { align: 'left' });
                    atPageTop = false;
                    doc.moveDown(0.2);
                    // Accent underline for H1
                    const underY = doc.y;
                    doc.strokeColor(COLORS.accent).lineWidth(2)
                        .moveTo(doc.page.margins.left, underY)
                        .lineTo(doc.page.margins.left + Math.min(PAGE_WIDTH, 200), underY)
                        .stroke();
                    doc.moveDown(0.3);
                } else if (level === 2) {
                    const added = ensureSpace(32);
                    if (added) { atPageTop = true; }
                    smartMoveDown(0.3);
                    doc.fontSize(16).font('Helvetica-Bold').fillColor(COLORS.heading2)
                        .text(text, { align: 'left' });
                    atPageTop = false;
                    doc.moveDown(0.2);
                } else if (level === 3) {
                    const added = ensureSpace(26);
                    if (added) { atPageTop = true; }
                    smartMoveDown(0.25);
                    doc.fontSize(13).font('Helvetica-Bold').fillColor(COLORS.heading3)
                        .text(text, { align: 'left' });
                    atPageTop = false;
                    doc.moveDown(0.15);
                } else {
                    const added = ensureSpace(22);
                    if (added) { atPageTop = true; }
                    smartMoveDown(0.2);
                    doc.fontSize(11).font('Helvetica-Bold').fillColor(COLORS.heading3)
                        .text(text, { align: 'left' });
                    atPageTop = false;
                    doc.moveDown(0.1);
                }
                continue;
            }

            // ── Bullet/numbered lists ──
            const bulletMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
            const numberMatch = !bulletMatch ? line.match(/^(\s*)\d+\.\s+(.+)$/) : null;
            if (bulletMatch || numberMatch) {
                const match = (bulletMatch || numberMatch)!;
                const indent = Math.floor(match[1].length / 2);
                const text = stripMarkdownInline(match[2]);
                const indentPx = 12 + indent * 14;

                if (ensureSpace(16)) { atPageTop = true; }

                if (bulletMatch) {
                    // Draw bullet dot
                    const bulletY = doc.y + 5;
                    doc.save();
                    doc.circle(doc.page.margins.left + indentPx - 6, bulletY, 2)
                        .fill(COLORS.bullet);
                    doc.restore();
                } else {
                    // Keep the number
                    const numText = line.match(/^(\s*)(\d+\.)\s/)?.[2] || '•';
                    doc.fontSize(10).font('Helvetica').fillColor(COLORS.muted)
                        .text(numText, doc.page.margins.left + indentPx - 18, doc.y, { width: 16, align: 'right', continued: false });
                    // Move back up to same line
                    doc.y -= doc.currentLineHeight();
                }

                doc.fontSize(10).font('Helvetica').fillColor(COLORS.body)
                    .text(text, doc.page.margins.left + indentPx + 2, doc.y, {
                        width: PAGE_WIDTH - indentPx - 2,
                    });
                atPageTop = false;
                continue;
            }

            // ── Bold-prefixed lines (label: value) like **Status:** Ready ──
            const boldLabelMatch = line.match(/^\*\*(.+?)[:]\*\*\s*(.*)$/);
            if (boldLabelMatch) {
                if (ensureSpace(16)) { atPageTop = true; }
                const label = boldLabelMatch[1] + ':';
                const value = stripMarkdownInline(boldLabelMatch[2]);
                doc.fontSize(10).font('Helvetica-Bold').fillColor(COLORS.body)
                    .text(label, { continued: !!value });
                if (value) {
                    doc.font('Helvetica').fillColor(COLORS.body)
                        .text(' ' + value);
                } else {
                    doc.text('');
                }
                atPageTop = false;
                continue;
            }

            // ── Table rows (basic: | col | col | col |) ──
            if (line.trim().startsWith('|')) {
                // Skip separator rows like |---|---|
                if (/^\|[\s\-:|]+\|$/.test(line.trim())) continue;

                const cells = line.split('|').filter((c: any) => c.trim() !== '');
                if (cells.length > 0) {
                    if (ensureSpace(16)) { atPageTop = true; }
                    const cellWidth = PAGE_WIDTH / cells.length;
                    const startY = doc.y;
                    // Detect header row (first table row after any non-table content)
                    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
                    const isHeader = /^\|[\s\-:|]+\|$/.test(nextLine.trim());

                    cells.forEach((cell: string, ci: number) => {
                        const cellText = stripMarkdownInline(cell.trim());
                        doc.fontSize(9)
                            .font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
                            .fillColor(isHeader ? COLORS.heading3 : COLORS.body)
                            .text(cellText, doc.page.margins.left + ci * cellWidth, startY, {
                                width: cellWidth - 4,
                                height: 14,
                                ellipsis: true,
                            });
                    });
                    doc.y = startY + 14;
                    // Light underline
                    doc.strokeColor(COLORS.rule).lineWidth(0.3)
                        .moveTo(doc.page.margins.left, doc.y)
                        .lineTo(doc.page.margins.left + PAGE_WIDTH, doc.y)
                        .stroke();
                    doc.moveDown(0.1);
                    atPageTop = false;
                }
                continue;
            }

            // ── Regular paragraph text ──
            if (ensureSpace(14)) { atPageTop = true; }
            const plainText = stripMarkdownInline(line);
            doc.fontSize(10).font('Helvetica').fillColor(COLORS.body)
                .text(plainText, { align: 'left', lineGap: 2 });
            atPageTop = false;
        }

        // ── Footer on each page ──
        const pageCount = doc.bufferedPageRange();
        for (let p = pageCount.start; p < pageCount.start + pageCount.count; p++) {
            doc.switchToPage(p);
            const bottom = doc.page.height - 30;
            doc.fontSize(8).font('Helvetica').fillColor(COLORS.muted)
                .text(
                    `${state.projectName}  •  Page ${p + 1} of ${pageCount.count}`,
                    doc.page.margins.left,
                    bottom,
                    { width: PAGE_WIDTH, align: 'center' }
                );
        }

        doc.end();
        } catch (syncErr: unknown) {
            const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
            reject(syncErr);
        }
    });
}

export function stripMarkdownInline(text: string): string {
    return text
        .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
        .replace(/\*(.+?)\*/g, '$1')         // italic
        .replace(/__(.+?)__/g, '$1')          // bold alt
        .replace(/_(.+?)_/g, '$1')            // italic alt
        .replace(/`(.+?)`/g, '$1')            // inline code
        .replace(/\[(.+?)\]\(.+?\)/g, '$1')   // links
        .replace(/~~(.+?)~~/g, '$1');          // strikethrough
}
