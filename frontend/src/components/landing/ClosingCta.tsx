import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

/**
 * Landing Section D — closing call to action. Reuses the hero `Button` recipe and the
 * `.bg-graph` + `.in-focus` backdrop. Navigation to /upload only — no data fetching, no API.
 * The portfolio credit lives in the Footer (one tasteful placement).
 */
const ClosingCta = () => {
  const navigate = useNavigate();

  return (
    <section className="bg-graph py-16 lg:py-24">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6">
        <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm in-focus sm:p-12">
          <p className="font-mono text-xs uppercase tracking-widest text-cyan-700">// read your own offer</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
            See what your letter really says
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-stone-700">
            No account to get your score. It takes about 15–30 seconds.
          </p>
          <div className="mt-8">
            <Button
              onClick={() => navigate("/upload")}
              className="h-11 rounded-md bg-cyan-700 px-6 text-base font-medium text-white hover:bg-cyan-800 cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Drop or paste your offer
              <ArrowRight className="ml-2 h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ClosingCta;
