export type Severity = "high" | "medium" | "low";

export interface RedFlag {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  keywords: string[];
}

export interface DetectedRedFlag extends RedFlag {
  matchedKeyword: string;
}

const redFlagRules: RedFlag[] = [
  // High Severity
  {
    id: "training-bond",
    severity: "high",
    title: "Training Bond / Lock-in Detected",
    description:
      "This clause may require you to stay with the company for a fixed period or pay a penalty. Review the bond duration and penalty amount carefully.",
    keywords: ["bond", "service agreement", "training cost", "recover cost", "lock-in period"],
  },
  {
    id: "non-compete",
    severity: "high",
    title: "Non-Compete Clause",
    description:
      "This restricts your ability to work with competitors after leaving. Such clauses are uncommon and may limit your career options.",
    keywords: ["non-compete", "not work with competitors", "competitive employment", "non compete"],
  },
  {
    id: "bonus-clawback",
    severity: "high",
    title: "Bonus Clawback Clause",
    description:
      "You may be required to return your bonus under certain conditions. This poses a financial penalty risk.",
    keywords: ["recover bonus", "bonus clawback", "repay bonus", "return bonus", "forfeit bonus"],
  },

  // Medium Severity
  {
    id: "long-notice",
    severity: "medium",
    title: "Long Notice Period",
    description:
      "A 90-day notice period can delay your next opportunity. Consider negotiating a buyout clause or reduction.",
    keywords: ["90 days notice", "3 months notice", "90 day notice", "three months notice"],
  },
  {
    id: "high-variable",
    severity: "medium",
    title: "High Variable Component",
    description:
      "A significant portion of your compensation is variable, which may lead to unstable take-home pay.",
    keywords: ["variable pay", "performance bonus", "incentive pay", "variable component"],
  },
  {
    id: "extended-probation",
    severity: "medium",
    title: "Extended Probation Period",
    description:
      "A 6-month probation period is longer than standard. During this time, benefits and job security may be limited.",
    keywords: ["probation 6 months", "6 month probation", "six months probation", "extended probation"],
  },

  // Low Severity
  {
    id: "gratuity-included",
    severity: "low",
    title: "Gratuity Included in CTC",
    description:
      "Gratuity is a statutory benefit that shouldn't be part of CTC. This inflates the apparent salary figure.",
    keywords: ["gratuity included", "gratuity in ctc", "ctc includes gratuity"],
  },
  {
    id: "reimbursement-heavy",
    severity: "low",
    title: "Reimbursement-Heavy CTC",
    description:
      "A significant portion of CTC may require expense claims. This affects your actual take-home amount.",
    keywords: ["reimbursements", "reimbursement", "expense claims", "fuel reimbursement", "travel reimbursement"],
  },
];

export function detectRedFlags(offerText: string): DetectedRedFlag[] {
  const normalizedText = offerText.toLowerCase();
  const detectedFlags: DetectedRedFlag[] = [];

  for (const rule of redFlagRules) {
    for (const keyword of rule.keywords) {
      if (normalizedText.includes(keyword.toLowerCase())) {
        detectedFlags.push({
          ...rule,
          matchedKeyword: keyword,
        });
        break; // Only add each rule once
      }
    }
  }

  // Sort by severity: high -> medium -> low
  const severityOrder: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return detectedFlags.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

export function hasHighVariable(offerText: string, variablePercent?: number): boolean {
  const hasVariableKeyword = offerText.toLowerCase().includes("variable");
  return hasVariableKeyword && (variablePercent ? variablePercent > 30 : false);
}
