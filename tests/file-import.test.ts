import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/errors';
import { appendToDoc, assertSupported, convertFile, extensionOf, formatBytes } from '@/lib/file-import';
import { docToText, htmlToDoc, plainTextToDoc } from '@/lib/richtext';

describe('accepted file types', () => {
  it('reads the extension case-insensitively', () => {
    expect(extensionOf('Notes.MD')).toBe('.md');
    expect(extensionOf('archive.tar.gz')).toBe('.gz');
    expect(extensionOf('nodots')).toBe('');
  });

  it('accepts the documented formats', () => {
    for (const name of ['a.txt', 'b.md', 'c.markdown', 'd.docx']) {
      expect(() => assertSupported(name, 100)).not.toThrow();
    }
  });

  it('names the accepted formats when rejecting one, so the user can act on it', () => {
    try {
      assertSupported('resume.pdf', 100);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).code).toBe('unsupported_media_type');
      expect((error as ApiError).message).toContain('.pdf');
      expect((error as ApiError).message).toContain('.docx');
    }
  });

  it('rejects empty and oversized files with distinct errors', () => {
    expect(() => assertSupported('a.txt', 0)).toThrow(/empty/i);
    expect(() => assertSupported('a.txt', 50 * 1024 * 1024)).toThrow(/limit/i);
  });
});

describe('convertFile', () => {
  it('turns plain text into paragraphs', async () => {
    const result = await convertFile('notes.txt', Buffer.from('Line one\n\nLine two', 'utf8'));
    expect(result.extension).toBe('.txt');
    expect(result.doc.content).toHaveLength(2);
    expect(docToText(result.doc)).toContain('Line two');
  });

  it('converts Markdown structure into editor formatting', async () => {
    const markdown = ['# Title', '', 'Some **bold** text.', '', '- one', '- two', '', '1. first'].join('\n');
    const result = await convertFile('notes.md', Buffer.from(markdown, 'utf8'));

    const types = result.doc.content.map((n) => n.type);
    expect(types).toContain('heading');
    expect(types).toContain('bulletList');
    expect(types).toContain('orderedList');

    const paragraph = result.doc.content.find((n) => n.type === 'paragraph');
    expect(paragraph?.content?.some((n) => n.marks?.[0]?.type === 'bold')).toBe(true);
  });

  it('handles .markdown as well as .md', async () => {
    const result = await convertFile('readme.markdown', Buffer.from('## Sub', 'utf8'));
    expect(result.doc.content[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } });
  });

  it('rejects an unsupported type before reading a single byte', async () => {
    await expect(convertFile('image.png', Buffer.from([0x89, 0x50]))).rejects.toThrow(
      /not supported/i,
    );
  });

  it('converts a real .docx, keeping underline and both list kinds', async () => {
    // Regression guard. Mammoth discards underline unless it is told not to
    // (see DOCX_STYLE_MAP), and underline is formatting this editor promises.
    // A plain fixture would not have caught it - this one is a genuine Word
    // package with numbering.xml, built by scripts/build-sample-docx.mjs.
    const fixture = readFileSync(join(process.cwd(), 'samples', 'quarterly-report.docx'));
    const { doc } = await convertFile('quarterly-report.docx', fixture);

    const types = doc.content.map((n) => n.type);
    expect(types).toContain('bulletList');
    expect(types).toContain('orderedList');

    const marks = new Set<string>();
    (function walk(node: { marks?: { type: string }[]; content?: unknown[] }) {
      for (const mark of node.marks ?? []) marks.add(mark.type);
      for (const child of (node.content ?? []) as typeof node[]) walk(child);
    })(doc);

    expect(marks).toContain('bold');
    expect(marks).toContain('italic');
    expect(marks).toContain('underline');
  });

  it('gives an actionable error for an unreadable .docx', async () => {
    // A .docx is a zip archive; this is plainly not one.
    await expect(convertFile('broken.docx', Buffer.from('this is not a zip', 'utf8'))).rejects.toThrow(
      /could not be read/i,
    );
  });
});

describe('appendToDoc', () => {
  it('adds the imported blocks after the existing ones', () => {
    const base = plainTextToDoc('existing');
    const incoming = htmlToDoc('<h2>Imported</h2>');

    const merged = appendToDoc(base, incoming);
    expect(merged.content.map((n) => n.type)).toEqual(['paragraph', 'heading']);
  });

  it('does not leave a blank gap from the trailing empty paragraph', () => {
    const base = { type: 'doc' as const, content: [{ type: 'paragraph' as const }] };
    const merged = appendToDoc(base, plainTextToDoc('new content'));

    expect(merged.content).toHaveLength(1);
    expect(docToText(merged)).toBe('new content');
  });
});

describe('formatBytes', () => {
  it('picks a readable unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
