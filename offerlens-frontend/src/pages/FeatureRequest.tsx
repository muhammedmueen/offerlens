import { Link } from "react-router-dom";
import { Nav } from "@/components/NavLink";
import { FeatureRequestForm } from "@/components/FeatureRequestForm";
import { ArrowLeft, MessageSquarePlus } from "lucide-react";

/**
 * FeatureRequest Page
 * Requirements: 3.1, 3.2, 3.3
 * 
 * Allows users to submit feature requests, role requests, or report issues
 */

export default function FeatureRequest() {
  return (
    <div className="min-h-screen bg-background">
      <Nav />

      {/* Main Content */}
      <main className="pt-20 sm:pt-24 pb-12 sm:pb-16">
        <div className="container mx-auto px-4 sm:px-6 max-w-2xl">
          {/* Back Link */}
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 sm:mb-8 transition-colors min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>

          {/* Page Header */}
          <div className="mb-8 text-center opacity-0 animate-fade-in" style={{ animationFillMode: "forwards" }}>
            <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-primary/10 mb-4">
              <MessageSquarePlus className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
              Share Your Feedback
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Request a new role, suggest a feature, or report an issue
            </p>
          </div>

          {/* Feature Request Form */}
          <div className="floating-card opacity-0 animate-fade-in-up" style={{ animationDelay: "100ms", animationFillMode: "forwards" }}>
            <FeatureRequestForm />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 sm:py-8 border-t border-border">
        <div className="container mx-auto px-4 sm:px-6 text-center text-xs sm:text-sm text-muted-foreground">
          <p>OfferLens • Decode your offer with confidence</p>
        </div>
      </footer>
    </div>
  );
}
