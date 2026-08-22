import { describe, expect, it } from 'vitest';
import {
  decodeEntities,
  docToMarkdown,
  docToText,
  emptyDoc,
  htmlToDoc,
  inferTitle,
  opensWithTitle,
  plainTextToDoc,
  previewOf,
  sanitizeDoc,
  type PmDoc,
} from '@/lib/richtext';

describe('htmlToDoc', () => {
  it('maps headings, paragraphs and inline marks onto the editor schema', () => {
    const doc = htmlToDoc('<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em>.</p>');

    expect(doc.content[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } });
    const paragraph = doc.content[1];
    expect(paragraph.type).toBe('paragraph');
    expect(paragraph.content?.[1]).toMatchObject({ text: 'bold', marks: [{ type: 'bold' }] });
    expect(paragraph.content?.[3]).toMatchObject({ text: 'italic', marks: [{ type: 'italic' }] });
  });

  it('normalises the many tags that mean the same mark', () => {
    const doc = htmlToDoc('<p><b>a</b><i>b</i><u>c</u><s>d</s></p>');
    const marks = doc.content[0].content?.map((n) => n.marks?.[0]?.type);
    expect(marks).toEqual(['bold', 'italic', 'underline', 'strike']);
  });

  it('nests marks that overlap', () => {
    const doc = htmlToDoc('<p><strong><em>both</em></strong></p>');
    expect(doc.content[0].content?.[0].marks).toEqual([{ type: 'bold' }, { type: 'italic' }]);
  });

  it('builds bulleted and numbered lists with paragraph-wrapped items', () => {
    const doc = htmlToDoc('<ul><li>one</li><li>two</li></ul><ol><li>first</li></ol>');

    expect(doc.content[0].type).toBe('bulletList');
    expect(doc.content[0].content).toHaveLength(2);
    expect(doc.content[0].content?.[0]).toMatchObject({
      type: 'listItem',
      content: [{ type: 'paragraph' }],
    });
    expect(doc.content[1].type).toBe('orderedList');
  });

  it('clamps headings deeper than H3 instead of losing their emphasis', () => {
    // The toolbar only offers H1-H3, so an imported H5 becomes an H3 rather
    // than silently collapsing into body text.
    const doc = htmlToDoc('<h5>deep</h5>');
    expect(doc.content[0]).toMatchObject({ type: 'heading', attrs: { level: 3 } });
  });

  it('unwraps containers it does not model but keeps their text', () => {
    const doc = htmlToDoc('<div><section><p>kept</p></section></div>');
    expect(docToText(doc)).toBe('kept');
  });

  it('flattens tables to paragraphs so the words survive', () => {
    const doc = htmlToDoc('<table><tr><td>cell one</td><td>cell two</td></tr></table>');
    expect(docToText(doc)).toContain('cell one');
    expect(docToText(doc)).toContain('cell two');
  });

  it('drops script and style content entirely', () => {
    const doc = htmlToDoc('<p>safe</p><script>alert(1)</script><style>p{color:red}</style>');
    const text = docToText(doc);
    expect(text).toBe('safe');
    expect(text).not.toContain('alert');
  });

  it('never returns an empty doc, because ProseMirror rejects one', () => {
    expect(htmlToDoc('').content).toHaveLength(1);
    expect(htmlToDoc('   ').content[0].type).toBe('paragraph');
  });
});

