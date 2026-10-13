# PLFS 2023-24: city pay factors

Source: PLFS 2023-24, National Statistics Office, MoSPI (Periodic Labour Force Survey, first-visit person file `perv1.csv`).

## Licence and terms

`city_factors.csv` and `build_report.json` are **aggregates derived from PLFS data obtained under the MoSPI
Data Access Agreement**, for **non-commercial use only**. They are **not** ODbL (that licence covers only the
Stack Overflow data in `../so-2025-india/`) and **not** covered by the repository's MIT `LICENSE` (code only).
MoSPI bears no responsibility for the use of the data or any interpretation based on it. The figures are
estimates.

**The raw PLFS microdata is NOT included** and must never be: it stays outside the repo (`PLFS_DIR`). The
script refuses to run when `PLFS_DIR` is inside the repository, `.gitignore` blocks `perv1.*`, `perrv.*`,
`hhv1.*`, `hhrv.*` and `pfls/`, and a test fails if such a file is ever tracked. No unit-level record is
printed, stored or written: the only outputs are the two aggregate files below, every count in them is either
at least 30 or the text `<30`, and no absolute earnings figure is written.

If the project ever becomes paid or commercial, remove these factors first (see "Removal" below).

## What is here

| File | What |
|---|---|
| `city_factors.csv` | Six rows: `city,status,n_respondents,raw_ratio,shrinkage_weight,factor` |
| `build_city_factors.py` | The pipeline (Python 3 standard library only) |
| `test_build_city_factors.py` | Unit tests (synthetic rows only) |
| `build_report.json` | Funnel counts, code-gate results, weights, coverage, constants, per-city detail (aggregates and n only) |

## Method

PLFS is used **only as a ratio**. Its rupee amounts (monthly cash earnings, not CTC; one coarse software
occupation group) never reach a user.

1. Read `perv1.csv` only (first-visit schedules of all four quarters, as the estimation procedure's annual
   urban estimate does; revisit files would double-count persons).
2. Keep: urban sector, age 18 to 60, current weekly status 31 (regular salaried/wage), current-week occupation
   NCO-2015 **251 or 252** (the group named in the Data Access Agreement application; never broadened),
   earnings from the regular salaried/wage activity greater than 0.
3. Weight per person, from the PLFS README "Note for users": `MULT / 100` if `NSS == NSC` else `MULT / 200`
   (combining both sub-samples), then divided by `NO_QTR` (annual estimate). Computed as an exact integer
   (README weight times 2400), which cancels in every median and ratio.
4. Weighted median of monthly earnings per metro, divided by the weighted median of the same group
   nationally (all-India urban). Median, so no trimming or top-coding.
5. Shrink toward 1.0 by sample size, in log space: `lambda = n / (n + K)`, `factor = exp(lambda * ln(raw_ratio))`,
   `K = 30`, published to 2 decimals. `build_report.json` also shows the factor under K = 15 and K = 60.
6. Suppress any city with fewer than 30 sampled respondents (`MIN_PLFS_RESPONDENTS`). The floor is enforced
   in the pipeline with an explicit `FloorViolation` (survives `python -O`) and in a test.

Safety gates stop the run (nothing is written) on: header or column mismatch, unexpected sector/status code
distribution, an invalid weight field, more than 1% unparseable age/earnings among candidates, a national
group under 30, an implausible national median, or a ratio outside 0.5 to 2.0.

### Metro to district mapping

Codes are PLFS `state-district` (names from `District_codes_PLFS_Panel_4_202324_2024.xlsx`), urban sector
only. City keys match `CITY_ALIASES` in `backend/src/modules/salary/role-matching.ts`. This grouping is a
judgement: edit `CITY_DISTRICTS` in the script and rebuild to change it. District-level cells are noisier than
PLFS's state-level design, which is why the floor and the shrinkage exist.

| City | Districts |
|---|---|
| bangalore | 29-18 Bangalore |
| mumbai | 27-22 Mumbai Suburban, 27-21 Thane, 27-23 (Mumbai; not in the district workbook, included defensively) |
| delhi ncr | 07-01..07-09 (all Delhi districts), 06-18 Gurgaon, 06-20 Faridabad, 09-09 Ghaziabad, 09-10 Gautam Buddha Nagar |
| hyderabad | 36-22 Hyderabad, 36-23 Rangareddy, 36-21 Medchal-Malkajgiri |
| pune | 27-25 Pune |
| chennai | 33-02 Chennai, 33-03 Kancheepuram, 33-01 Thiruvallur |

### Ceiling (known simplification)

**One multiplier per city, applied across all roles and experience levels.** The true city effect differs by
role and seniority, PLFS carries a single software occupation group and monthly cash earnings (not CTC), and
district estimates are noisy. Crowdsourced salary data corrects this as it grows and is never adjusted.
PLFS 2023-24 covers July 2023 to June 2024; the Stack Overflow side is mid-2025, and the ratio is not re-based
for that gap.

## Rebuild

The raw files stay in a folder outside the repo; the script has no default for the folder.

```powershell
$env:PLFS_DIR = 'C:\Users\<you>\pfls'     # folder containing perv1.csv
python data/plfs-city-factors/build_city_factors.py --counts-only   # feasibility counts, per city (build_report.counts.json, git-ignored)
python data/plfs-city-factors/build_city_factors.py                 # writes city_factors.csv and build_report.json here
cd data/plfs-city-factors; python -m unittest -v test_build_city_factors; python -O -m unittest test_build_city_factors
```

## Citation

PLFS 2023-24, National Statistics Office, MoSPI. Wherever a city-adjusted number is shown, cite it as
"City adjustment derived from the Periodic Labour Force Survey 2023-24, National Statistics Office, MoSPI."

The Data Access Agreement asks for an electronic copy of every publication based on the data to be sent to
`nssunit.dsdd@mospi.gov.in`: send `city_factors.csv` and `build_report.json` with the project link before or
alongside first publication.

## Removal (if the project becomes paid / SaaS)

1. Stop serving the factors immediately: `DELETE FROM city_pay_factors;` (the lookup falls back to national
   figures; no deploy needed).
2. Decide what to do with stored analyses that carry adjusted numbers (`salary_comparison->>'benchmarkScope'`
   ending in `city_adjusted`); that is a data decision.
3. Drop the table with a new forward migration, and delete the loader, the schema file, the parser and the
   `cityAdjustment` branches in the backend and frontend.
4. Delete this directory in a cleanup commit. The CSV stays in git history; whether to purge it is an owner
   and MoSPI question at that time.
5. Update the intended-use statement and tell MoSPI.
