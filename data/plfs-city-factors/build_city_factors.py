#!/usr/bin/env python3
"""Build city_factors.csv and build_report.json from PLFS 2023-24 (perv1.csv, first-visit person file).

Derived from PLFS 2023-24, National Statistics Office, MoSPI, under the MoSPI Data Access Agreement
(non-commercial use). See README.md. The raw microdata is NOT in this repo and never leaves PLFS_DIR.

Python standard library only. The script is structurally incapable of emitting unit-level data:
  * the only output sink is emit(); the only files written are the two aggregate files;
  * every count that is printed or written goes through agg_count() (below 30 it becomes '<30');
  * a Row never renders its contents, and errors report class names and column names, never values.

    PLFS_DIR=<folder holding perv1.csv>  python build_city_factors.py [--counts-only] [--out <dir>]

Exit codes: 0 ok, 1 bad input/env, 2 PLFS_DIR inside the repo, 3 national group under floor,
4 header/anchor mismatch, 5 invalid weight field, 6 code gate failed, 7 implausible ratio,
8 parse-drop ceiling, 9 floor violation, 10 undecodable byte, 70 unexpected error.
"""
import argparse
import csv
import hashlib
import json
import math
import os
import sys
import tempfile
from collections import Counter
from pathlib import Path

SCRIPT_VERSION = '1.0.0'
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[1]  # data/plfs-city-factors/this file -> repo root

SOURCE = 'plfs_2023_24'
SOURCE_VERSION = '2023-24'
REFERENCE_PERIOD = '2023-07 to 2024-06'
INPUT_FILE = 'perv1.csv'

MIN_PLFS_RESPONDENTS = 30  # publication floor: unweighted sampled persons
SHRINK_K = 30  # separate constant from the floor on purpose; written to build_report.json
AGE_MIN, AGE_MAX = 18, 60
URBAN = '2'
REGULAR_SALARIED = '31'
NCO = ('251', '252')  # the group named in the Data Access Agreement application; do not broaden
RATIO_BOUNDS = (0.5, 2.0)
NATIONAL_MEDIAN_BOUNDS = (5_000, 500_000)  # Rs per month, plausibility gate only (never printed)
PARSE_DROP_CEILING = 0.01
FACTOR_DECIMALS = 2

# Eight header names (CSV header line) that must sit at these 1-based layout positions.
ANCHORS = {6: 'state_perv1', 7: 'distcode_perv1', 8: 'nss_region_perv1', 36: 'b5pt1q8_perv1',
           136: 'NSS_perv1', 137: 'NSC_perv1', 138: 'mult_perv1', 139: 'no_qtr_perv1'}
N_COLUMNS = 139
# 1-based layout position (Srl) of each column used.
SRL = {'qtr': 3, 'sector': 5, 'state': 6, 'district': 7, 'fsu': 13, 'age': 20, 'pas': 32,
       'ocu_pas': 34, 'acws': 131, 'ocu_cws': 133, 'ern': 134, 'nss': 136, 'nsc': 137,
       'mult': 138, 'no_qtr': 139}
COL = {k: v - 1 for k, v in SRL.items()}

# City key (as in backend role-matching.ts) -> PLFS (state, district), zero-padded, 2011-style codes.
# ponytail: district groups are a judgement (README table); edit here and rebuild to change them.
CITY_DISTRICTS = {
    'bangalore': [('29', '18')],
    'mumbai': [('27', '22'), ('27', '21'), ('27', '23')],
    'delhi ncr': [('07', f'{d:02d}') for d in range(1, 10)] + [('06', '18'), ('06', '20'), ('09', '09'), ('09', '10')],
    'hyderabad': [('36', '22'), ('36', '23'), ('36', '21')],
    'pune': [('27', '25')],
    'chennai': [('33', '02'), ('33', '03'), ('33', '01')],
}
PAIR_TO_CITY = {p: c for c, ps in CITY_DISTRICTS.items() for p in ps}
CITIES = list(CITY_DISTRICTS)


class PipelineError(Exception):
    def __init__(self, message, code=1):
        super().__init__(message)
        self.code = code


class FloorViolation(Exception):
    """A record with fewer than MIN_PLFS_RESPONDENTS respondents tried to reach the output."""


# ---- the only output sink -------------------------------------------------------------------

def emit(text):
    """Only code that writes to stdout. Callers pass literals, column names, line numbers, aggregates."""
    sys.stdout.write(f'{text}\n')


