import { DetectedRedFlag } from "./redFlagRules";
import { SalaryRange } from "./salaryData";

export interface NegotiationSuggestion {
  id: string;
  category: string;
  icon: string;
  title: string;
  suggestion: string;
  priority: "high" | "medium" | "low";
}

export function generateNegotiationSuggestions(
  redFlags: DetectedRedFlag[],
  salaryComparison: "below" | "aligned" | "above",
  salaryDifference: number,
  salaryRange: SalaryRange,
  offeredCTC: number
): NegotiationSuggestion[] {
  const suggestions: NegotiationSuggestion[] = [];

  // Salary comparison logic
  if (salaryComparison === "below") {
    const targetRaise = Math.abs(salaryDifference).toFixed(1);
    suggestions.push({
      id: "salary-raise",
      category: "Compensation",
      icon: "💰",
      title: "Request Salary Adjustment",
      suggestion: `Ask for a raise of ${targetRaise} LPA to match industry standards. Present market data showing the average for your role is ${salaryRange.avg} LPA.`,
      priority: "high",
    });
  } else if (salaryComparison === "above") {
    suggestions.push({
      id: "salary-leverage",
      category: "Leverage",
      icon: "⭐",
      title: "Strong Position",
      suggestion: `Your offer exceeds market average. Use this as a foundation to negotiate other terms like flexibility, signing bonus, or faster review cycles.`,
      priority: "low",
    });
  }

  // Red flag based suggestions
  const flagIds = new Set(redFlags.map((f) => f.id));

  if (flagIds.has("training-bond")) {
    suggestions.push({
      id: "bond-removal",
      category: "Contractual Terms",
      icon: "🔓",
      title: "Address Training Bond",
      suggestion:
        "Seek removal of the bond clause or request clear documentation of penalty terms. Ask for pro-rata reduction of penalty based on service duration.",
      priority: "high",
    });
  }

  if (flagIds.has("non-compete")) {
    suggestions.push({
      id: "non-compete-scope",
      category: "Contractual Terms",
      icon: "📋",
      title: "Limit Non-Compete Scope",
      suggestion:
        "Request scope reduction (geography, duration, competitor definition) or written relaxation. Some non-compete clauses may not be enforceable in your jurisdiction.",
      priority: "high",
    });
  }

  if (flagIds.has("bonus-clawback")) {
    suggestions.push({
      id: "bonus-terms",
      category: "Compensation",
      icon: "🎯",
      title: "Clarify Bonus Terms",
      suggestion:
        "Request clear documentation of conditions under which bonus repayment applies. Negotiate for pro-rata forfeiture instead of full clawback.",
      priority: "high",
    });
  }

  if (flagIds.has("long-notice")) {
    suggestions.push({
      id: "notice-reduction",
      category: "Exit Terms",
      icon: "📅",
      title: "Negotiate Notice Period",
      suggestion:
        "Negotiate for a 30-60 day notice period, or request a buyout clause that allows early exit by paying for remaining notice days.",
      priority: "medium",
    });
  }

  if (flagIds.has("high-variable")) {
    suggestions.push({
      id: "variable-fixed",
      category: "Compensation",
      icon: "📊",
      title: "Optimize Pay Structure",
      suggestion:
        "Request shifting 10-20% of variable pay into fixed components. This ensures more predictable monthly income.",
      priority: "medium",
    });
  }

  if (flagIds.has("extended-probation")) {
    suggestions.push({
      id: "probation-reduction",
      category: "Terms",
      icon: "⏱️",
      title: "Reduce Probation Period",
      suggestion:
        "Request a standard 3-month probation or ask for clear performance criteria for early confirmation.",
      priority: "medium",
    });
  }

  if (flagIds.has("reimbursement-heavy")) {
    suggestions.push({
      id: "reimbursement-fixed",
      category: "Compensation",
      icon: "💵",
      title: "Convert Reimbursements",
      suggestion:
        "Ask for more fixed salary instead of reimbursement-heavy structure. Reimbursements require expense claims and may not be fully utilized.",
      priority: "low",
    });
  }

  if (flagIds.has("gratuity-included")) {
    suggestions.push({
      id: "gratuity-separate",
      category: "Compensation",
      icon: "📝",
      title: "Request CTC Restructuring",
      suggestion:
        "Ask for CTC breakdown excluding gratuity, as it's a statutory benefit. This gives a clearer picture of your actual compensation.",
      priority: "low",
    });
  }

  // If no suggestions, add a general one
  if (suggestions.length === 0) {
    suggestions.push({
      id: "general-positive",
      category: "General",
      icon: "✨",
      title: "Clean Offer",
      suggestion:
        "Your offer appears to have no major red flags. You can still negotiate for better terms like signing bonus, flexible work arrangements, or learning & development budget.",
      priority: "low",
    });
  }

  // Sort by priority
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}
