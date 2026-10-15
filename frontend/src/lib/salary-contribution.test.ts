import { describe, it, expect, beforeEach } from "vitest";
import {
  buildContributionBody, buildPrefill, containsCompanyName, getContribState, isAlreadySubmitted,
  roundCtc, setContribState, shouldOfferContribution, validateContribution,
  type ContributionAnalysis, type ContributionValues,
} from "./salary-contribution";
import { isRateLimited } from "./quota";

const analysis = (over: Partial<ContributionAnalysis> = {}): ContributionAnalysis => ({
  offerStatus: "COMPLETED",
  lowConfidence: false,
  confidence: { caveat: null, fields: { totalCTC: { level: "high" } } },
  extractedData: {
    role: "Backend Engineer", location: "Bengaluru", companyName: "Acme Technologies Private Limited",
    companyType: "Product", employmentType: "full-time",
    compensation: { totalCTC: 2_404_321, currency: "INR" },
  },
  ...over,
});

describe("shouldOfferContribution", () => {
  it("shows for the happy path at high and medium CTC confidence, and for ' inr '", () => {
    expect(shouldOfferContribution(analysis(), false)).toBe(true);
    expect(shouldOfferContribution(analysis({ confidence: { caveat: null, fields: { totalCTC: { level: "medium" } } } }), false)).toBe(true);
    const a = analysis();
    a.extractedData!.compensation!.currency = " inr ";
    expect(shouldOfferContribution(a, false)).toBe(true);
  });

  it.each<[string, () => ContributionAnalysis | null | undefined, boolean]>([
    ["dismissed", () => analysis(), true],
    ["no analysis", () => null, false],
    ["failed offer", () => analysis({ offerStatus: "FAILED" }), false],
    ["low confidence", () => analysis({ lowConfidence: true }), false],
    ["caveat", () => analysis({ confidence: { caveat: "scan", fields: { totalCTC: { level: "high" } } } }), false],
    ["CTC confidence low", () => analysis({ confidence: { caveat: null, fields: { totalCTC: { level: "low" } } } }), false],
    ["CTC confidence field absent", () => analysis({ confidence: { caveat: null, fields: {} } }), false],
    ["fields absent", () => analysis({ confidence: { caveat: null } }), false],
    ["confidence absent", () => analysis({ confidence: undefined }), false],
  ])("hides when %s", (_n, make, dismissed) => {
    expect(shouldOfferContribution(make(), dismissed)).toBe(false);
  });

  it.each([
    ["null CTC", null], ["zero CTC", 0], ["negative CTC", -5], ["over 1e9", 1_000_000_001], ["NaN", Number.NaN],
  ])("hides for %s", (_n, ctc) => {
    const a = analysis();
    a.extractedData!.compensation!.totalCTC = ctc;
    expect(shouldOfferContribution(a, false)).toBe(false);
  });

  it("hides for a non-INR currency, a non-full-time offer and a blank role", () => {
    const usd = analysis(); usd.extractedData!.compensation!.currency = "USD";
    const intern = analysis(); intern.extractedData!.employmentType = "internship";
    const blank = analysis(); blank.extractedData!.role = "  ";
    for (const a of [usd, intern, blank]) expect(shouldOfferContribution(a, false)).toBe(false);
  });
});

describe("buildPrefill", () => {
  it("normalises company type, rounds CTC and never guesses years or size", () => {
    const p = buildPrefill(analysis());
    expect(p).toMatchObject({ role: "Backend Engineer", city: "Bengaluru", ctc: "2400000", companyType: "product", years: "", companySize: "" });
  });
  it.each([["government", "other"], ["Product", "product"], [" product ", "product"], ["weird", ""], [null, ""]])(
    "maps company type %s to %j", (input, expected) => {
      const a = analysis(); a.extractedData!.companyType = input as string | null;
      expect(buildPrefill(a).companyType).toBe(expected);
    },
  );
  it("drops Remote as a city", () => {
    const a = analysis(); a.extractedData!.location = "Remote";
    expect(buildPrefill(a).city).toBe("");
  });
  it("rounds to the nearest 10,000, or to the rupee when that would give 0", () => {
    expect(roundCtc(2_404_321)).toBe(2_400_000);
    expect(roundCtc(2_405_000)).toBe(2_410_000);
    expect(roundCtc(3_000.4)).toBe(3_000);
  });
});

describe("containsCompanyName", () => {
  const cases: Array<[string, string, string]> = [
    ["Acme Technologies Private Limited", "Engineer at Acme", "block"],
    ["Acme Technologies Private Limited", "acme payments", "block"],
    ["Acme Technologies Private Limited", "Pune, ACME Campus", "block"],
    ["Acme Technologies Private Limited", "Backend Engineer", "ok"],
    ["Acme Technologies Private Limited", "Acmeville", "ok"],
    ["Amazon Development Centre (India) Private Limited", "Software Development Engineer", "ok"],
    ["Amazon Development Centre (India) Private Limited", "Amazon SDE", "block"],
    ["Data Patterns India Pvt Ltd", "Data Engineer", "ok"],
    ["Data Patterns India Pvt Ltd", "Patterns Engineer", "block"],
    ["Acme Payments Private Limited", "Payments Engineer", "warn"],
    ["Acme Payments Private Limited", "Acme Engineer", "block"],
    ["Tata Consultancy Services", "Tata engineer", "block"],
    ["Tata Consultancy Services", "TCS Developer", "warn"],
    ["HP India Private Limited", "HP Engineer", "warn"],
    ["HP India Private Limited", "Backend Engineer", "ok"],
    ["EY Global Services", "EY Consultant", "warn"],
    ["Technologies Solutions Pvt Ltd", "Technologies Solutions", "ok"], // only generic words
    ["L&T Technology Services", "T Engineer", "ok"], // 1-character tokens are ignored
  ];
  it.each(cases)("%s / %s -> %s", (company, value, expected) => {
    expect(containsCompanyName(value, company)).toBe(expected);
  });
  it("is case-insensitive, and null company means nothing to match", () => {
    expect(containsCompanyName("ACME lead", "acme technologies")).toBe("block");
    expect(containsCompanyName("Acme lead", null)).toBe("ok");
  });
});