def _excepthook(exc_type, exc, tb):  # no message, no traceback: exceptions can embed cell values
    emit(f'unhandled {exc_type.__name__}; details withheld')


sys.excepthook = _excepthook
sys.tracebacklimit = 0


class Row:
    """One respondent's needed fields. Never renders its contents."""
    __slots__ = ('city', 'qtr', 'ern', 'w', 'fsu')

    def __init__(self, city, qtr, ern, w, fsu):
        self.city, self.qtr, self.ern, self.w, self.fsu = city, qtr, ern, w, fsu

    def __repr__(self):
        return '<row>'

    __str__ = __repr__

    def __format__(self, spec):
        return '<row>'


def agg_count(n):
    """The only way a count reaches an output: an int >= 30, else the text '<30'."""
    return n if n >= MIN_PLFS_RESPONDENTS else '<30'


def collapse(counter):
    """Counts per category, categories under the floor merged into one aggregate bucket."""
    out = {k: v for k, v in sorted(counter.items()) if v >= MIN_PLFS_RESPONDENTS}
    rest = sum(v for v in counter.values() if v < MIN_PLFS_RESPONDENTS)
    if rest:
        out['other (<30 each)'] = agg_count(rest)
    return out


# ---- input guard ----------------------------------------------------------------------------

def resolve_plfs_dir(env=None):
    """PLFS_DIR (no default) -> resolved directory containing perv1.csv; refuses anything touching the repo."""
    env = os.environ if env is None else env
    raw = env.get('PLFS_DIR', '')
    if not raw.strip():
        raise PipelineError('PLFS_DIR is not set', 1)
    try:
        d = Path(raw).resolve(strict=True)  # follows symlinks/junctions, normalises case and '..'
    except OSError:
        raise PipelineError('PLFS_DIR does not exist', 1) from None
    repo = REPO_ROOT.resolve()
    try:
        common = os.path.normcase(os.path.commonpath([str(repo), str(d)]))
    except ValueError:  # different drive => cannot be inside the repo
        common = None
    # inside the repo, or an ancestor that contains it
    if common in (os.path.normcase(str(repo)), os.path.normcase(str(d))):
        raise PipelineError('PLFS_DIR must be outside the repository', 2)
    if not d.is_dir() or not (d / INPUT_FILE).is_file():
        raise PipelineError(f'{INPUT_FILE} not found in PLFS_DIR', 1)
    return d


# ---- weights, median, shrinkage -------------------------------------------------------------

