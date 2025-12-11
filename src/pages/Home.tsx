import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Nav } from "@/components/NavLink";
import { FAQ } from "@/components/FAQ";
import { Shield, TrendingUp, FileText, ArrowRight, Sparkles, Play } from "lucide-react";

export default function Home() {
  const navigate = useNavigate();

  const features = [
    {
      icon: FileText,
      title: "Smart Extraction",
      description: "Upload PDF or image, we extract the details instantly",
    },
    {
      icon: Shield,
      title: "Red Flag Detection",
      description: "Identify bonds, non-competes, and hidden clauses",
    },
    {
      icon: TrendingUp,
      title: "Market Comparison",
      description: "See how your offer stacks against industry standards",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Nav />

      {/* Hero Section */}
      <main className="pt-14 sm:pt-16">
        <section className="relative overflow-hidden">
          {/* Background Elements */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute top-20 left-1/4 w-48 sm:w-72 h-48 sm:h-72 bg-primary/5 rounded-full blur-3xl" />
            <div className="absolute bottom-20 right-1/4 w-64 sm:w-96 h-64 sm:h-96 bg-primary/5 rounded-full blur-3xl" />
          </div>

          <div className="container mx-auto px-4 sm:px-6 py-16 sm:py-24 md:py-32 lg:py-40">
            <div className="max-w-3xl mx-auto text-center">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-primary/10 text-primary text-xs sm:text-sm font-medium mb-6 sm:mb-8 opacity-0 animate-fade-in" style={{ animationFillMode: "forwards" }}>
                <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>Rule-based analysis • No AI guessing</span>
              </div>

              {/* Main Title */}
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-foreground tracking-tight mb-4 sm:mb-6 opacity-0 animate-fade-in-up" style={{ animationDelay: "100ms", animationFillMode: "forwards" }}>
                See the truth behind{" "}
                <span className="text-primary">your job offer</span>
              </h1>

              {/* Tagline */}
              <p className="text-base sm:text-lg md:text-xl text-muted-foreground mb-8 sm:mb-10 opacity-0 animate-fade-in-up" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
                Upload, scan, understand, negotiate.
              </p>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 opacity-0 animate-fade-in-up" style={{ animationDelay: "300ms", animationFillMode: "forwards" }}>
                <Button
                  variant="hero"
                  size="xl"
                  onClick={() => navigate("/upload")}
                  className="group w-full sm:w-auto min-h-[48px]"
                >
                  Start Analysis
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => navigate("/upload?demo=true")}
                  className="group w-full sm:w-auto min-h-[48px]"
                >
                  <Play className="w-4 h-4" />
                  Try with Sample
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-16 sm:py-20 bg-secondary/30">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={index}
                    className="floating-card group opacity-0 animate-fade-in-up"
                    style={{ animationDelay: `${400 + index * 100}ms`, animationFillMode: "forwards" }}
                  >
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3 sm:mb-4 group-hover:bg-primary/20 transition-colors">
                      <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                    </div>
                    <h3 className="text-base sm:text-lg font-semibold text-foreground mb-1 sm:mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-sm sm:text-base text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-16 sm:py-20">
          <div className="container mx-auto px-4 sm:px-6">
            <div className="max-w-2xl mx-auto text-center mb-10 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3 sm:mb-4">
                How It Works
              </h2>
              <p className="text-sm sm:text-base text-muted-foreground">
                Three simple steps to decode your offer letter
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-6 sm:gap-8 max-w-4xl mx-auto">
              {[
                { step: "1", title: "Upload", desc: "Drop your offer letter PDF or paste the text" },
                { step: "2", title: "Analyze", desc: "We scan for red flags and compare market rates" },
                { step: "3", title: "Negotiate", desc: "Get actionable suggestions to improve your offer" },
              ].map((item, index) => (
                <div key={index} className="text-center opacity-0 animate-fade-in-up" style={{ animationDelay: `${600 + index * 100}ms`, animationFillMode: "forwards" }}>
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg sm:text-xl font-bold mx-auto mb-3 sm:mb-4">
                    {item.step}
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-foreground mb-1 sm:mb-2">
                    {item.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <FAQ />

        {/* Bottom CTA */}
        <section className="py-16 sm:py-20 bg-secondary/30">
          <div className="container mx-auto px-4 sm:px-6 text-center">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-3 sm:mb-4">
              Ready to analyze your offer?
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-8">
              Get insights in under a minute
            </p>
            <Button
              variant="hero"
              size="lg"
              onClick={() => navigate("/upload")}
              className="group min-h-[48px]"
            >
              Get Started
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </section>
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
