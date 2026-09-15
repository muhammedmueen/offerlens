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

**The corpus is synthetic.** The letters in `corpus.ts` were written for this purpose,
not collected from real offers. They were also written by the same kind of model whose
extraction they measure, so they risk being unrepresentatively easy: predictable
phrasing, conveniently placed figures, no real OCR damage.

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

Matching is tolerant on purpose. "Zenthara Technologies Private Limited" and "Zenthara
Technologies Pvt Ltd" are the same answer; numbers pass within 2%, which is loose enough
for defensible differences in what counts toward "total" and far too tight to forgive a
magnitude error. Sets report precision and recall separately, because low recall (missed
clauses) and low precision (invented clauses) need different fixes.

Expecting `null` and getting a value counts as a **failure**. Inventing a company name
for a letter that names none is exactly the behaviour this is meant to catch.

The scorer is pure and unit-tested in `score.test.ts` — a scorer with a bug in it
produces confident numbers that are wrong in a direction nobody notices.

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

One Gemini call per case, so a full run is ~16 calls. Expect 429s on a free-tier key;
the provider's fallback chain handles them by moving to another model, which you will see
in the log.
