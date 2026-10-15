import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getTableColumns } from 'drizzle-orm';
import {
    CITY_FACTORS_CSV_URL, CITY_FACTORS_REPORT_URL, CITY_FACTORS_CSV_HEADER, parseCityFactorsCsv, parseCityFactorsReport,
} from './city-factors-csv.js';
import { cityPayFactors } from './schema/city-pay-factors.js';
import { METRO_KEYS } from '../modules/salary/role-matching.js';

const text = readFileSync(fileURLToPath(CITY_FACTORS_CSV_URL), 'utf8');
const report = parseCityFactorsReport(readFileSync(fileURLToPath(CITY_FACTORS_REPORT_URL), 'utf8'));

describe('data/plfs-city-factors', () => {
    it('build_report.json gives K and the national n', () => {
        expect(report).toEqual({ K: 30, nationalN: expect.any(Number) });
    });

    it('city_factors.csv passes the loader validation and covers exactly the app metros', () => {
        const { K } = report as { K: number };
        const { rows, suppressed, problems } = parseCityFactorsCsv(text, K);
        expect(text.split(/\r?\n/)[0]).toBe(CITY_FACTORS_CSV_HEADER);
        expect(problems).toEqual([]);
        expect([...rows.map((r) => r.city), ...suppressed].sort()).toEqual([...METRO_KEYS].sort());
    });

    it('is aggregates only: no quoted field, no absolute earnings column', () => {
        expect(text).not.toContain('"');
        expect(CITY_FACTORS_CSV_HEADER).not.toMatch(/earn|salary|median|income/i);
    });
});

describe('parseCityFactorsCsv', () => {
    const ok = [
        CITY_FACTORS_CSV_HEADER,
        'bangalore,published,170,1.042,0.850,1.04',
        'mumbai,suppressed,<30,,,',
        'delhi ncr,published,86,1.354,0.741,1.25',
        'hyderabad,published,124,0.963,0.805,0.97',
        'pune,published,87,1.042,0.744,1.03',
        'chennai,published,90,0.938,0.750,0.95',
    ].join('\n');

    it('accepts a valid file; a suppressed city comes back by name and is not a row', () => {
        const r = parseCityFactorsCsv(ok, 30);
        expect(r.problems).toEqual([]);
        expect(r.suppressed).toEqual(['mumbai']);
        expect(r.rows).toHaveLength(5);
    });

    const bad = (line: string, replacement: string) => parseCityFactorsCsv(ok.replace(line, replacement), 30).problems;

    it.each([
        ['published under the floor', 'bangalore,published,170,1.042,0.850,1.04', 'bangalore,published,29,1.042,0.492,1.02'],
        ['suppressed row carrying numbers', 'mumbai,suppressed,<30,,,', 'mumbai,suppressed,<30,0.9,,'],
        ['ratio outside 0.5-2.0', 'pune,published,87,1.042,0.744,1.03', 'pune,published,87,2.500,0.744,1.99'],
        ['factor with 3 decimals', 'pune,published,87,1.042,0.744,1.03', 'pune,published,87,1.042,0.744,1.031'],
        ['weight that is not n/(n+K)', 'pune,published,87,1.042,0.744,1.03', 'pune,published,87,1.042,0.300,1.03'],
        ['factor that is not exp(w*ln r)', 'pune,published,87,1.042,0.744,1.03', 'pune,published,87,1.042,0.744,1.40'],
        ['unknown city', 'pune,published,87,1.042,0.744,1.03', 'jaipur,published,87,1.042,0.744,1.03'],
        ['duplicate city', 'pune,published,87,1.042,0.744,1.03', 'chennai,published,87,1.042,0.744,1.03'],
        ['unknown status', 'pune,published,87,1.042,0.744,1.03', 'pune,pending,87,1.042,0.744,1.03'],
        ['extra field', 'pune,published,87,1.042,0.744,1.03', 'pune,published,87,1.042,0.744,1.03,x'],
    ])('rejects: %s', (_name, line, replacement) => {
        expect(bad(line, replacement).length).toBeGreaterThan(0);
    });

    it('rejects a wrong header, a missing city and a K outside 5..200', () => {
        expect(parseCityFactorsCsv(ok.replace('city,status', 'town,status'), 30).problems.length).toBeGreaterThan(0);
        expect(parseCityFactorsCsv(ok.split('\n').slice(0, 6).join('\n'), 30).problems.length).toBeGreaterThan(0);
        expect(parseCityFactorsCsv(ok, 4).problems.length).toBeGreaterThan(0);
        expect(parseCityFactorsCsv(ok, 201).problems.length).toBeGreaterThan(0);
    });
});

describe('parseCityFactorsReport', () => {
    it('rejects bad JSON, K out of range and a national n under the floor', () => {
        expect(parseCityFactorsReport('{')).toHaveProperty('problems');
        expect(parseCityFactorsReport(JSON.stringify({ source: 'plfs_2023_24', constants: { K: 3 }, national: { n: 100 } }))).toHaveProperty('problems');
        expect(parseCityFactorsReport(JSON.stringify({ source: 'plfs_2023_24', constants: { K: 30 }, national: { n: 29 } }))).toHaveProperty('problems');
    });
});

describe('city_pay_factors schema', () => {
    it('holds only aggregates: no user, guest, fingerprint or respondent-level column', () => {
        const cols = Object.keys(getTableColumns(cityPayFactors)).join(' ').toLowerCase();
        expect(cols).not.toMatch(/user|guest|fingerprint|respondent_id|person|earning|wage|salary/);
    });
});
