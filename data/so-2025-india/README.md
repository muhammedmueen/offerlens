# Stack Overflow Developer Survey 2025: India salary reference rows

Contains information from the Stack Overflow Developer Survey 2025 (Stack Exchange Inc.), made available under the Open Database License (ODbL).

- Survey: <https://survey.stackoverflow.co/2025>
- Open Database License (ODbL) 1.0: <https://opendatacommons.org/licenses/odbl/1-0/>
- Database Contents License (DbCL) 1.0 (for the individual survey answers): <https://opendatacommons.org/licenses/dbcl/1-0/>

## Licence

`reference_rows.csv` is a **Derivative Database** of the Stack Overflow Developer Survey 2025 and is
offered under the **ODbL 1.0**. It is shared alike under the same licence. No technical restrictions
(DRM or similar) are applied to this file. The repository's MIT `LICENSE` covers the code only; it does
**not** cover this directory's data.

## What is here

| File | What |
|---|---|
| `reference_rows.csv` | The derived dataset: 662 rows, `source_row_id,role,experience_years,ctc` |
| `build_reference.py` | The cleaning script (Python 3 standard library only) |
| `test_build_reference.py` | Unit tests for the script (synthetic rows only) |
| `build_report.json` | Counts per stage, per role and per experience bracket, percentiles, constants |

Schema of `reference_rows.csv`:

