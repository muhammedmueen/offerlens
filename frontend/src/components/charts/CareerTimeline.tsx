/**
 * Milestone shape as the API actually returns it.
 *
 * This component previously required `skills: string[]` on every milestone. The career
 * path endpoint returns `{ year, title, focus, salaryRange }` and has no per-milestone
 * skills field — it returns `skillsToLearn` at the top level instead. So `m.skills.map()`
 * threw "Cannot read properties of undefined", which crashed the whole results page
 * because there was no error boundary above it.
 *
 * Everything except `year` is optional now, because the model does occasionally omit a
 * field and one gap should degrade a card rather than white-screen the app.
 */
export interface Milestone {
  year: number | string;
  title?: string;
  /** Prose description of the focus for that year. */
  focus?: string;
  salaryRange?: string;
  /** Not returned today, but harmless to render if it appears. */
  skills?: string[];
}

interface CareerTimelineProps {
  milestones: Milestone[];
}

const CareerTimeline: React.FC<CareerTimelineProps> = ({ milestones }) => {
  const items = Array.isArray(milestones) ? milestones : [];

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No trajectory could be generated for this role.
      </p>
    );
  }

  return (
    <div className="relative pl-8">
      <div className="absolute left-3 top-0 h-full w-0.5 bg-border" />
      {items.map((m, i) => (
        <div key={i} className="relative mb-8 last:mb-0">
          <div className="absolute -left-5 top-1 h-4 w-4 rounded-full border-2 border-primary bg-background" />
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-xs font-semibold text-primary">Year {m.year}</span>
              {m.title && <h4 className="font-semibold text-sm">{m.title}</h4>}
            </div>
            {m.focus && <p className="text-xs text-muted-foreground mb-2">{m.focus}</p>}
            {m.salaryRange && (
              <p className="text-xs font-medium text-foreground mb-2">{m.salaryRange}</p>
            )}
            {Array.isArray(m.skills) && m.skills.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {m.skills.map((s) => (
                  <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CareerTimeline;
