# Extraction accuracy eval

Phase 0 of [the pipeline plan](../../docs/PLAN-analysis-pipeline.md). Exists so that
Phase 1's changes to the prompt can be judged by a number rather than by impression.

```bash
npm run eval                      # whole corpus
npm run eval -- --limit 4         # quick loop while iterating on a prompt
npm run eval -- --case 09-crore   # one case, by id fragment
npm run eval -- --save            # also write eval/results/<timestamp>.json
```

Requires `GEMINI_API_KEY` in `.env`. Without one it runs `MockAiProvider`, which returns
fixed data — fine for checking the harness executes, useless as a measurement. The
harness says so in its header when that happens.

## Read this before quoting a number

**The corpus is 16/17 synthetic.** The letters in `corpus.ts` were written for this
purpose, not collected from real offers. They were also written by the same kind of model
whose extraction they measure, so they risk being unrepresentatively easy: predictable
phrasing, conveniently placed figures, no real OCR damage.

`17-deliberately-clean` is the one exception — a real letter pasted during manual testing,
and the case that surfaced both compensation diagnostics. It is the clause-by-clause
inverse of `05-red-flag-heavy`: same clause slots, each written to be favourable, with the
non-compete and the clawback explicitly disclaimed. A keyword-driven detector flags all
three; the correct answer is zero.

So:

- ✅ Trustworthy for **"did this change make extraction better or worse"**.
- ❌ Not trustworthy for **"extraction is N% accurate"**.

Replace `CORPUS` with real anonymised letters when any exist. Nothing else needs to
change — the harness does not care where the text comes from.

Deliberate variety, to blunt the easiness problem: multiple currencies and locales,
Indian magnitude words (lakh / crore / LPA) alongside digit grouping, monthly figures
needing annualisation, simulated OCR damage, non-standard job titles, deliberately
incomplete letters to catch invented data, and red-flag clauses phrased differently in
each case.

## What it measures

Calls the AI provider **directly**, not through the API. That isolates extraction from
the database, the queue, and the worker's normalisation — Phase 1 changes the prompt and
the schema, and this is the number that should move.

| Group | Fields | Target |
|---|---|---|
| Structured | `companyName`, `role`, `totalCTC` | > 90% |
| Context | `location`, `currency`, `noticePeriod`, `probationPeriod` | reported, not gated |
| Nuanced | benefits, red-flag types (F1) | > 75% |
| Diagnostics | `baseSalary`, stated cash components, `base := CTC` count | reported separately |

### Red flags are scored on the merged set

Since task 8 there are two detectors: the model, and the deterministic rule engine in
`src/modules/analysis/redflag.rules.ts`. The harness scores the **merged** output, because
that is what the worker stores and therefore what a user sees, and also prints each detector
alone:

```
red flags (F1)       76.1%   (nuanced, MERGED — what the worker stores)
  ├ model only       72.9%   varies run to run
  └ rules only       77.4%   deterministic (task 8)
```

The split is what makes a red-flag regression diagnosable. Without it, a drop looks identical
whether someone edited the prompt or edited a rule. Compare down a column within one run, not
across runs — the model half moves on its own.

Note the harness applies `mergeRedFlags` itself rather than importing it from the worker path
it mirrors. Two call sites of a pure function is the cost of the harness not needing a
database or a queue.

The diagnostics group is printed on its own and **not folded into the structured or
nuanced headline**. Both were added after the headline numbers had already been recorded,
and folding them in would have made every saved result in `results/` incomparable. New
signal gets a new line rather than silently moving the baseline.

`base := CTC` counts cases where extraction asserted base pay equal to total CTC on a
letter that never states a basic figure. It is separated from "base is simply wrong"
because the fixes differ: a wrong number is a parsing miss, whereas `base === CTC` is the
response schema marking `baseSalary` **required**, so the model supplies the only figure
it has. The error then propagates into the PTO daily rate and every take-home estimate.

Matching is tolerant on purpose. "Zenthara Technologies Private Limited" and "Zenthara
Technologies Pvt Ltd" are the same answer; numbers pass within 2%, which is loose enough
for defensible differences in what counts toward "total" and far too tight to forgive a
magnitude error. Sets report precision and recall separately, because low recall (missed
clauses) and low precision (invented clauses) need different fixes.

Expecting `null` and getting a value counts as a **failure**. Inventing a company name
for a letter that names none is exactly the behaviour this is meant to catch.

The scorer is pure and unit-tested in `score.test.ts` — a scorer with a bug in it
produces confident numbers that are wrong in a direction nobody notices.

That happened, and is worth recording. Notice and probation clauses were compared with
`textMatches`, so a letter writing "three months" against ground truth of "3 months"
scored as a miss. `probationPeriod` read 64.7% and `noticePeriod` 76.5% when the model had
transcribed the clause correctly. `durationMatches` maps number words to digits and
collapses the "6 (six) months" duplication; those fields then read 94.1% and 88.2% on the
same model and corpus. **That jump is a scorer correction, not an extraction improvement** —
do not read it as progress. Units are deliberately still distinct: "1 month" and "30 days"
are different answers, because whether a month is 30 days is not the scorer's call.

Run-to-run variance is real. Two consecutive runs of the same 17 cases on the same model
gave red-flag F1 of 76.7% and 71.2%, and `base := CTC` counts of 4 and 5. Treat a single
run as one sample, and prefer several before concluding a prompt change helped.

## The response-shape section matters most right now

The harness prints which top-level keys the model actually returned. At the time of
writing that is the single most useful line of output, because the answers come back
under names the code never reads (`company_name`, `designation`, `annualCompensation`)
rather than the expected `extractedData`. Per-field accuracy collapses for a reason that
has nothing to do with comprehension.

That is the diagnosis Phase 1 tasks 3-5 address: put the schema in the prompt, set
`responseSchema`, validate with Zod.

## Exit code

Always 0. This is a measurement, not a gate — a failing score before Phase 1 is the
expected reading, and a red build teaches people to ignore it. Wire it into CI as a
gate only once the targets are actually met.

## Cost

One Gemini call per case, so a full run is 17 calls. Expect 429s on a free-tier key; the
provider's fallback chain handles them by moving to another model, which you will see in
the log. Check that log before comparing runs — a run that fell through to
`gemini-flash-lite-latest` is not measuring the same thing as one served by
`gemini-2.5-flash`.
