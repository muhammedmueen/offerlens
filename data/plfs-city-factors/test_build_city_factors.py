"""Tests for build_city_factors.py. SYNTHETIC fixtures only: every row below is fabricated in this file
with made-up codes and values. No real PLFS row, and nothing derived from one, appears here.

Run:  cd data/plfs-city-factors && python -m unittest -v test_build_city_factors
      (also run once with `python -O -m unittest` to prove the floor guard survives assert-stripping)
"""
import contextlib
import csv
import io
import json
import math
import os
import random
import re
import statistics
import subprocess
import sys
import tempfile
import unittest
from fractions import Fraction
from pathlib import Path
from unittest import mock

import build_city_factors as b

SENT_ERN, SENT_FSU, SENT_MULT = 277701, 888001, 7777711  # distinctive sentinels, all made up


def header(n=b.N_COLUMNS):
    h = [f'col{i}' for i in range(1, n + 1)]
    for pos, name in b.ANCHORS.items():
        if pos <= n:
            h[pos - 1] = name
    return h


def row(**kw):
    """One fabricated 139-column person row. Defaults describe a kept Bangalore respondent."""
    v = dict(qtr='1', sector='2', state='29', district='18', fsu=str(SENT_FSU), age='30', pas='31',
             ocu_pas='251', acws='31', ocu_cws='251', ern=str(SENT_ERN), nss='1', nsc='1',
             mult=str(SENT_MULT), no_qtr='4')
    v.update({k: str(x) for k, x in kw.items()})
    r = [''] * b.N_COLUMNS
    for k, x in v.items():
        r[b.COL[k]] = x
    return r


def gate_rows():
    """Persons that satisfy the code gate (urban majority in 07, only urban in 04) but are not in the group."""
    return ([row(state='04', district='01', acws='11', ocu_cws='999') for _ in range(3)]
            + [row(state='07', district='30', acws='11', ocu_cws='999') for _ in range(5)]
            + [row(state='07', district='30', sector='1', acws='11', ocu_cws='999')])


def city_rows(city, n, base, step=100, **kw):
    st, d = b.CITY_DISTRICTS[city][0]
    return [row(state=st, district=d, ern=base + step * i, **kw) for i in range(n)]


def write_dir(rows, hdr=None, raw=None, decoys=True):
    tmp = tempfile.TemporaryDirectory()
    p = Path(tmp.name)
    if raw is not None:
        (p / b.INPUT_FILE).write_bytes(raw)
    else:
        with open(p / b.INPUT_FILE, 'w', encoding='utf-8', newline='') as f:
            w = csv.writer(f)
            w.writerow(hdr or header())
            w.writerows(rows)
    if decoys:
        for name in ('perrv.csv', 'hhv1.csv', 'hhrv.csv'):
            (p / name).write_text('decoy\n', encoding='utf-8')
    return tmp


def run_main(rows=None, args=(), **kw):
    tmp = write_dir(rows, **kw)
    out = tempfile.TemporaryDirectory(dir=b.SCRIPT_DIR)
    so, se = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(so), contextlib.redirect_stderr(se):
        code = b.main(['--out', out.name, *args], env={'PLFS_DIR': tmp.name})
    files = {p.name: p.read_text(encoding='utf-8') for p in Path(out.name).iterdir()}
    tmp.cleanup()
    out.cleanup()
    return code, so.getvalue(), se.getvalue(), files


def ok_rows(n=35):
    return gate_rows() + city_rows('bangalore', n, 40000) + city_rows('pune', n, 50000)