| Column | Meaning |
|---|---|
| `source_row_id` | The survey's anonymous `ResponseId` |
| `role` | One of eight role-family labels (a subset of the app's seeded roles) |
| `experience_years` | `int(WorkExp)`, whole years of professional experience |
| `ctc` | Annual total compensation in INR, whole rupees (`int(round(CompTotal))`) |

No other survey column is kept. There is no city (the rows are national), no company, and no
respondent, user, guest or fingerprint data. No LLM and no model-generated numbers are used: every
`ctc` is an observed survey answer, or the row is dropped.

## Source

- Archive: <https://github.com/StackExchange/Survey/tree/main/packages/archive/2025>, file `results.csv`
  (a Git LFS object; the plain raw URL returns a 134-byte pointer, not the data).
- Collected 2025-05-29 to 2025-06-23, released 2025-07-29.
- Raw file: 140,893,245 bytes, SHA-256 `2d1f65308877282edfb4470520eabbc08cb499118432a3dcec6a66c086aa2baa`.
  The script checks both and refuses a mismatch unless `--skip-hash` is passed.

## Cleaning rules

All thresholds are named constants at the top of `build_reference.py`. In order:

1. `Country` is `India`.
2. `Currency` code is `INR` (the first word of values such as `INR Indian rupee`).
3. `Employment` is `Employed`. Freelancers and contractors, students, the unemployed and retirees
   are excluded, because their pay is not a salary. The script aborts if `Employment` ever contains `;`.
4. `CompTotal` and `WorkExp` both parse as numbers; `WorkExp` is 0 to 50. `NA` is dropped.
5. `DevType` maps by exact string to a role family; everything else is dropped, not forced. The script
   aborts if `DevType` ever contains `;`.

   | `DevType` | Role |
   |---|---|
   | Developer, full-stack | Full Stack Engineer |
   | Developer, back-end | Backend Engineer |
   | Developer, front-end | Frontend Engineer |
   | Developer, mobile | Mobile Engineer |
   | Data engineer | Data Engineer |
   | Data scientist, AI/ML engineer, Applied scientist | Data Scientist |
   | Engineering manager | Engineering Manager |
   | DevOps engineer or professional, Cloud infrastructure engineer | DevOps Engineer |

6. Hard bounds on the integer `ctc`: 1,00,000 to 5,00,00,000 a year. This removes the survey's INR
   extremes (values near 12 and up to 1e23).
7. Log-salary trim per role family: drop a row when `|ln(ctc) - median| > 3 * max(1.4826 * MAD, 0.05)`.
   Robust (median and MAD) because a mean and standard deviation would be wrecked by the extremes.
   It ignores experience, so a very senior high earner and a junior typo share one spread.

Row counts by stage (from `build_report.json`): 49,191 survey rows, 2,547 India, 2,463 INR,
1,659 employed, 944 with usable pay and experience, 743 in a role family, 665 within the hard
bounds, **662 kept** (3 removed by the trim).

## Rows per role and experience bracket

Brackets are half-open, `min <= years < max`, so each year of experience is in exactly one bracket.
**Fresher means 0 years only**; "Junior (1-3 yrs)" is 1 to 2 years, "Mid-Level (3-5 yrs)" is 3 to 4,
and so on. No kept row has 0 years of experience, so the Fresher column is empty and a Fresher offer is
benchmarked against the whole role instead.

| Role | Rows | Fresher | Junior | Mid | Senior | Staff/Lead | Principal |
|---|---:|---:|---:|---:|---:|---:|---:|
| Backend Engineer | 184 | 0 | 37 | 39 | 33 | 43 | 32 |
| Data Engineer | 25 | 0 | 6 | 5 | 2 | 7 | 5 |
| Data Scientist | 31 | 0 | 10 | 9 | 7 | 2 | 3 |
| DevOps Engineer | 27 | 0 | 3 | 8 | 5 | 5 | 6 |
| Engineering Manager | 22 | 0 | 0 | 0 | 2 | 6 | 14 |
| Frontend Engineer | 62 | 0 | 19 | 12 | 10 | 13 | 8 |
| Full Stack Engineer | 269 | 0 | 60 | 70 | 54 | 51 | 34 |
| Mobile Engineer | 42 | 0 | 7 | 13 | 10 | 8 | 4 |

The app only serves a benchmark from a cell with 10 or more rows. So the role-and-bracket benchmark is
available for Backend and Full Stack in five brackets, Frontend in four, Mobile in two (Mid, Senior),
Data Scientist in one (Junior), and Engineering Manager in one (Principal). Data Engineer and DevOps have
no bracket with 10 rows, so they only get the role-wide benchmark (all experience levels). The same
role-wide fallback applies to any thin bracket of the other roles.

## Low-tail share (open item)

Pay typed as a monthly figure into the annual field (roughly 1 to 2.5 lakh) passes the 1 lakh floor and
can survive the trim, pulling the lower percentiles down. Share of kept rows below 3,00,000 a year:

| Role | Share |
|---|---:|
| Frontend Engineer | 8.06% |
| Full Stack Engineer | 5.95% |
| Backend Engineer | 4.89% |
| Mobile Engineer | 2.38% |
| Data Engineer, Data Scientist, DevOps Engineer, Engineering Manager | 0% |

**Open item for the owner:** Frontend and Full Stack are above 5%. The floor was not raised, because that
is a data judgement that changes this file. Some of those rows may be real fresher salaries.

## Rebuild

The raw file is not in this repo and must stay outside it (the script refuses an input path inside the repo).

```powershell
# 1. Download the real file (not the LFS pointer) to a temp directory
New-Item -ItemType Directory -Force "$env:TEMP\so2025" | Out-Null
curl.exe -L --fail -o "$env:TEMP\so2025\results.csv" `
  "https://media.githubusercontent.com/media/StackExchange/Survey/main/packages/archive/2025/results.csv"

# 2. Build (writes reference_rows.csv and build_report.json here)
python data/so-2025-india/build_reference.py --input "$env:TEMP\so2025\results.csv"

# 3. Delete the download
Remove-Item -Recurse -Force "$env:TEMP\so2025"
```

`git lfs pull` in a clone of `StackExchange/Survey` also yields the real file. To see the distinct values
of a column for India rows: add `--list-values DevType`. Run the tests with
`cd data/so-2025-india && python -m unittest -v test_build_reference`.

Load the result into the database with `npm run db:load-reference` in `backend/` (idempotent).