describe("buildContributionBody and validateContribution", () => {
  const good: ContributionValues = { role: "Backend Engineer", city: "Pune", years: "4", ctc: "2400000", companyType: "product", companySize: "201-1000", payBasis: "current" };
  const ok = { role: "ok", city: "ok" } as const;
  const none = { role: false, city: false };

  it("builds exactly the seven allowlisted keys, and drops a blank size", () => {
    expect(Object.keys(buildContributionBody(good)!).sort()).toEqual(
      ["city", "companySize", "companyType", "ctc", "experienceYears", "payBasis", "role"],
    );
    expect(buildContributionBody({ ...good, companySize: "" })).not.toHaveProperty("companySize");
  });

  it("sends payBasis for current/offered, omits the key for 'Not sure', and rejects an unanswered one", () => {
    expect(buildContributionBody({ ...good, payBasis: "current" })!.payBasis).toBe("current");
    expect(buildContributionBody({ ...good, payBasis: "offered" })!.payBasis).toBe("offered");
    expect(buildContributionBody({ ...good, payBasis: "unsure" })).not.toHaveProperty("payBasis");
    expect(buildContributionBody({ ...good, payBasis: "" })).toBeNull();
    expect(validateContribution({ ...good, payBasis: "" }, ok, none)[0])
      .toMatchObject({ field: "payBasis", message: "Choose current pay, offered pay or not sure" });
  });

  it("prefills 'offered' for the results-page card", () => {
    expect(buildPrefill(analysis()).payBasis).toBe("offered");
  });

  it.each(["", " ", "abc", "61", "-1", "2.5"])("returns null for years %j", (years) => {
    expect(buildContributionBody({ ...good, years })).toBeNull();
  });

  it("parses CTC strictly: trims, digits only, 1 to 1,000,000,000", () => {
    expect(buildContributionBody({ ...good, ctc: " 2400000 " })!.ctc).toBe(2_400_000);
    expect(buildContributionBody({ ...good, ctc: "1000000000" })!.ctc).toBe(1_000_000_000);
    for (const ctc of ["24,00,000", "2400000.5", "0", "1000000001", ""]) {
      expect(buildContributionBody({ ...good, ctc })).toBeNull();
    }
    const [p] = validateContribution({ ...good, ctc: "24,00,000" }, ok, none);
    expect(p).toMatchObject({ field: "ctc", message: "Enter digits only, for example 2400000" });
  });

  it("requires a company type", () => {
    expect(buildContributionBody({ ...good, companyType: "" })).toBeNull();
  });

  it("reports problems in DOM order; the first one is where focus goes", () => {
    const problems = validateContribution({ ...good, ctc: "x", years: "" }, ok, none);
    expect(problems.map((p) => p.field)).toEqual(["years", "ctc"]);
  });

  it("blocks on 'block', and needs the confirm box for 'warn' (focus goes to the checkbox)", () => {
    expect(validateContribution(good, { role: "block", city: "ok" }, none)[0])
      .toMatchObject({ field: "role", message: "Remove the company name", focus: "field" });
    expect(validateContribution(good, { role: "warn", city: "ok" }, none)[0])
      .toMatchObject({ field: "role", focus: "confirm" });
    expect(validateContribution(good, { role: "warn", city: "ok" }, { role: true, city: false })).toEqual([]);
  });
});

describe("error classifier", () => {
  const cooldown = { response: { status: 429, data: { error: { code: "RATE_LIMIT_EXCEEDED", details: { reason: "ALREADY_SUBMITTED" } } } } };
  const limiter = { response: { status: 429, data: { error: { code: "RATE_LIMIT_EXCEEDED" } } } };
  it("tells the cooldown from the limiter, and the cooldown is also a RATE_LIMIT_EXCEEDED so it must be checked first", () => {
    expect(isAlreadySubmitted(cooldown)).toBe(true);
    expect(isRateLimited(cooldown)).toBe(true);
    expect(isAlreadySubmitted(limiter)).toBe(false);
    expect(isAlreadySubmitted(new Error("x"))).toBe(false);
  });
});

describe("per-offer marker", () => {
  beforeEach(() => localStorage.clear());
  it("is per offer, and ignores junk", () => {
    expect(getContribState("a")).toBeNull();
    setContribState("a", "dismissed");
    expect(getContribState("a")).toBe("dismissed");
    expect(getContribState("b")).toBeNull();
    localStorage.setItem("salary_contrib:v1:c", "junk");
    expect(getContribState("c")).toBeNull();
  });
});
