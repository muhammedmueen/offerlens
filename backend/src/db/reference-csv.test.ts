import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getTableColumns } from 'drizzle-orm';
import { REFERENCE_CSV_URL, REFERENCE_CSV_HEADER, parseReferenceCsv } from './reference-csv.js';
import { REFERENCE_FAMILIES } from './seed-data.js';
import { salaryReferenceRows } from './schema/salary-reference-rows.js';

const text = readFileSync(fileURLToPath(REFERENCE_CSV_URL), 'utf8');

describe('data/so-2025-india/reference_rows.csv', () => {
    const { rows, problems } = parseReferenceCsv(text);

    it('passes the loader validation (header, 4 fields, ints in range, unique ids)', () => {
        expect(text.split(/\r?\n/)[0]).toBe(REFERENCE_CSV_HEADER);
        expect(problems).toEqual([]);
        expect(rows.length).toBeGreaterThan(0);
    });

    it('only uses reference families', () => {
        for (const r of rows) expect(REFERENCE_FAMILIES).toContain(r.role);
    });

    it('has no comma-bearing or quoted field', () => {
        expect(text).not.toContain('"');
    });
});

describe('parseReferenceCsv', () => {
    const ok = `${REFERENCE_CSV_HEADER}\n1,Backend Engineer,3,1000000\n`;

    it('accepts a valid file', () => {
        expect(parseReferenceCsv(ok).problems).toEqual([]);
    });

    it.each([
        ['wrong header', ok.replace('ctc', 'salary')],
        ['unknown role', ok.replace('Backend Engineer', 'Wizard')],
        ['ctc below floor', ok.replace('1000000', '99999')],
        ['ctc above cap', ok.replace('1000000', '50000001')],
        ['experience out of range', ok.replace(',3,', ',61,')],
        ['non-integer ctc', ok.replace('1000000', '1e6')],
        ['duplicate id', `${ok}1,Backend Engineer,4,1100000\n`],
        ['extra field', ok.replace('1000000', '1000000,x')],
    ])('rejects %s', (_name, bad) => {
        expect(parseReferenceCsv(bad).problems.length).toBeGreaterThan(0);
    });
});

describe('salary_reference_rows schema', () => {
    it('holds no user, guest or fingerprint column', () => {
        const cols = Object.keys(getTableColumns(salaryReferenceRows)).join(' ').toLowerCase();
        expect(cols).not.toMatch(/user|guest|fingerprint/);
    });
});
