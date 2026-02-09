import { Resend } from "resend";
import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

const prisma = new PrismaClient();

// Leverage analysis result
export interface LeverageAnalysis {
    leverageLevel: "high" | "medium" | "low";
    reasons: string[];
    suggestedScenario: string;
}

// Negotiation script with user data filled in
export interface PreparedScript {
    scenario: string;
    title: string;
    body: string; // With placeholders replaced
    leverageAnalysis: LeverageAnalysis;
}

interface SalaryComparison {
    comparison: "below" | "aligned" | "above";
    difference: number;
}

interface ExtractedData {
    baseSalary?: number;
    jobTitle?: string;
    companyName?: string;
    location?: string;
}

/**
 * Negotiation Service - Deterministic script delivery (cost-free)
 * 
 * Flow:
 * 1. Analyze leverage points (market gap, competing offers, skills)
 * 2. Select appropriate pre-written script from DB
 * 3. Fill in placeholders with user data
 * 4. Send via email (Resend)
 * 5. Schedule 7-day follow-up survey
 */
export class NegotiationService {
    private resend: Resend | null = null;

    constructor() {
        if (process.env.RESEND_API_KEY) {
            this.resend = new Resend(process.env.RESEND_API_KEY);
        }
    }

    /**
     * Analyze leverage points to determine negotiation strength
     */
    analyzeLeverage(
        salaryComparison: SalaryComparison,
        hasCompetingOffer: boolean = false,
        hasRelocation: boolean = false
    ): LeverageAnalysis {
        const reasons: string[] = [];
        let score = 0;

        // Check market position
        if (salaryComparison.comparison === "below") {
            const gap = Math.abs(salaryComparison.difference);
            if (gap > 20) {
                reasons.push(`Your offer is ${gap}% below market rate`);
                score += 3;
            } else if (gap > 10) {
                reasons.push(`Your offer is ${gap}% below market average`);
                score += 2;
            } else {
                reasons.push(`Your offer is slightly below market`);
                score += 1;
            }
        } else if (salaryComparison.comparison === "aligned") {
            reasons.push("Your offer is at market rate");
        } else {
            reasons.push("Your offer is above market rate");
            score -= 1;
        }

        // Competing offer leverage
        if (hasCompetingOffer) {
            reasons.push("You have a competing offer");
            score += 2;
        }

        // Relocation leverage
        if (hasRelocation) {
            reasons.push("Relocation costs add negotiation leverage");
            score += 1;
        }

        // Determine scenario
        let suggestedScenario = "aligned";
        if (salaryComparison.comparison === "below") {
            suggestedScenario = "underpaid";
        } else if (hasCompetingOffer) {
            suggestedScenario = "competing_offer";
        } else if (hasRelocation) {
            suggestedScenario = "relocation";
        }

        return {
            leverageLevel: score >= 3 ? "high" : score >= 1 ? "medium" : "low",
            reasons,
            suggestedScenario,
        };
    }

    /**
     * Get and prepare negotiation script
     */
    async prepareScript(
        _offerId: string,
        leverageAnalysis: LeverageAnalysis,
        userData: ExtractedData
    ): Promise<PreparedScript | null> {
        // Fetch script from database
        const script = await prisma.negotiationScript.findFirst({
            where: {
                scenario: leverageAnalysis.suggestedScenario,
                active: true,
            },
        });

        if (!script) {
            logger.warn(`[Negotiation] No script found for scenario: ${leverageAnalysis.suggestedScenario}`);
            return null;
        }

        // Replace placeholders
        let body = script.scriptBody;
        body = body.replace(/\{\{company\}\}/g, userData.companyName || "the company");
        body = body.replace(/\{\{role\}\}/g, userData.jobTitle || "the position");
        body = body.replace(/\{\{salary\}\}/g, userData.baseSalary?.toLocaleString() || "your current offer");
        body = body.replace(/\{\{location\}\}/g, userData.location || "your location");

        return {
            scenario: script.scenario,
            title: script.title,
            body,
            leverageAnalysis,
        };
    }

