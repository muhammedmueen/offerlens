"""Self-check for build_reference.py. Synthetic fixtures only; nothing here writes reference_rows.csv.

    cd data/so-2025-india && python -m unittest -v test_build_reference
"""
import contextlib
import io
import math
import tempfile
import unittest
from pathlib import Path

import build_reference as br

HEADER = ['ResponseId', 'Country', 'Currency', 'Employment', 'DevType', 'CompTotal', 'WorkExp']


def row(rid=1, country='India', currency='INR Indian rupee', employment='Employed',
        devtype='Developer, back-end', comp='1000000', exp='3'):
    return dict(zip(HEADER, [str(rid), country, currency, employment, devtype, comp, exp]))


def run_main(csv_text, extra=None, bom=False, name='in.csv'):
    """Write csv_text to a temp dir (outside the repo) and run the CLI. Returns (code, out_dir)."""
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / name
        p.write_bytes((b'\xef\xbb\xbf' if bom else b'') + csv_text.encode('utf-8'))
        out = Path(tmp) / 'out'
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            code = br.main(['--input', str(p), '--out', str(out), '--skip-hash'] + (extra or []))
        written = (out / 'reference_rows.csv').read_text(encoding='utf-8') if (out / 'reference_rows.csv').exists() else None
        return code, written


def to_csv(rows):
    lines = [','.join(HEADER)]
    for r in rows:
        lines.append(','.join('"%s"' % r[h] for h in HEADER))
    return '\n'.join(lines) + '\n'


def kept_ctcs(rows):
    kept, _, _ = br.clean(rows)
    return [k[3] for k in kept]


class DevTypeMap(unittest.TestCase):
    def test_every_mapped_value(self):
        expected = {
            'Developer, full-stack': 'Full Stack Engineer', 'Developer, back-end': 'Backend Engineer',
            'Developer, front-end': 'Frontend Engineer', 'Developer, mobile': 'Mobile Engineer',
            'Data engineer': 'Data Engineer', 'Data scientist': 'Data Scientist',
            'AI/ML engineer': 'Data Scientist', 'Applied scientist': 'Data Scientist',
            'Engineering manager': 'Engineering Manager',
            'DevOps engineer or professional': 'DevOps Engineer',
            'Cloud infrastructure engineer': 'DevOps Engineer',
        }
        for devtype, role in expected.items():
            kept, _, _ = br.clean([row(devtype=devtype)])
            self.assertEqual([k[1] for k in kept], [role], devtype)

    def test_unmapped_dropped(self):
        kept, stages, _ = br.clean([row(devtype='Student')])
        self.assertEqual(kept, [])
        self.assertEqual(stages['dropped_unmapped_devtype'], 1)

    def test_semicolon_devtype_aborts(self):
        code, _ = run_main(to_csv([row(devtype='Developer, back-end;Data engineer')]))
        self.assertEqual(code, 1)


class Filters(unittest.TestCase):
    def test_employment(self):
        self.assertEqual(len(kept_ctcs([row(employment='Employed')])), 1)
        self.assertEqual(kept_ctcs([row(employment='Independent contractor, freelancer, or self-employed')]), [])

    def test_currency(self):
        self.assertEqual(len(kept_ctcs([row(currency='INR Indian rupee')])), 1)
        self.assertEqual(kept_ctcs([row(currency='USD United States dollar')]), [])
        self.assertEqual(kept_ctcs([row(currency='INRX Imaginary unit')]), [])

    def test_na_comp_or_exp_dropped(self):
        self.assertEqual(kept_ctcs([row(comp='NA')]), [])
        self.assertEqual(kept_ctcs([row(exp='NA')]), [])

    def test_hard_bounds_after_rounding(self):
        self.assertEqual(kept_ctcs([row(comp='99999.6')]), [100000])
        self.assertEqual(kept_ctcs([row(comp='99999.4')]), [])
        self.assertEqual(kept_ctcs([row(comp='50000000')]), [50000000])
        self.assertEqual(kept_ctcs([row(comp='50000001')]), [])

    def test_bracket_is_half_open(self):
        self.assertEqual(br.bracket_of(0), 'Fresher (0-1 yrs)')
        self.assertEqual(br.bracket_of(1), 'Junior (1-3 yrs)')
        self.assertEqual(br.bracket_of(2), 'Junior (1-3 yrs)')
        self.assertEqual(br.bracket_of(3), 'Mid-Level (3-5 yrs)')
        self.assertEqual(br.bracket_of(12), 'Principal/Director (12+ yrs)')


class Trim(unittest.TestCase):
    def test_trim_removes_12_and_1e23(self):
        # 12 and 1e23 are the real INR extremes found in research; they fail the hard bounds first,
        # so exercise the trim directly as well.
        realistic = [800_000, 900_000, 1_000_000, 1_100_000, 1_200_000, 1_300_000, 1_500_000, 2_000_000]
        self.assertEqual(sorted(br.trim_outliers(realistic + [12, int(1e23)])), sorted(realistic))
        self.assertEqual(kept_ctcs([row(rid=i, comp=str(c)) for i, c in enumerate(realistic + [12, 1e23])]),
                         realistic)

    def test_trim_catches_in_bounds_outlier(self):
        realistic = [1_000_000 + 50_000 * i for i in range(10)]
        self.assertNotIn(40_000_000, br.trim_outliers(realistic + [40_000_000]))

    def test_all_identical_family_kept(self):
        self.assertEqual(br.trim_outliers([1_000_000] * 5), [1_000_000] * 5)

    def test_log_space_keeps_genuine_high_earner(self):
        vals = [500_000, 800_000, 1_000_000, 1_500_000, 2_500_000, 4_000_000, 6_000_000]
        self.assertEqual(sorted(br.trim_outliers(vals)), vals)

    def test_empty(self):
        self.assertEqual(br.trim_outliers([]), [])
        self.assertTrue(math.isfinite(br.SIGMA_FLOOR))


class Cli(unittest.TestCase):
    def test_bom_header_found(self):
        code, written = run_main(to_csv([row(rid=7)]), bom=True)
        self.assertEqual(code, 0)
        self.assertEqual(written, 'source_row_id,role,experience_years,ctc\n7,Backend Engineer,3,1000000\n')

    def test_missing_column_exits_1(self):
        code, _ = run_main('ResponseId,Country\n1,India\n')
        self.assertEqual(code, 1)

    def test_repo_path_exits_2(self):
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(br.main(['--input', str(Path(br.__file__).resolve())]), 2)

    def test_lfs_pointer_exits_1(self):
        code, _ = run_main('version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 1\n')
        self.assertEqual(code, 1)

    def test_hash_mismatch_exits_1_without_skip(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'in.csv'
            p.write_text(to_csv([row()]), encoding='utf-8')
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(br.main(['--input', str(p), '--out', str(Path(tmp) / 'o')]), 1)


if __name__ == '__main__':
    unittest.main()