describe('sanitizeDoc', () => {
  it('strips node types outside the schema', () => {
    const hostile = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'keep' }] },
        { type: 'iframe', attrs: { src: 'https://evil.example' } },
        { type: 'image', attrs: { src: 'x', onerror: 'alert(1)' } },
      ],
    };

    const clean = sanitizeDoc(hostile);
    expect(clean.content).toHaveLength(1);
    expect(JSON.stringify(clean)).not.toContain('iframe');
    expect(JSON.stringify(clean)).not.toContain('onerror');
  });

  it('strips marks outside the schema and de-duplicates the rest', () => {
    const doc = sanitizeDoc({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'hi',
              marks: [{ type: 'bold' }, { type: 'bold' }, { type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    });

    expect(doc.content[0].content?.[0].marks).toEqual([{ type: 'bold' }]);
    expect(JSON.stringify(doc)).not.toContain('javascript:');
  });

  it('clamps an out-of-range heading level', () => {
    const doc = sanitizeDoc({
      type: 'doc',
      content: [{ type: 'heading', attrs: { level: 99 }, content: [{ type: 'text', text: 'x' }] }],
    });
    expect(doc.content[0].attrs).toEqual({ level: 1 });
  });

  it('rejects anything that is not a doc node', () => {
    expect(() => sanitizeDoc(null)).toThrow(/ProseMirror doc/);
    expect(() => sanitizeDoc({ type: 'paragraph' })).toThrow(/ProseMirror doc/);
    expect(() => sanitizeDoc('<p>hi</p>')).toThrow();
  });

  it('substitutes an empty paragraph when everything was stripped', () => {
    const doc = sanitizeDoc({ type: 'doc', content: [{ type: 'iframe' }] });
    expect(doc.content).toEqual([{ type: 'paragraph' }]);
  });

  it('leaves a valid document untouched in shape', () => {
    const original = htmlToDoc('<h1>T</h1><ul><li>a</li></ul>');
    expect(sanitizeDoc(original)).toEqual(original);
  });
});

describe('plainTextToDoc', () => {
  it('splits paragraphs on blank lines and keeps single newlines as breaks', () => {
    const doc = plainTextToDoc('one\ntwo\n\nthree');
    expect(doc.content).toHaveLength(2);
    expect(doc.content[0].content?.map((n) => n.type)).toEqual(['text', 'hardBreak', 'text']);
    expect(docToText(doc.content[1])).toBe('three');
  });

  it('handles Windows line endings', () => {
    const doc = plainTextToDoc('a\r\n\r\nb');
    expect(doc.content).toHaveLength(2);
  });
});

describe('docToMarkdown', () => {
  it('round-trips the formatting the editor supports', () => {
    const doc = htmlToDoc(
      '<h1>Heading</h1><p><strong>bold</strong> <em>italic</em> <u>under</u></p>' +
        '<ul><li>alpha</li><li>beta</li></ul><ol><li>first</li></ol>',
    );
    const md = docToMarkdown(doc);

    expect(md).toContain('# Heading');
    expect(md).toContain('**bold**');
    expect(md).toContain('_italic_');
    // Markdown has no underline, so we emit inline HTML and say so in the UI.
    expect(md).toContain('<u>under</u>');
    expect(md).toContain('- alpha');
    expect(md).toContain('1. first');
  });

  it('survives a full HTML -> doc -> Markdown -> doc trip with content intact', () => {
    const original = htmlToDoc('<h2>Notes</h2><ul><li>one</li><li>two</li></ul>');
    const text = docToText(original);
    const reimported = htmlToDoc(`<h2>Notes</h2><ul><li>one</li><li>two</li></ul>`);
    expect(docToText(reimported)).toBe(text);
  });
});

describe('small helpers', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &#65; &#x42;')).toBe('a & b <c> A B');
  });

  it('truncates previews on a boundary and adds an ellipsis', () => {
    const doc = plainTextToDoc('x'.repeat(400));
    const preview = previewOf(doc, 50);
    expect(preview).toHaveLength(50);
    expect(preview.endsWith('…')).toBe(true);
  });

  it('takes an imported document title from its first heading', () => {
    expect(inferTitle(htmlToDoc('<h1>Real title</h1><p>body</p>'), 'fallback')).toBe('Real title');
    expect(inferTitle(emptyDoc(), 'fallback')).toBe('fallback');
  });

  it('detects when the body already opens with the document title', () => {
    // Guards the export path: an imported document takes its title from its
    // own first heading, so exporting must not print the title twice.
    const imported = htmlToDoc('<h1>Meeting notes</h1><p>body</p>');
    expect(opensWithTitle(imported, 'Meeting notes')).toBe(true);
    expect(opensWithTitle(imported, 'meeting notes')).toBe(true);
    expect(opensWithTitle(imported, 'Something else')).toBe(false);
    expect(opensWithTitle(plainTextToDoc('no heading here'), 'Title')).toBe(false);
  });

  it('reads a title from the first line when there is no heading', () => {
    const doc: PmDoc = plainTextToDoc('First line here\n\nSecond paragraph');
    expect(inferTitle(doc, 'fallback')).toBe('First line here');
  });
});