    /**
     * Send negotiation script via email
     */
    async sendScriptEmail(
        email: string,
        offerId: string,
        script: PreparedScript
    ): Promise<boolean> {
        if (!this.resend) {
            logger.warn("[Negotiation] Resend not configured, skipping email");
            return false;
        }

        try {
            const leverageEmoji = script.leverageAnalysis.leverageLevel === "high" ? "🟢" :
                script.leverageAnalysis.leverageLevel === "medium" ? "🟡" : "🟠";

            await this.resend.emails.send({
                from: process.env.EMAIL_FROM || "noreply@offerlens.com",
                to: email,
                subject: `${leverageEmoji} Your Negotiation Talking Points - ${script.title}`,
                html: `
          <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1a1a1a;">Your Negotiation Strategy</h1>
            
            <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
              <h3 style="margin-top: 0;">Leverage Analysis: ${script.leverageAnalysis.leverageLevel.toUpperCase()}</h3>
              <ul style="margin-bottom: 0;">
                ${script.leverageAnalysis.reasons.map(r => `<li>${r}</li>`).join("")}
              </ul>
            </div>
            
            <h2>Talking Points: ${script.title}</h2>
            <div style="white-space: pre-wrap; line-height: 1.6;">
${script.body}
            </div>
            
            <hr style="margin: 32px 0; border: none; border-top: 1px solid #e5e5e5;">
            
            <p style="color: #666; font-size: 14px;">
              💡 <strong>Tip:</strong> Practice these points out loud before your call. Confidence matters!
            </p>
            
            <p style="color: #999; font-size: 12px;">
              This email was sent by OfferLens. Offer ID: ${offerId}
            </p>
          </div>
        `,
            });

            logger.info(`[Negotiation] Email sent to ${email} for offer ${offerId}`);
            return true;
        } catch (error) {
            logger.error("[Negotiation] Email send failed", { error });
            return false;
        }
    }

    /**
     * Seed negotiation scripts into database
     */
    async seedScripts(): Promise<void> {
        const scripts = [
            {
                scenario: "underpaid",
                title: "Market Rate Adjustment",
                scriptBody: `**Opening Statement:**
"Thank you for the offer to join {{company}} as a {{role}}. I'm excited about this opportunity and want to make sure we can come to an agreement that works for both of us."

**State Your Case:**
"Based on my research of market rates for similar roles in {{location}}, I've found that the typical compensation range is higher than the current offer. I'd like to discuss adjusting the base salary to be more aligned with market expectations."

**Specific Ask:**
"I was hoping we could adjust the base to [TARGET AMOUNT] to bring it in line with the market rate. This would allow me to accept immediately and focus fully on making an impact at {{company}}."

**Close:**
"I'm very enthusiastic about this role and believe I can contribute significantly. Is there flexibility on the compensation package?"`,
            },
            {
                scenario: "competing_offer",
                title: "Competing Offer Leverage",
                scriptBody: `**Opening Statement:**
"I really appreciate the offer from {{company}}. I want to be transparent with you—I've also received another competitive offer that I'm considering."

**Explain Your Preference:**
"{{company}} is my first choice because [REASON: culture/team/mission/etc.]. However, the other offer is more competitive from a compensation standpoint."

**Bridge the Gap:**
"If {{company}} could match or come closer to the other offer, I'd be ready to accept. Specifically, I'm looking at [SPECIFIC AMOUNT OR RANGE]."

**Close:**
"I'd really prefer to join {{company}}. Is there room to revisit the package so I can make this decision?"`,
            },
            {
                scenario: "relocation",
                title: "Relocation Consideration",
                scriptBody: `**Opening Statement:**
"I'm thrilled about the opportunity to join {{company}} as a {{role}}. Before I can formally accept, I'd like to discuss the relocation aspect of this move."

**Highlight Costs:**
"Moving to {{location}} involves significant costs including housing deposits, moving expenses, and cost-of-living adjustments. I want to make sure the total package accounts for this transition."

**Specific Ask:**
"Would {{company}} be able to provide a signing bonus or relocation stipend to help offset these costs? A one-time payment of [AMOUNT] would make it much easier for me to commit."

**Alternative:**
"Alternatively, if a signing bonus isn't possible, perhaps we could discuss a higher base salary to account for the cost-of-living difference."`,
            },
            {
                scenario: "aligned",
                title: "Non-Salary Benefits Discussion",
                scriptBody: `**Opening Statement:**
"Thank you for the offer to join {{company}}. The base salary is fair, and I appreciate that. Before accepting, I'd like to explore a few other aspects of the package."

**Areas to Discuss:**
- **Equity/Stock:** "Is there flexibility on the equity component? Additional RSUs would increase my long-term investment in {{company}}'s success."
- **Sign-on Bonus:** "Would a sign-on bonus be possible to help with my transition?"
- **Paid Time Off:** "Could we discuss additional PTO days given my experience level?"
- **Start Date:** "Is there flexibility on the start date to allow for a proper transition?"

**Close:**
"I'm ready to move forward once we finalize these details. What's possible on your end?"`,
            },
        ];

        for (const script of scripts) {
            await prisma.negotiationScript.upsert({
                where: { scenario: script.scenario },
                create: script,
                update: { title: script.title, scriptBody: script.scriptBody },
            });
            logger.info(`[Negotiation] Upserted script: ${script.scenario}`);
        }

        logger.info("[Negotiation] Script seeding complete");
    }
}

export const negotiationService = new NegotiationService();