def weight_int(mult, nss, nsc, no_qtr):
    """README weight (mult/100 if nss==nsc else mult/200) / no_qtr, times 2400 so it is an exact integer.
    The constant factor cancels in every median and ratio."""
    if mult <= 0 or not 1 <= nss <= nsc or no_qtr not in (1, 2, 3, 4):
        raise PipelineError('invalid weight field', 5)
    d = 100 if nss == nsc else 200
    return mult * (2400 // (d * no_qtr))


def weighted_median(pairs):
    """pairs: (value, integer weight). Midpoint of the two middle values on an exact half."""
    acc = {}
    for v, w in pairs:
        acc[v] = acc.get(v, 0) + w
    vals = sorted(acc)
    total = sum(acc.values())
    cum = 0
    for i, v in enumerate(vals):
        cum += acc[v]
        if 2 * cum >= total:
            if 2 * cum == total and i + 1 < len(vals):
                return (v + vals[i + 1]) / 2
            return v
    raise ValueError('empty group')


def shrink(raw_ratio, n, k=SHRINK_K):
    """Shrink toward 1.0 in log space. Returns (lambda, unrounded factor)."""
    lam = n / (n + k)
    return lam, math.exp(lam * math.log(raw_ratio))


def make_record(city, n, raw_ratio=None):
    if n < MIN_PLFS_RESPONDENTS:
        return {'city': city, 'status': 'suppressed', 'n': n}
    lam, f = shrink(raw_ratio, n)
    return {'city': city, 'status': 'published', 'n': n, 'raw_ratio': round(raw_ratio, 3),
            'shrinkage_weight': round(lam, 3), 'factor': round(f, FACTOR_DECIMALS)}


def publishable(rec):
    """The only gate to the writer. Explicit exception (not assert) so python -O cannot strip it."""
    if rec['status'] != 'published':
        return False
    if rec['n'] < MIN_PLFS_RESPONDENTS:
        raise FloorViolation('floor violation')
    return True


# ---- scan -----------------------------------------------------------------------------------

def to_int(s):
    try:
        return int(s.strip())
    except ValueError:
        return None


def open_input(path):
    return open(path, encoding='utf-8-sig', errors='strict', newline='')


def check_header(header):
    """Header names are allowed output; any mismatch stops the run."""
    bad = [p for p, name in ANCHORS.items() if len(header) < p or header[p - 1].strip().lower() != name.lower()]
    if len(header) != N_COLUMNS or bad:
        found = {p: header[p - 1].strip() for p in ANCHORS if len(header) >= p}
        raise PipelineError(f'header mismatch: {len(header)} columns; names at anchor positions: {found}', 4)


def scan(path):
    """One streaming pass. Returns aggregate counters and the kept Rows (in memory only)."""
    s = {'persons': 0, 'urban': 0, 'age': 0, 'cws': 0, 'nco': 0, 'earn': 0, 'usable': 0,
         'sector_by_state': Counter(), 'acws_earners': Counter(), 'ocu_len_ok': True,
         'dist_persons': Counter(), 'branch_eq': 0, 'no_qtr': Counter(),
         'cand': Counter(), 'drop': Counter(),  # parse-drop ceiling, keyed by city or None
         'usual': Counter(), 'rows': []}
    ncols = N_COLUMNS
    with open_input(path) as f:
        reader = csv.reader(f)
        try:
            check_header(next(reader))
            for r in reader:
                if len(r) != ncols:
                    raise PipelineError(f'column count mismatch at line {reader.line_num}', 4)
                s['persons'] += 1
                sec = r[COL['sector']].strip()
                st = r[COL['state']].strip().zfill(2)
                dist = r[COL['district']].strip().zfill(2)
                s['sector_by_state'][(st, sec)] += 1
                city = PAIR_TO_CITY.get((st, dist))
                if city:
                    s['dist_persons'][(st, dist)] += 1
                if sec != URBAN:
                    continue
                s['urban'] += 1
                age = to_int(r[COL['age']])
                age_ok = age is not None and AGE_MIN <= age <= AGE_MAX
                ern_txt = r[COL['ern']].strip()
                ern = to_int(ern_txt)
                acws = r[COL['acws']].strip()
                ocu = r[COL['ocu_cws']].strip()
                # usual-status variant (counts only; no ratio is ever computed from it)
                if (age_ok and r[COL['pas']].strip() == REGULAR_SALARIED
                        and r[COL['ocu_pas']].strip() in NCO and ern is not None and ern > 0):
                    s['usual'][city] += 1
                # code gate input: status codes among earners of the purpose group, before the status filter
                if age_ok and ocu in NCO and ern is not None and ern > 0:
                    s['acws_earners'][acws] += 1
                if acws != REGULAR_SALARIED:
                    continue
                s['cws'] += 1
                if age_ok and len(ocu) != 3:
                    s['ocu_len_ok'] = False
                if ocu not in NCO:
                    continue
                s['nco'] += 1
                # parse-drop ceiling: candidates are urban + regular salaried + NCO; a drop is a
                # non-integer age, or a non-blank non-integer earnings value (blank/0/negative are just excluded)
                s['cand'][city] += 1
                if age is None or (ern_txt != '' and ern is None):
                    s['drop'][city] += 1
                if not age_ok:
                    continue
                s['age'] += 1
                if ern is None or ern <= 0:
                    continue
                s['earn'] += 1
                mult, nss, nsc, nq = (to_int(r[COL[k]]) for k in ('mult', 'nss', 'nsc', 'no_qtr'))
                for name, v in (('mult', mult), ('nss', nss), ('nsc', nsc), ('no_qtr', nq)):
                    if v is None:
                        raise PipelineError(f'invalid weight field, column {name}, line {reader.line_num}', 5)
                try:
                    w = weight_int(mult, nss, nsc, nq)
                except PipelineError:
                    raise PipelineError(f'invalid weight field, line {reader.line_num}', 5) from None
                s['usable'] += 1
                s['branch_eq'] += nss == nsc
                s['no_qtr'][nq] += 1
                s['rows'].append(Row(city, r[COL['qtr']].strip(), ern, w, (st, r[COL['fsu']].strip())))
        except UnicodeDecodeError:  # its message holds the offending bytes: report the class only
            raise PipelineError(f'undecodable byte near line {reader.line_num}', 10) from None
        except csv.Error:
            raise PipelineError(f'csv error near line {reader.line_num}', 1) from None
    return s


# ---- build ----------------------------------------------------------------------------------

def file_digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def code_gate(s):
    """G2: the layout workbook has no labels, so verify the code meanings from aggregates."""
    sec = Counter()
    for (st, code), n in s['sector_by_state'].items():
        sec[code] += n
    ok = set(sec) <= {'1', '2'}
    for st, code in (('07', None), ('04', None)):
        by = {c: n for (x, c), n in s['sector_by_state'].items() if x == st}
        if not by:
            ok = False
        elif st == '07':
            ok = ok and max(by, key=by.get) == URBAN
        else:
            ok = ok and set(by) == {URBAN}
    ae = s['acws_earners']
    total = sum(ae.values())
    ok = ok and total > 0 and ae[REGULAR_SALARIED] / total >= 0.8 and s['ocu_len_ok']
    return ok, {'sector_codes': collapse(sec), 'acws_among_earners': collapse(ae),
                'occupation_codes_3_chars': s['ocu_len_ok'], 'passed': ok}


def build(s, counts_only=False):
    rows = s['rows']
    nat_n = len(rows)
    report = {
        'source': SOURCE, 'source_version': SOURCE_VERSION, 'script_version': SCRIPT_VERSION,
        'reference_period': REFERENCE_PERIOD,
        'constants': {'K': SHRINK_K, 'floor': MIN_PLFS_RESPONDENTS, 'age_min': AGE_MIN, 'age_max': AGE_MAX,
                      'acws': REGULAR_SALARIED, 'nco': list(NCO), 'factor_decimals': FACTOR_DECIMALS},
        'funnel': {name: agg_count(s[k]) for name, k in (
            ('persons', 'persons'), ('urban', 'urban'), ('urban_cws_31', 'cws'), ('nco_251_252', 'nco'),
            ('age_18_60', 'age'), ('earnings_positive', 'earn'), ('usable_weight', 'usable'))},
    }
    ok, gate = code_gate(s)
    report['code_gate'] = gate
    if not ok:
        raise PipelineError('code gate failed (sector/status/occupation codes not as expected)', 6)
    per_city_n = Counter(r.city for r in rows if r.city)
    report['weights'] = {
        'branch_nss_eq_nsc_share': round(s['branch_eq'] / s['usable'], 3) if s['usable'] else None,
        'no_qtr_histogram': collapse(s['no_qtr'])}
    # ponytail: coverage is persons per mapped district (any status), not a workbook diff; a mapped pair
    # that shows '<30' or is missing is the signal that the district code list needs a look.
    report['geography'] = {
        'district_persons': {f'{a}-{b}': agg_count(n) for (a, b), n in sorted(s['dist_persons'].items())},
        'mumbai_27_23_rows': agg_count(s['dist_persons'][('27', '23')]),
        'city_quarter_coverage': {c: {q: agg_count(n) for q, n in sorted(Counter(r.qtr for r in rows if r.city == c).items())}
                                  for c in CITIES}}
    drop_share = lambda c: (s['drop'][c] / s['cand'][c]) if s['cand'][c] >= MIN_PLFS_RESPONDENTS else 0.0
    nat_cand, nat_drop = sum(s['cand'].values()), sum(s['drop'].values())
    shares = [drop_share(c) for c in CITIES]
    nat_share = nat_drop / nat_cand if nat_cand >= MIN_PLFS_RESPONDENTS else 0.0
    report['parse_drops'] = {'national_share': round(nat_share, 3), 'max_city_share': round(max(shares), 3)}
    if nat_share > PARSE_DROP_CEILING or max(shares) > PARSE_DROP_CEILING:
        raise PipelineError('parse-drop ceiling exceeded', 8)
    if nat_n < MIN_PLFS_RESPONDENTS:
        raise PipelineError('national group under floor', 3)
    report['national'] = {'n': nat_n, 'n_fsu': agg_count(len({r.fsu for r in rows}))}
    if counts_only:
        report['counts_only'] = {
            'narrow': {c: agg_count(per_city_n[c]) for c in CITIES},
            'usual_status_variant': {c: agg_count(s['usual'][c]) for c in CITIES}}
        return report, []
    nat_med = weighted_median([(r.ern, r.w) for r in rows])
    if not NATIONAL_MEDIAN_BOUNDS[0] <= nat_med <= NATIONAL_MEDIAN_BOUNDS[1]:
        raise PipelineError('implausible national median (value withheld)', 7)
    tw = sum(r.w for r in rows)
    mean = sum(r.w * math.log(r.ern) for r in rows) / tw
    sd = math.sqrt(sum(r.w * (math.log(r.ern) - mean) ** 2 for r in rows) / tw)
    report['dispersion'] = {'national_log_sd': round(sd, 3),
                            'implied_K_at_tau_0_15': round((1.2533 * sd / 0.15) ** 2, 1)}
    records, detail = [], []
    for c in CITIES:
        crows = [(r.ern, r.w) for r in rows if r.city == c]
        n = len(crows)
        raw = weighted_median(crows) / nat_med if n >= MIN_PLFS_RESPONDENTS else None
        if raw is not None and not RATIO_BOUNDS[0] <= raw <= RATIO_BOUNDS[1]:
            raise PipelineError(f'implausible ratio for {c} (value withheld)', 7)
        rec = make_record(c, n, raw)
        records.append(rec)
        d = {'city': c, 'districts': [f'{a}-{b}' for a, b in CITY_DISTRICTS[c]], 'status': rec['status'],
             'n': agg_count(n)}
        if rec['status'] == 'published':
            d.update(n_fsu=agg_count(len({r.fsu for r in rows if r.city == c})), raw_ratio=rec['raw_ratio'],
                     shrinkage_weight=rec['shrinkage_weight'], factor=rec['factor'],
                     factor_if_K15=round(shrink(raw, n, 15)[1], 2), factor_if_K60=round(shrink(raw, n, 60)[1], 2))
        detail.append(d)
    report['cities'] = detail
    return report, records


def write_outputs(records, report, out_dir):
    """Atomic: temp files in out_dir, then rename. Every record passes publishable() first."""
    lines = ['city,status,n_respondents,raw_ratio,shrinkage_weight,factor']
    for rec in records:
        if publishable(rec):
            lines.append(f"{rec['city']},published,{rec['n']},{rec['raw_ratio']:.3f},{rec['shrinkage_weight']:.3f},{rec['factor']:.2f}")
        else:
            lines.append(f"{rec['city']},suppressed,<30,,,")
    payloads = {'city_factors.csv': '\n'.join(lines) + '\n', 'build_report.json': json.dumps(report, indent=2) + '\n'}
    tmps = {}
    try:
        for name, text in payloads.items():
            fd, tmp = tempfile.mkstemp(dir=out_dir, suffix='.tmp')
            tmps[name] = tmp
            with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as fh:
                fh.write(text)
        for name, tmp in tmps.items():
            os.replace(tmp, Path(out_dir) / name)
    finally:
        for tmp in tmps.values():
            if os.path.exists(tmp):
                os.remove(tmp)


def run(argv, env=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--counts-only', action='store_true')
    ap.add_argument('--out', default=str(SCRIPT_DIR))
    args = ap.parse_args(argv)
    out = Path(args.out).resolve()
    if out != SCRIPT_DIR and SCRIPT_DIR not in out.parents:
        raise PipelineError('--out must be inside the script directory', 1)
    path = resolve_plfs_dir(env) / INPUT_FILE
    s = scan(path)
    report, records = build(s, args.counts_only)
    report['input'] = {'file': INPUT_FILE, 'size_bytes': path.stat().st_size, 'sha256': file_digest(path),
                       'columns': N_COLUMNS, 'anchors_ok': True}
    emit(f"funnel: {json.dumps(report['funnel'])}")
    if args.counts_only:
        emit(f"counts-only: {json.dumps(report['counts_only'])}")
        (out / 'build_report.counts.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        return 0
    write_outputs(records, report, out)
    emit('city | n | raw ratio | shrunk factor')
    for d in report['cities']:
        emit(f"{d['city']} | {d['n']} | {d.get('raw_ratio', '-')} | {d.get('factor', '-')}")
    return 0


def main(argv=None, env=None):
    try:
        return run(sys.argv[1:] if argv is None else argv, env)
    except PipelineError as e:  # messages are built from literals, column names and line numbers only
        emit(f'error: {e}')
        return e.code
    except FloorViolation:
        emit('error: floor violation')
        return 9
    except SystemExit as e:  # argparse
        return e.code if isinstance(e.code, int) else 1
    except BaseException as e:  # never str(e) or a traceback: exceptions can embed cell values
        emit(f'error: unexpected {type(e).__name__}; details withheld')
        return 70


if __name__ == '__main__':
    sys.exit(main())
