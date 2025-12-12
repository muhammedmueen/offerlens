import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Nav } from "@/components/NavLink";
import { FeedbackForum } from "@/components/FeedbackForum";
import { ArrowLeft, MessageSquarePlus, Users } from "lucide-react";

/**
 * Forum Page
 * Requirements: 14.1, 14.2, 14.3, 14.4
 * 
 * Public feedback forum where users can view and vote on feature requests
 */

export default function Forum() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <Nav />

      {/* Main Content */}
      <main className="pt-20 sm:pt-24 pb-12 sm:pb-16">
        <div className="container mx-auto px-4 sm:px-6 max-w-4xl">
          {/* Back Link */}
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 sm:mb-8 transition-colors min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>

          {/* Page Header */}
          <div className="mb-8 opacity-0 animate-fade-in" style={{ animationFillMode: "forwards" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-primary/10">
                  <Users className="w-7 h-7 sm:w-8 sm:h-8 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                    Community Feedback
                  </h1>
                  <p className="text-sm sm:text-base text-muted-foreground">
                    Vote on features and see what's coming next
                  </p>
                </div>
              </div>
              <Button
                variant="hero"
                size="sm"
                onClick={() => navigate("/feature-request")}
                className="hidden sm:flex"
              >
                <MessageSquarePlus className="w-4 h-4" />
                Submit Request
              </Button>
            </div>

            {/* Mobile Submit Button */}
            <Button
              variant="hero"
              size="sm"
              onClick={() => navigate("/feature-request")}
              className="w-full sm:hidden"
            >
              <MessageSquarePlus className="w-4 h-4" />
              Submit Request
            </Button>
          </div>

          {/* Feedback Forum */}
          <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: "100ms", animationFillMode: "forwards" }}>
            <FeedbackForum />
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
