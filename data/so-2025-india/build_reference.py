#!/usr/bin/env python3
"""Build data/so-2025-india/reference_rows.csv from the Stack Overflow Developer Survey 2025.

Contains information from the Stack Overflow Developer Survey 2025 (Stack Exchange Inc.), made
available under the Open Database License (ODbL). See README.md in this directory.

Python standard library only. No LLM and no model-generated numbers: every salary in the output is an
observed survey value, or the row is dropped.

    python build_reference.py --input <path-to-results.csv> [--out <dir>] [--skip-hash]
    python build_reference.py --input <path-to-results.csv> --list-values DevType

Exit codes: 0 ok, 1 bad input or schema drift, 2 input path is inside the repo.
"""
import argparse
import csv
import hashlib
import json
import math
import statistics
import sys
from collections import Counter
from pathlib import Path

SCRIPT_VERSION = '1.0.0'
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[1]

# Provenance of the raw file (StackExchange/Survey, packages/archive/2025/results.csv, a Git LFS object).
SOURCE = 'so_survey_2025'
SOURCE_VERSION = '2025-07-29'  # release date from the archive README
EXPECTED_SIZE = 140_893_245
EXPECTED_SHA256 = '2d1f65308877282edfb4470520eabbc08cb499118432a3dcec6a66c086aa2baa'

REQUIRED_COLUMNS = ['ResponseId', 'Country', 'Currency', 'Employment', 'DevType', 'CompTotal', 'WorkExp']

COUNTRY = 'India'
CURRENCY_CODE = 'INR'
EMPLOYMENT = 'employed'
WORK_EXP_RANGE = (0, 50)
CTC_MIN, CTC_MAX = 100_000, 50_000_000  # hard bounds, whole rupees per year
OUTLIER_SIGMA = 3
SIGMA_FLOOR = 0.05  # same constant as backend salary.stats.ts; also covers MAD == 0
MAD_TO_SIGMA = 1.4826
LOW_TAIL_CTC = 300_000  # report-only: share of kept rows below 3,00,000

# Exact DevType string (lowercased, trimmed) -> seed role label (backend/src/db/seed-data.ts).
# DevType is single-valued in the 2025 file, so this is a one-to-one map. Everything else is dropped.
DEVTYPE_TO_ROLE = {
    'developer, full-stack': 'Full Stack Engineer',
    'developer, back-end': 'Backend Engineer',
    'developer, front-end': 'Frontend Engineer',
    'developer, mobile': 'Mobile Engineer',
    'data engineer': 'Data Engineer',
    'data scientist': 'Data Scientist',
    'ai/ml engineer': 'Data Scientist',
    'applied scientist': 'Data Scientist',
    'engineering manager': 'Engineering Manager',
    # DevOps strings found with --list-values DevType on the real file, added as exact entries.
    'devops engineer or professional': 'DevOps Engineer',
    'cloud infrastructure engineer': 'DevOps Engineer',
}

# Mirrors EXPERIENCE in backend/src/db/seed-data.ts. Half-open: min <= years < max.
BRACKETS = [
    ('Fresher (0-1 yrs)', 0, 1),
    ('Junior (1-3 yrs)', 1, 3),
    ('Mid-Level (3-5 yrs)', 3, 5),
    ('Senior (5-8 yrs)', 5, 8),
    ('Staff/Lead (8-12 yrs)', 8, 12),
    ('Principal/Director (12+ yrs)', 12, 99),
]


class PipelineError(Exception):
    def __init__(self, message, code=1):
        super().__init__(message)
        self.code = code


