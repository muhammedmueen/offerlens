import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import PageShell from "@/components/layout/PageShell";
import { Upload, FileSearch, BarChart3, ShieldAlert, ArrowRight, CheckCircle } from "lucide-react";
import { motion } from "framer-motion";

const stats = [
  { label: "Offers Analyzed", value: "12,400+" },
  { label: "Avg Score", value: "67" },
  { label: "Red Flags Found", value: "34,000+" },
];

const steps = [
  { icon: Upload, title: "Upload", desc: "Drop your offer letter — PDF or image" },
  { icon: FileSearch, title: "AI Analyzes", desc: "We extract and benchmark every detail" },
  { icon: BarChart3, title: "Get Score", desc: "See your score, red flags, and tips" },
];

const features = [
  { icon: BarChart3, title: "Salary Benchmarking", desc: "Compare against real market data" },
  { icon: ShieldAlert, title: "Red Flag Detection", desc: "Spot non-competes, probation traps, and more" },
  { icon: CheckCircle, title: "Negotiation Tips", desc: "Actionable advice to get a better deal" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <PageShell>
      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-4 py-24 text-center md:py-32 skeu-subtle-bg">
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-5xl lg:text-6xl text-foreground"
        >
          Is your offer actually good?{" "}
          <span className="brand-gradient-text">Find out in 30 seconds.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mt-4 max-w-lg text-muted-foreground md:text-lg"
        >
          No signup required. Free. Private.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4, duration: 0.4, ease: "easeOut" }}
        >
          <Button
            onClick={() => navigate("/upload")}
            className="mt-8 h-12 px-8 text-base font-semibold brand-gradient text-primary-foreground hover:opacity-90 transition-all hover:-translate-y-0.5 hover:glow-primary cursor-pointer rounded-xl skeu-btn"
          >
            Upload Your Offer Letter
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </motion.div>
      </section>

      {/* 3-Step Flow */}
      <section className="container mx-auto px-4 pb-20">
        <motion.div
          className="grid gap-8 md:grid-cols-3"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          variants={stagger}
        >
          {steps.map((s, i) => (
            <motion.div
              key={i}
              custom={i}
              variants={fadeUp}
              whileHover={{ y: -6, transition: { duration: 0.2 } }}
              className="flex flex-col items-center gap-3 rounded-2xl p-6 text-center transition-shadow skeu-card"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 skeu-emboss">
                <s.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground">{s.title}</h3>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Stats */}
      <motion.section
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-40px" }}
        variants={stagger}
        className="border-y border-border py-12"
        style={{ background: 'var(--surface-gradient)' }}
      >
        <div className="container mx-auto grid grid-cols-3 gap-4 px-4 text-center">
          {stats.map((s, i) => (
            <motion.div key={s.label} custom={i} variants={fadeUp}>
              <p className="text-2xl font-bold text-primary md:text-3xl">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Features */}
      <section className="container mx-auto px-4 py-20">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-10 text-center text-2xl font-bold md:text-3xl text-foreground"
        >
          What you get
        </motion.h2>
        <motion.div
          className="grid gap-8 md:grid-cols-3"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          variants={stagger}
        >
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              custom={i}
              variants={fadeUp}
              whileHover={{ y: -6, transition: { duration: 0.2 } }}
              className="flex gap-4 rounded-2xl p-6 transition-shadow skeu-card"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/10 skeu-emboss">
                <f.icon className="h-5 w-5 text-secondary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>
    </PageShell>
  );
};

export default LandingPage;
