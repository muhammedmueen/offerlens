import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import SalaryContributeForm from "./SalaryContributeForm";
import {
  buildPrefill, getContribState, setContribState, shouldOfferContribution, type ContributionAnalysis,
} from "@/lib/salary-contribution";

type Phase = "collapsed" | "form" | "sent" | "dismissed";

const SENT_TEXT =
  "Thank you. Your data point is added without your name. It will not show up in anyone's benchmark right away: "
  + "we only show a range for a role and city once we have at least 10 data points, and analyses already done are not updated.";
const DISMISSED_TEXT = "Got it. We will not ask again for this offer.";

const inr = new Intl.NumberFormat("en-IN");

/**
 * Optional, per-offer prompt to share this offer's numbers through the existing POST /salaries.
 * Never posts on mount, expand, dismiss or a timer; the only path is the form's Send button.
 * The wrapper and its live region stay mounted through every state so focus and announcements have a target.
 */
const ContributeSalaryCard = ({ offerId, analysis }: { offerId: string; analysis: ContributionAnalysis }) => {
  // Decided once, synchronously: no flash, no layout shift. A storage error means "show this page load".
  const [visible] = useState(() => shouldOfferContribution(analysis, getContribState(offerId) !== null));
  const [phase, setPhase] = useState<Phase>("collapsed");
  const [message, setMessage] = useState("");
  const reviewRef = useRef<HTMLButtonElement>(null);
  const ackRef = useRef<HTMLParagraphElement>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    if (phase === "sent" || phase === "dismissed") ackRef.current?.focus();
    else if (phase === "collapsed" && restoreFocus.current) {
      restoreFocus.current = false;
      reviewRef.current?.focus();
    }
  }, [phase]);

  if (!visible) return null;

  const prefill = buildPrefill(analysis);
  const raw = analysis.extractedData?.compensation?.totalCTC;
  const ctcHint = typeof raw === "number" && String(Math.round(raw)) !== prefill.ctc
    ? `Rounded to the nearest ₹10,000 from the ₹${inr.format(Math.round(raw))} in your offer letter. Edit it if you like.`
    : "From your offer letter. Edit it if you like.";

  return (
    <section aria-labelledby="contribute-heading" className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      {/* Always mounted and empty until used, so announcements are reliable. Holds only the cooldown and validation messages. */}
      <div role="status" aria-live="polite" className="text-sm text-foreground">{message}</div>
      <div className="space-y-4">
      <h2 id="contribute-heading" className="font-semibold text-foreground">Help others see real offers</h2>
      {phase === "sent" || phase === "dismissed" ? (
        <p ref={ackRef} tabIndex={-1} className="text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {phase === "sent" ? SENT_TEXT : DISMISSED_TEXT}
        </p>
      ) : (
        <>
          {phase === "collapsed" ? (
            <>
              <p className="text-sm text-foreground">
                Share this offer&apos;s numbers as a data point, stored without your name, account, company name or
                offer letter. You review every field first, and nothing is sent until you press Send data point.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button ref={reviewRef} variant="outline" onClick={() => setPhase("form")} className="cursor-pointer rounded-xl text-foreground">
                  Review and share
                </Button>
                <Button
                  variant="outline"
                  className="cursor-pointer rounded-xl text-foreground"
                  onClick={() => { setContribState(offerId, "dismissed"); setMessage(""); setPhase("dismissed"); }}
                >
                  No thanks
                </Button>
              </div>
            </>
          ) : (
            <SalaryContributeForm
              idPrefix="contrib"
              initial={prefill}
              companyName={analysis.extractedData?.companyName}
              ctcHint={ctcHint}
              offerId={offerId}
              cancelLabel="Cancel"
              focusFirstEmpty
              announce={setMessage}
              onSent={() => { setMessage(""); setPhase("sent"); }}
              onCancel={() => { restoreFocus.current = true; setMessage(""); setPhase("collapsed"); }}
            />
          )}
        </>
      )}
      </div>
    </section>
  );
};

export default ContributeSalaryCard;