def check_input(path, skip_hash):
    """Guard the raw file before reading it. Returns (size, sha256)."""
    resolved = Path(path).resolve()
    try:
        resolved.relative_to(REPO_ROOT)
    except ValueError:
        pass
    else:
        raise PipelineError(f'refusing input inside the repo ({resolved}); keep the raw download in a temp dir', 2)
    if not resolved.is_file():
        raise PipelineError(f'input not found: {resolved}')
    with open(resolved, 'rb') as f:
        head = f.read(64)
    if head.startswith(b'version https://git-lfs'):
        raise PipelineError('input is a Git LFS pointer, not the CSV; download from the media URL or run git lfs pull')
    size = resolved.stat().st_size
    digest = hashlib.sha256()
    with open(resolved, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            digest.update(chunk)
    sha = digest.hexdigest()
    print(f'input size={size} sha256={sha}')
    if not skip_hash and (size != EXPECTED_SIZE or sha != EXPECTED_SHA256):
        raise PipelineError(
            f'size/sha256 mismatch (expected {EXPECTED_SIZE} / {EXPECTED_SHA256}); '
            'use --skip-hash only for a deliberately newer file')
    return resolved, size, sha


def india_rows(path):
    """Stream India rows. utf-8-sig because the 2025 file starts with a BOM."""
    csv.field_size_limit(1 << 24)  # some free-text columns exceed the 128 KB default
    with open(path, encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        missing = [c for c in REQUIRED_COLUMNS if c not in (reader.fieldnames or [])]
        if missing:
            raise PipelineError(f'required column(s) missing: {", ".join(missing)}')
        total = 0
        for row in reader:
            total += 1
            if (row['Country'] or '').strip() == COUNTRY:
                yield total, row
        yield total, None  # sentinel carrying the total row count


def is_inr(value):
    parts = (value or '').split()
    return bool(parts) and parts[0] == CURRENCY_CODE


def parse_ctc(value):
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    return int(round(x)) if math.isfinite(x) else None


def parse_exp(value):
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(x) or not WORK_EXP_RANGE[0] <= x <= WORK_EXP_RANGE[1]:
        return None
    return int(x)


def trim_outliers(ctcs):
    """Robust 3-sigma in log space (median/MAD). Returns the kept ctc values.

    ponytail: judges every row in a family against one spread and ignores experience, so a very senior
    high earner and a junior typo share a yardstick. Phase B partial pooling replaces this.
    """
    if not ctcs:
        return []
    xs = [math.log(c) for c in ctcs]
    centre = statistics.median(xs)
    mad = statistics.median(abs(x - centre) for x in xs)
    sigma = max(MAD_TO_SIGMA * mad, SIGMA_FLOOR)
    return [c for c, x in zip(ctcs, xs) if abs(x - centre) <= OUTLIER_SIGMA * sigma]


def pct(sorted_vals, p):
    """Linear-interpolated percentile (report only)."""
    if not sorted_vals:
        return None
    k = (len(sorted_vals) - 1) * p / 100
    lo, hi = math.floor(k), math.ceil(k)
    return round(sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (k - lo))


def bracket_of(years):
    for label, lo, hi in BRACKETS:
        if lo <= years < hi:
            return label
    return None


def clean(rows):
    """rows: iterable of dicts (India rows). Returns (kept [(id, role, exp, ctc)], stage counts, employment counts)."""
    stages = Counter()
    employment_values = Counter()
    candidates = []  # (id, role, exp, ctc) before the trim
    for row in rows:
        stages['india'] += 1
        employment = (row['Employment'] or '').strip()
        devtype = (row['DevType'] or '').strip()
        employment_values[employment] += 1
        if ';' in employment:
            raise PipelineError('schema changed: Employment is now multi-select')
        if ';' in devtype:
            raise PipelineError('schema changed: DevType is now multi-select')
        if not is_inr(row['Currency']):
            continue
        stages['inr'] += 1
        if employment.lower() != EMPLOYMENT:
            continue
        stages['employed'] += 1
        ctc = parse_ctc(row['CompTotal'])
        exp = parse_exp(row['WorkExp'])
        if ctc is None or exp is None:
            stages['dropped_unparseable_comp_or_exp'] += 1
            continue
        stages['comp_and_exp_ok'] += 1
        role = DEVTYPE_TO_ROLE.get(devtype.lower())
        if role is None:
            stages['dropped_unmapped_devtype'] += 1
            continue
        stages['mapped_to_family'] += 1
        if not CTC_MIN <= ctc <= CTC_MAX:
            stages['dropped_outside_hard_bounds'] += 1
            continue
        try:
            rid = int(row['ResponseId'])
        except ValueError:
            stages['dropped_bad_response_id'] += 1
            continue
        stages['within_hard_bounds'] += 1
        candidates.append((rid, role, exp, ctc))

    kept = []
    by_role = {}
    for c in candidates:
        by_role.setdefault(c[1], []).append(c)
    for role, items in by_role.items():
        survivors = Counter(trim_outliers([c[3] for c in items]))
        for c in items:
            if survivors[c[3]] > 0:
                survivors[c[3]] -= 1
                kept.append(c)
    stages['dropped_log_trim'] = len(candidates) - len(kept)
    stages['kept'] = len(kept)
    kept.sort(key=lambda r: r[0])
    return kept, dict(stages), dict(employment_values)


def build_report(kept, stages, employment_values, total_rows, size, sha):
    per_role, per_bracket, report_roles = Counter(), {}, {}
    ctcs_by_role = {}
    for _, role, exp, ctc in kept:
        per_role[role] += 1
        per_bracket.setdefault(role, Counter())[bracket_of(exp)] += 1
        ctcs_by_role.setdefault(role, []).append(ctc)
    for role in sorted(ctcs_by_role):
        v = sorted(ctcs_by_role[role])
        report_roles[role] = {
            'count': len(v),
            'p25': pct(v, 25), 'p50': pct(v, 50), 'p75': pct(v, 75), 'p90': pct(v, 90),
            'share_below_300000': round(sum(1 for c in v if c < LOW_TAIL_CTC) / len(v), 4),
            'by_bracket': {label: per_bracket[role].get(label, 0) for label, _, _ in BRACKETS},
        }
    return {
        'script_version': SCRIPT_VERSION,
        'source': SOURCE,
        'source_version': SOURCE_VERSION,
        'input': {'rows_total': total_rows, 'size_bytes': size, 'sha256': sha},
        'constants': {
            'country': COUNTRY, 'currency_code': CURRENCY_CODE, 'employment': 'Employed',
            'work_exp_range': list(WORK_EXP_RANGE), 'ctc_min': CTC_MIN, 'ctc_max': CTC_MAX,
            'outlier_sigma': OUTLIER_SIGMA, 'sigma_floor': SIGMA_FLOOR, 'low_tail_ctc': LOW_TAIL_CTC,
            'devtype_to_role': DEVTYPE_TO_ROLE,
            'brackets_half_open': [{'label': l, 'min': a, 'max': b} for l, a, b in BRACKETS],
        },
        'stages': stages,
        'india_employment_values': employment_values,
        'roles': report_roles,
    }


def write_outputs(out_dir, kept, report):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_dir / 'reference_rows.csv', 'w', encoding='utf-8', newline='\n') as f:
        f.write('source_row_id,role,experience_years,ctc\n')
        for rid, role, exp, ctc in kept:
            f.write(f'{rid},{role},{exp},{ctc}\n')
    with open(out_dir / 'build_report.json', 'w', encoding='utf-8', newline='\n') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
        f.write('\n')


def run(args):
    path, size, sha = check_input(args.input, args.skip_hash)
    rows, total = [], 0
    for n, row in india_rows(path):
        if row is None:
            total = n
        else:
            rows.append(row)
    if args.list_values:
        if args.list_values not in REQUIRED_COLUMNS + ['Industry', 'OrgSize']:
            raise PipelineError(f'--list-values supports a loaded column, got {args.list_values}')
        for value, count in Counter((r.get(args.list_values) or '') for r in rows).most_common():
            print(f'{count}\t{value}')
        return 0
    kept, stages, employment_values = clean(rows)
    report = build_report(kept, stages, employment_values, total, size, sha)
    write_outputs(args.out, kept, report)
    print(json.dumps(stages, indent=2))
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--input', required=True, help='path to the raw results.csv (outside the repo)')
    p.add_argument('--out', default=str(SCRIPT_DIR), help='output directory (default: this directory)')
    p.add_argument('--skip-hash', action='store_true', help='do not fail on size/sha256 mismatch')
    p.add_argument('--list-values', metavar='COLUMN', help='print distinct India values for COLUMN and exit')
    args = p.parse_args(argv)
    try:
        return run(args)
    except PipelineError as e:
        print(f'error: {e}', file=sys.stderr)
        return e.code


if __name__ == '__main__':
    sys.exit(main())