class WeightedMedian(unittest.TestCase):
    def test_matches_expansion_reference(self):
        rng = random.Random(1)
        for _ in range(300):
            pairs = [(rng.randint(1, 12), rng.randint(1, 6)) for _ in range(rng.randint(1, 9))]
            expanded = [v for v, w in pairs for _ in range(w)]
            self.assertEqual(b.weighted_median(pairs), statistics.median(expanded))
            rng.shuffle(pairs)
            self.assertEqual(b.weighted_median(pairs), statistics.median(expanded))

    def test_exact_half_and_single(self):
        self.assertEqual(b.weighted_median([(10, 1), (20, 1)]), 15)
        self.assertEqual(b.weighted_median([(10, 2), (20, 1), (30, 1)]), 15)
        self.assertEqual(b.weighted_median([(7, 5)]), 7)

    def test_scaling_by_2400_changes_nothing(self):
        rng = random.Random(2)
        for _ in range(300):
            recs = [(rng.randint(1, 50), rng.randint(1, 9) * 100, rng.choice([100, 200]), rng.randint(1, 4))
                    for _ in range(rng.randint(1, 8))]  # value, mult, d, no_qtr
            ints = [(v, m * (2400 // (d * q))) for v, m, d, q in recs]
            fr = {}
            for v, m, d, q in recs:  # README weight as an exact fraction
                fr[v] = fr.get(v, 0) + Fraction(m, d * q)
            vals, tot, cum = sorted(fr), sum(fr.values()), 0
            ref = None
            for i, v in enumerate(vals):
                cum += fr[v]
                if 2 * cum >= tot:
                    ref = Fraction(v + vals[i + 1], 2) if 2 * cum == tot and i + 1 < len(vals) else Fraction(v)
                    break
            self.assertEqual(Fraction(b.weighted_median(ints)), ref)


class Weights(unittest.TestCase):
    def test_table(self):
        for q in (1, 2, 3, 4):
            self.assertEqual(b.weight_int(1000, 1, 1, q), 1000 * 2400 // (100 * q))
            self.assertEqual(b.weight_int(1000, 1, 2, q), 1000 * 2400 // (200 * q))
            for d in (100, 200):
                self.assertEqual(Fraction(b.weight_int(1000, 1, 1 if d == 100 else 2, q), 2400), Fraction(1000, d * q))

    def test_invalid(self):
        for bad in ((0, 1, 1, 4), (10, 2, 1, 4), (10, 1, 1, 0), (10, 1, 1, 5), (10, 0, 1, 4)):
            with self.assertRaises(b.PipelineError) as cm:
                b.weight_int(*bad)
            self.assertEqual(cm.exception.code, 5)


class Shrinkage(unittest.TestCase):
    def test_formula(self):
        lam, f = b.shrink(1.5, 30)
        self.assertAlmostEqual(lam, 0.5)
        self.assertAlmostEqual(f, math.exp(0.5 * math.log(1.5)))
        self.assertAlmostEqual(b.shrink(1.5, 120)[0], 0.8)

    def test_symmetry_and_target(self):
        self.assertAlmostEqual(b.shrink(2.0, 50)[1] * b.shrink(0.5, 50)[1], 1.0)
        self.assertAlmostEqual(b.shrink(1.0, 50)[1], 1.0)


class Floor(unittest.TestCase):
    def test_agg_count(self):
        self.assertEqual(b.agg_count(29), '<30')
        self.assertEqual(b.agg_count(0), '<30')
        self.assertEqual(b.agg_count(30), 30)

    def test_records(self):
        self.assertEqual(b.make_record('pune', 29)['status'], 'suppressed')
        self.assertNotIn('factor', b.make_record('pune', 29))
        self.assertEqual(b.make_record('pune', 30, 1.1)['status'], 'published')

    def test_publishable_and_writer_raise_floor_violation(self):
        bad = {'city': 'pune', 'status': 'published', 'n': 29, 'raw_ratio': 1.1, 'shrinkage_weight': 0.5, 'factor': 1.05}
        with self.assertRaises(b.FloorViolation):  # explicit exception, not AssertionError: survives python -O
            b.publishable(bad)
        with tempfile.TemporaryDirectory(dir=b.SCRIPT_DIR) as d:
            with self.assertRaises(b.FloorViolation):
                b.write_outputs([bad], {}, d)
            self.assertEqual(os.listdir(d), [])

    def test_floor_guard_survives_python_dash_O(self):
        if sys.flags.optimize:
            self.skipTest('already running under -O (avoids recursion)')
        r = subprocess.run([sys.executable, '-O', '-m', 'unittest', 'test_build_city_factors.Floor'],
                           cwd=b.SCRIPT_DIR, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, 'floor tests failed under python -O')

    def test_city_under_floor_is_suppressed_in_output(self):
        code, _, _, files = run_main(gate_rows() + city_rows('bangalore', 35, 40000) + city_rows('pune', 29, 50000))
        self.assertEqual(code, 0)
        self.assertIn('pune,suppressed,<30,,,\n', files['city_factors.csv'])
        self.assertRegex(files['city_factors.csv'], r'bangalore,published,35,')


class Filters(unittest.TestCase):
    def test_funnel_and_survivors(self):
        rows = (city_rows('bangalore', 40, 40000)
                + [row(ocu_cws=' 251 ', ern=45000)]                      # padded code is stripped, kept
                + [row(state='02', district='55', ern=46000)]            # unmapped district: national only
                + [row(sector='1'), row(age='17'), row(age='61'), row(age=''), row(acws='71'),
                   row(ocu_cws='250'), row(ocu_cws='253'), row(ocu_cws='2511'),
                   row(ern='0'), row(ern=''), row(ern='-5')])
        tmp = write_dir(rows)
        s = b.scan(Path(tmp.name) / b.INPUT_FILE)
        tmp.cleanup()
        self.assertEqual(len(s['rows']), 42)
        self.assertEqual(sum(1 for r in s['rows'] if r.city == 'bangalore'), 41)
        self.assertEqual(sum(1 for r in s['rows'] if r.city is None), 1)
        self.assertEqual(s['persons'], len(rows))
        self.assertEqual(s['urban'], len(rows) - 1)

    def test_district_mapping(self):
        pairs = [p for ps in b.CITY_DISTRICTS.values() for p in ps]
        self.assertEqual(len(pairs), len(set(pairs)))
        self.assertTrue(all(re.fullmatch(r'\d\d', x) for p in pairs for x in p))
        self.assertEqual(list(b.CITY_DISTRICTS), ['bangalore', 'mumbai', 'delhi ncr', 'hyderabad', 'pune', 'chennai'])
        self.assertIn(('27', '23'), b.CITY_DISTRICTS['mumbai'])


class Anchors(unittest.TestCase):
    def test_wrong_name_and_wrong_width(self):
        h = header()
        h[b.COL['mult']] = 'not_mult'
        code, out, _, files = run_main(ok_rows(), hdr=h)
        self.assertEqual(code, 4)
        self.assertIn('not_mult', out)  # header names are allowed output
        self.assertEqual(files, {})
        code, *_ = run_main([], hdr=header(138))
        self.assertEqual(code, 4)


class EndToEnd(unittest.TestCase):
    def test_factors_match_independent_reference(self):
        rows = ok_rows(35)
        code, out, _, files = run_main(rows)
        self.assertEqual(code, 0, out)
        bang = [40000 + 100 * i for i in range(35)]
        pune = [50000 + 100 * i for i in range(35)]
        nat = statistics.median(bang + pune)  # equal weights => plain median
        raw = statistics.median(bang) / nat
        exp = round(math.exp(35 / 65 * math.log(raw)), 2)
        line = [l for l in files['city_factors.csv'].splitlines() if l.startswith('bangalore')][0]
        self.assertEqual(line, f'bangalore,published,35,{round(raw, 3):.3f},{35 / 65:.3f},{exp:.2f}')
        lines = files['city_factors.csv'].splitlines()
        self.assertEqual(lines[0], 'city,status,n_respondents,raw_ratio,shrinkage_weight,factor')
        self.assertEqual(len(lines), 7)
        rep = json.loads(files['build_report.json'])
        self.assertEqual(rep['constants']['K'], 30)
        self.assertIn('factor_if_K60', rep['cities'][0])

    def test_implausible_ratio_exits_7_without_number(self):
        rows = gate_rows() + city_rows('bangalore', 35, 480000) + city_rows('pune', 100, 20000)
        code, out, _, files = run_main(rows)
        self.assertEqual(code, 7)
        self.assertIn('bangalore', out)
        self.assertFalse(re.search(r'\d', out.split('error:')[1]), out)
        self.assertEqual(files, {})

    def test_parse_drop_ceiling(self):
        base = gate_rows() + city_rows('bangalore', 200, 40000)
        code, out, _, _ = run_main(base + [row(ern='abc') for _ in range(4)])  # ~2% of candidates
        self.assertEqual(code, 8)
        self.assertNotIn('abc', out)
        code, _, _, files = run_main(base + [row(ern='abc')])  # ~0.5%
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(files['build_report.json'])['parse_drops']['national_share'], 0.005)

    def test_counts_only_keys(self):
        code, out, _, files = run_main(ok_rows(), args=['--counts-only'])
        self.assertEqual(code, 0)
        self.assertEqual(set(files), {'build_report.counts.json'})
        rep = json.loads(files['build_report.counts.json'])
        self.assertEqual(set(rep['counts_only']), {'narrow', 'usual_status_variant'})
        self.assertNotIn('cities', rep)

    def test_report_counts_are_floor_safe(self):
        _, _, _, files = run_main(ok_rows(35))
        rep = json.loads(files['build_report.json'])
        for q in rep['geography']['city_quarter_coverage'].values():
            for v in q.values():
                self.assertTrue(v == '<30' or v >= 30)
        for v in (rep['geography']['mumbai_27_23_rows'], rep['national']['n_fsu']):
            self.assertTrue(v == '<30' or v >= 30)
        self.assertNotIn('none', json.dumps(rep).lower())

    def test_atomic_outputs(self):
        with mock.patch('os.replace', side_effect=OSError):
            tmp = write_dir(ok_rows())
            out = tempfile.TemporaryDirectory(dir=b.SCRIPT_DIR)
            with contextlib.redirect_stdout(io.StringIO()):
                code = b.main(['--out', out.name], env={'PLFS_DIR': tmp.name})
            self.assertNotEqual(code, 0)
            self.assertEqual(os.listdir(out.name), [])
            tmp.cleanup()
            out.cleanup()

    def test_only_perv1_is_opened(self):
        tmp = write_dir(ok_rows())
        out = tempfile.TemporaryDirectory(dir=b.SCRIPT_DIR)
        opened, real = [], open

        def spy(path, *a, **k):
            opened.append(str(path))
            return real(path, *a, **k)

        with mock.patch('builtins.open', spy), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(b.main(['--out', out.name], env={'PLFS_DIR': tmp.name}), 0)
        mine = [Path(p).name for p in opened if tmp.name in p]
        self.assertTrue(mine and set(mine) == {b.INPUT_FILE}, mine)
        tmp.cleanup()
        out.cleanup()


class PlfsDirGuard(unittest.TestCase):
    def code(self, env):
        with self.assertRaises(b.PipelineError) as cm:
            b.resolve_plfs_dir(env)
        return cm.exception.code

    def test_unset_blank_missing(self):
        self.assertEqual(self.code({}), 1)
        self.assertEqual(self.code({'PLFS_DIR': '  '}), 1)
        self.assertEqual(self.code({'PLFS_DIR': str(b.REPO_ROOT / 'no_such_dir_xyz')}), 1)

    def test_inside_repo_rejected_and_never_opened(self):
        data = b.REPO_ROOT / 'data'
        spellings = [str(data), str(data / '..' / 'data'), str(data) + os.sep, str(b.REPO_ROOT)]
        if os.name == 'nt':
            spellings.append(str(data).swapcase())
        for sp in spellings:
            with mock.patch('builtins.open') as op:
                self.assertEqual(self.code({'PLFS_DIR': sp}), 2, sp)
                op.assert_not_called()

    def test_directory_containing_repo_rejected(self):
        self.assertEqual(self.code({'PLFS_DIR': str(b.REPO_ROOT.parent)}), 2)

    def test_junction_or_symlink_into_repo(self):
        with tempfile.TemporaryDirectory() as t:
            link = Path(t) / 'link'
            try:
                if os.name == 'nt':
                    r = subprocess.run(['cmd', '/c', 'mklink', '/J', str(link), str(b.REPO_ROOT / 'data')],
                                       capture_output=True)
                    if r.returncode:
                        raise OSError
                else:
                    os.symlink(b.REPO_ROOT / 'data', link)
            except OSError:
                self.skipTest('OS refused to create a junction/symlink')
            self.assertEqual(self.code({'PLFS_DIR': str(link)}), 2)
            if os.name == 'nt':
                os.rmdir(link)

    def test_missing_file_and_valid_dir_and_other_drive(self):
        with tempfile.TemporaryDirectory() as t:
            self.assertEqual(self.code({'PLFS_DIR': t}), 1)
            (Path(t) / b.INPUT_FILE).write_text('x', encoding='utf-8')
            self.assertEqual(b.resolve_plfs_dir({'PLFS_DIR': t}), Path(t).resolve())
            with mock.patch('os.path.commonpath', side_effect=ValueError):
                self.assertEqual(b.resolve_plfs_dir({'PLFS_DIR': t}), Path(t).resolve())


class OutputHygiene(unittest.TestCase):
    SENTS = [str(SENT_ERN)[:5], str(SENT_FSU)[:5], str(SENT_MULT)]

    def assert_clean(self, *texts):
        for t in texts:
            for s in self.SENTS:
                self.assertNotIn(s, t)
            self.assertNotIn('Traceback', t)

    def test_success_path(self):
        code, out, err, files = run_main(ok_rows())
        rep = json.loads(files['build_report.json'])
        rep.pop('input')  # sha256 hex is random text, not a sentinel carrier
        self.assertEqual(code, 0)
        self.assert_clean(out, err, files['city_factors.csv'], json.dumps(rep))

    def test_failure_paths(self):
        bad_weight = ok_rows() + [row(mult='7777712x')]
        code, out, err, _ = run_main(bad_weight)
        self.assertEqual(code, 5)
        self.assert_clean(out, err)
        self.assertNotIn('7777712', out)
        h = header()
        h[b.COL['ern']] = 'ern_reg'
        raw = ('\n'.join([','.join(h), ','.join(['x'] * b.N_COLUMNS)])).encode()
        raw = raw.replace(b'x', b'\xff' + str(SENT_ERN).encode(), 1)  # invalid UTF-8 next to a sentinel
        code, out, err, _ = run_main(raw=raw, hdr=None)
        self.assertEqual(code, 10)
        self.assert_clean(out, err)

    def test_unexpected_exception_mid_loop(self):
        boom = RuntimeError(str(SENT_ERN))
        with mock.patch.object(b, 'weight_int', side_effect=boom):
            code, out, err, _ = run_main(ok_rows())
        self.assertEqual(code, 70)
        self.assertIn('RuntimeError', out)
        self.assert_clean(out, err)

    def test_exception_outside_main_via_excepthook(self):
        code = f"import build_city_factors; raise RuntimeError('{SENT_ERN}')"
        r = subprocess.run([sys.executable, '-c', code], cwd=b.SCRIPT_DIR, capture_output=True, text=True)
        self.assert_clean(r.stdout, r.stderr)
        self.assertIn('RuntimeError', r.stdout + r.stderr)

    def test_row_never_renders(self):
        r = b.Row('x', '1', SENT_ERN, SENT_MULT, ('29', str(SENT_FSU)))
        self.assertEqual((repr(r), str(r), f'{r}', f'{r!r}'), ('<row>',) * 4)

    def test_no_print_or_logging_outside_emit(self):
        src = (b.SCRIPT_DIR / 'build_city_factors.py').read_text(encoding='utf-8')
        self.assertNotIn('print(', src)
        self.assertNotIn('sys.stderr', src)
        self.assertNotIn('logging', src)
        self.assertEqual(src.count('sys.stdout'), 1)


class RepoHygiene(unittest.TestCase):
    def git(self, *a):
        try:
            return subprocess.run(['git', *a], cwd=b.REPO_ROOT, capture_output=True, text=True)
        except OSError:
            self.skipTest('git unavailable')

    def test_no_raw_files_tracked(self):
        r = self.git('ls-files')
        if r.returncode:
            self.skipTest('not a git checkout')
        stems = {'perv1', 'perrv', 'hhv1', 'hhrv'}
        bad = [f for f in r.stdout.splitlines()
               if Path(f).stem.lower() in stems or Path(f).name == 'build_report.counts.json']
        self.assertEqual(bad, [])

    def test_raw_names_are_ignored(self):
        for name in ('perv1.csv', 'perrv.csv', 'hhv1.csv', 'hhrv.csv', 'pfls/anything.csv',
                     'data/plfs-city-factors/perv1.csv', 'data/plfs-city-factors/build_report.counts.json'):
            r = self.git('check-ignore', '-q', name)
            if r.returncode == 128:
                self.skipTest('not a git checkout')
            self.assertEqual(r.returncode, 0, f'{name} is not git-ignored')

    def test_committed_output_shape(self):
        p = b.SCRIPT_DIR / 'city_factors.csv'
        if not p.exists():
            self.skipTest('city_factors.csv not built yet')
        lines = p.read_text(encoding='utf-8').splitlines()
        self.assertEqual(lines[0], 'city,status,n_respondents,raw_ratio,shrinkage_weight,factor')
        self.assertEqual([l.split(',')[0] for l in lines[1:]], b.CITIES)
        for l in lines[1:]:
            c = l.split(',')
            if c[1] == 'published':
                self.assertGreaterEqual(int(c[2]), b.MIN_PLFS_RESPONDENTS)
            else:
                self.assertEqual(c[1:], ['suppressed', '<30', '', '', ''])


if __name__ == '__main__':
    unittest.main()
