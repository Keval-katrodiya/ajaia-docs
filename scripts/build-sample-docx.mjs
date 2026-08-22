/**
 * Regenerates samples/quarterly-report.docx.
 *
 * The repo ships a .docx so both the test suite and a reviewer have something
 * real to import. A binary blob with no provenance is a bad thing to commit,
 * so this script builds it from source instead:
 *
 *   node scripts/build-sample-docx.mjs
 *
 * It writes a genuine OOXML package - content types, relationships, and a
 * numbering.xml so Word lists import as real <ul>/<ol> rather than paragraphs.
 * jszip comes in as a mammoth dependency; nothing extra is installed for this.
 */

import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const run = (text, { b = false, i = false, u = false } = {}) =>
  `<w:r><w:rPr>${b ? '<w:b/>' : ''}${i ? '<w:i/>' : ''}${u ? '<w:u w:val="single"/>' : ''}</w:rPr>` +
  `<w:t xml:space="preserve">${text}</w:t></w:r>`;

const para = (style, runs, numId) => {
  const props =
    style || numId
      ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}` +
        `${numId ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>` : ''}</w:pPr>`
      : '';
  return `<w:p>${props}${runs}</w:p>`;
};

const abstractNum = (id, format) =>
  `<w:abstractNum w:abstractNumId="${id}"><w:lvl w:ilvl="0">` +
  `<w:numFmt w:val="${format}"/><w:lvlText w:val="o"/></w:lvl></w:abstractNum>`;

const body = [
  para('Heading1', run('Quarterly Report')),
  para(
    null,
    run('Normal text with ') +
      run('bold', { b: true }) +
      run(', ') +
      run('italic', { i: true }) +
      run(' and ') +
      run('underline', { u: true }) +
      run('.'),
  ),
  para('Heading2', run('Highlights')),
  para('ListParagraph', run('Revenue up 12 percent'), 1),
  para('ListParagraph', run('Churn flat'), 1),
  para('Heading2', run('Actions')),
  para('ListParagraph', run('Confirm Q4 targets'), 2),
  para('ListParagraph', run('Publish the roadmap'), 2),
].join('');

const zip = new JSZip();

zip.file(
  '[Content_Types].xml',
  `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
    '</Types>',
);

zip
  .folder('_rels')
  .file(
    '.rels',
    `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  );

const word = zip.folder('word');

word
  .folder('_rels')
  .file(
    'document.xml.rels',
    `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
      '</Relationships>',
  );

word.file(
  'numbering.xml',
  `${XML}<w:numbering ${W}>${abstractNum(0, 'bullet')}${abstractNum(1, 'decimal')}` +
    '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>' +
    '<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>',
);

word.file('document.xml', `${XML}<w:document ${W}><w:body>${body}</w:body></w:document>`);

const target = path.resolve('samples/quarterly-report.docx');
fs.mkdirSync(path.dirname(target), { recursive: true });
const buffer = await zip.generateAsync({ type: 'nodebuffer' });
fs.writeFileSync(target, buffer);

console.log(`Wrote ${target} (${buffer.length} bytes)`);
