import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { looksLikePdf, extractPdfText } from './pdf-text.js';

/**
 * Real PDF bytes, not mocks.
 *
 * The whole point of this module is behaviour against actual files, and the library choice was
 * itself decided by what survived a real document — `unpdf` killed the process on this Node
 * version. A mocked pdfjs would have told us nothing about either.
 *
 * pdfkit generates the fixtures, so the cases are reproducible and no binary lands in the repo.
 * It also generates cleaner PDFs than most HR systems, which is a limit of this suite rather than
 * a feature: real letters wrap oddly and use tables.
 */

let dir: string;

/** A PDF built from pdfkit instructions, written to a temp file. Returns its path. */
async function pdfFile(name: string, build: (doc: PDFKit.PDFDocument) => void): Promise<string> {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((resolve) => doc.on('end', () => resolve()));

    build(doc);
    doc.end();
    await done;

    const file = path.join(dir, name);
    await writeFile(file, Buffer.concat(chunks));
    return file;
}

beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'offerlens-pdf-'));
});

afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe('looksLikePdf', () => {
    it('recognises the %PDF- magic bytes', () => {
        expect(looksLikePdf(Buffer.from('%PDF-1.7\n...'))).toBe(true);
    });

    it('rejects anything else, whatever it is named', () => {
        // The extension and the declared mime type both come from the uploader, so neither is
        // evidence. A JPEG called offer.pdf must not reach a PDF parser.
        expect(looksLikePdf(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe(false); // JPEG
        expect(looksLikePdf(Buffer.from('OFFER OF EMPLOYMENT'))).toBe(false);
        expect(looksLikePdf(Buffer.from('%PDF'))).toBe(false); // truncated magic
        expect(looksLikePdf(new Uint8Array(0))).toBe(false);
    });
});

describe('extractPdfText', () => {
    it('reads the text layer of a generated letter', async () => {
        const file = await pdfFile('letter.pdf', (doc) => {
            doc.fontSize(16).text('OFFER OF EMPLOYMENT', { align: 'center' });
            doc.moveDown().fontSize(11).text(
                'Dear Candidate, we are pleased to offer you the position of Backend Engineer at '
                + 'Thornbury Systems, Bengaluru. Total cost to company: INR 24,00,000 per annum.',
                { align: 'justify' },
            );
            doc.addPage().text('Notice period: 60 days. Probation: 3 months with 30 days notice.');
        });

        const result = await extractPdfText(file);

        expect(result.kind).toBe('text');
        if (result.kind !== 'text') return;

        expect(result.pages).toBe(2);
        expect(result.text).toContain('Thornbury Systems');
        expect(result.text).toContain('24,00,000');
        // Both pages, not just the first.
        expect(result.text).toContain('Probation');
    });

    it('keeps the line breaks the rule engine depends on', async () => {
        // `unwrapLines` in redflag.rules rejoins lines wrapped mid-sentence, and it exists because
        // extracted PDF text breaks at the visual line. If extraction returned one unbroken string
        // instead, sentence splitting would change behaviour for every clause rule.
        const file = await pdfFile('wrapped.pdf', (doc) => {
            doc.fontSize(11).text(
                'You shall not, for a period of twelve months following the termination of your '
                + 'employment, engage in any business which competes with the Company.',
                { align: 'justify' },
            );
        });

        const result = await extractPdfText(file);
        expect(result.kind).toBe('text');
        if (result.kind !== 'text') return;

        expect(result.text).toContain('\n');
        // The clause survives intact once the wrap is undone.
        expect(result.text.replace(/\s+/g, ' ')).toContain('for a period of twelve months');
    });

    it('separates pages, so a sentence cannot run across a page break', async () => {
        const file = await pdfFile('pages.pdf', (doc) => {
            doc.fontSize(11).text(
                'Your salary is stated above and is final for the first twelve months of service.',
            );
            doc.addPage().text(
                'Benefits are listed in Annexure A and are subject to company policy.',
            );
        });

        const result = await extractPdfText(file);
        if (result.kind !== 'text') throw new Error(`expected text, got ${result.kind}`);

        // A blank line between pages, so sentence splitting cannot glue the last sentence of one
        // page to the first of the next.
        expect(result.text).toMatch(/service\.\s*\n\s*\n\s*Benefits/);
    });

    it('reports a PDF with no meaningful text as a scan, not as text', async () => {
        // What a phone-scanned letter looks like: pages of image with no text layer. pdfkit cannot
        // make one, so this is an empty page — the same observable state, and the branch that
        // matters is "there is nothing to analyse here, do not send it to the model".
        const file = await pdfFile('blank.pdf', (doc) => {
            doc.text(' ');
        });

        const result = await extractPdfText(file);
        expect(result.kind).toBe('no-text-layer');
    });

    it('does not mistake a stray producer string for a text layer', async () => {
        // Scanners embed small amounts of junk. Treating any text at all as a usable layer would
        // send an unreadable scan to the model and bill for the privilege.
        const file = await pdfFile('junk.pdf', (doc) => {
            doc.fontSize(6).text('Scanned by AcmeScan');
        });

        expect((await extractPdfText(file)).kind).toBe('no-text-layer');
    });

    it('reports a password-protected PDF as encrypted', async () => {
        // Real case in Indian hiring: letters locked with a PAN or date of birth. Worth its own
        // message, because "we could not read that file" would send the user off to re-scan a
        // file that is perfectly legible.
        const doc = new PDFDocument({ margin: 50, userPassword: 'letmein' });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        const done = new Promise<void>((resolve) => doc.on('end', () => resolve()));
        doc.text('OFFER OF EMPLOYMENT. Total CTC INR 24,00,000 per annum.');
        doc.end();
        await done;

        const file = path.join(dir, 'locked.pdf');
        await writeFile(file, Buffer.concat(chunks));

        expect((await extractPdfText(file)).kind).toBe('encrypted');
    });

    it('returns not-pdf for an image, so the caller falls through to OCR', async () => {
        const file = path.join(dir, 'photo.png');
        await writeFile(file, Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
            'base64',
        ));

        expect((await extractPdfText(file)).kind).toBe('not-pdf');
    });

    it('returns not-pdf for plain text that happens to be named .pdf', async () => {
        const file = path.join(dir, 'fake.pdf');
        await writeFile(file, 'OFFER OF EMPLOYMENT\nTotal CTC INR 24,00,000 per annum.');

        expect((await extractPdfText(file)).kind).toBe('not-pdf');
    });

    it('reports a truncated PDF as unreadable rather than throwing', async () => {
        // A failure here must not take the worker down: the offer should fail with a message.
        const file = path.join(dir, 'broken.pdf');
        await writeFile(file, Buffer.from('%PDF-1.7\nthis is not a real pdf body'));

        const result = await extractPdfText(file);
        expect(result.kind).toBe('unreadable');
    });

    it('reports a missing file as unreadable rather than throwing', async () => {
        const result = await extractPdfText(path.join(dir, 'does-not-exist.pdf'));
        expect(result.kind).toBe('unreadable');
    });
});
