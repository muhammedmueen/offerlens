# Extraction accuracy eval

Phase 0 of [the pipeline plan](../../docs/PLAN-analysis-pipeline.md). Exists so that
Phase 1's changes to the prompt can be judged by a number rather than by impression.

```bash
npm run eval                      # whole corpus, ONE pass, configured provider
npm run eval -- --runs 3          # three passes, averaged, with the spread reported
npm run eval -- --provider openai # same corpus, a different provider
npm run eval -- --provider anthropic --model claude-haiku-4-5
npm run eval -- --limit 4         # quick loop while iterating on a prompt
npm run eval -- --case 09-crore   # one case, by id fragment
npm run eval -- --save            # also write eval/results/<timestamp>.json
```

## Comparing providers

`--provider` runs the identical corpus through Gemini, OpenAI or Anthropic and scores it the
same way, so the comparison is like-for-like. With `--runs 3` it is also judged against the
same noise floor, which matters: a provider that looks 2 points better is not better.

Read it alongside the per-analysis cost the worker now logs. A provider that scores a point
higher for triple the money is a different decision from one that scores a point higher for
free, and until both numbers existed neither question could be answered.

Two cautions. `--model` is per-provider — passing a Gemini model id while `--provider openai`
is set produces a vendor 404, not a fallback. And a run that fell through to a weaker model
because of quota is not comparable with one that did not, so check the log before trusting a
delta.

## Use `--runs 3` for any number you intend to quote

The model is not deterministic. A single pass cannot distinguish a small improvement from
the model having a different day, and noise in the favourable direction reads as progress.

With `--runs N` every figure is reported as a mean with its observed range, and the run ends
with the number that actually matters:

```
Noise floor over 3 passes: 2.4%.
Treat a change below that as unmeasured, not as an improvement.
```

Measured over 17 cases × 3 passes, that floor is **2.4%**. Anything smaller is not a result.
A single pass defaults to `--runs 1` so the quick iteration loop stays cheap, and the header
says plainly that one sample is not quotable.

### Passes are scored on the cases they all completed

Only cases that succeeded in **every** pass are scored, so all passes share a denominator.
This is not pedantry — it was a live bug. On a free-tier key the quota drains as the run
proceeds: a real 3-pass run completed 17 cases, then 13, then 4. Averaging each pass over its
own survivors made pass 3's four easy cases read as a 92.6% high-water mark and inflated the
reported noise floor to 21.6%.

What caught it: the harness asserts that **rules-only F1 is identical across passes**, because
the rule engine is pure and cannot legitimately vary. It varied, which meant the aggregation
was wrong rather than the rules. That check still runs and still prints a warning, and it is
the cheapest guard in the harness.

When coverage drops below 80% the report says the figures describe a subset and must not be
compared against a previous result. `--save` records `scoredCases` and `comparable` so a
thin run cannot be mistaken for a full one later.

Requires a key for the selected provider — `GEMINI_API_KEY`, `OPENAI_API_KEY` or
`ANTHROPIC_API_KEY`. Without one it runs `MockAiProvider`, which returns fixed data — fine for
checking the harness executes, useless as a measurement. The harness says so in its header when
that happens.

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

Run-to-run variance is real, which is what `--runs` exists for. Early single-pass samples of
the same 17 cases gave red-flag F1 of 76.7% and 71.2%. A proper 3-pass measurement puts the
overall noise floor at 2.4%, so those two readings were mostly the same number seen twice.

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

One Gemini call per case per pass, so `--runs 3` over the full corpus is 51 calls. The header
prints the count before it starts.

Expect 429s on a free-tier key. The provider's fallback chain handles them by moving to
another model, which you will see in the log — check it before comparing runs, because a run
that fell through to `gemini-flash-lite-latest` is not measuring the same thing as one served
by `gemini-2.5-flash`.

A 3-pass run on free tier may exhaust the quota partway and drop cases. The report says so
rather than quietly scoring the survivors, but the practical answer is to space the passes out
or use a paid key.
