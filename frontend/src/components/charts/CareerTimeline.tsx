interface Milestone {
  year: number;
  title: string;
  salaryRange: string;
  skills: string[];
}

interface CareerTimelineProps {
  milestones: Milestone[];
}

const CareerTimeline: React.FC<CareerTimelineProps> = ({ milestones }) => (
  <div className="relative pl-8">
    <div className="absolute left-3 top-0 h-full w-0.5 bg-border" />
    {milestones.map((m, i) => (
      <div key={i} className="relative mb-8 last:mb-0">
        <div className="absolute -left-5 top-1 h-4 w-4 rounded-full border-2 border-primary bg-background" />
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-xs font-semibold text-primary">Year {m.year}</span>
            <h4 className="font-semibold text-sm">{m.title}</h4>
          </div>
          <p className="text-xs text-muted-foreground mb-2">{m.salaryRange}</p>
          <div className="flex flex-wrap gap-1">
            {m.skills.map((s) => (
              <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{s}</span>
            ))}
          </div>
        </div>
      </div>
    ))}
  </div>
);

export default CareerTimeline;
