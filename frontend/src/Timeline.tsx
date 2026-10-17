import type { Snapshot, Turn } from "./types";
import { clock, litres } from "./api";
import { Alert, Empty } from "./ui";
export function Timeline({
  snapshot,
  turns,
  selected,
  onSelect,
}: {
  snapshot: Snapshot | null;
  turns: Turn[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  if (!snapshot)
    return (
      <section className="timeline-section">
        <h2>Watering schedule</h2>
        <Empty title="A turn for every allocated plot">
          Generate a plan to calculate a feasible order and watering times.
        </Empty>
      </section>
    );
  const source = snapshot.source,
    span = source.end - source.start;
  return (
    <section className="timeline-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">One hose · one turn at a time</span>
          <h2>Watering schedule</h2>
        </div>
        <span className="muted text-sm">
          {source.changeover / 60} min changeover · Asia/Bishkek
        </span>
      </div>
      {!snapshot.feasible ? (
        <Alert>
          <strong>No feasible turn schedule</strong>
          {snapshot.errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
          <p>
            Calculated allocations are unscheduled. Publication is disabled.
          </p>
        </Alert>
      ) : snapshot.schedule.length === 0 ? (
        <p className="muted">
          No positive allocations; no watering turns are needed.
        </p>
      ) : (
        <>
          <div className="timeline-desktop">
            <div className="time-ruler">
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} style={{ left: `${i * 25}%` }}>
                  {clock(source.start + Math.round((span * i) / 4))}
                </span>
              ))}
            </div>
            <div className="time-track">
              {snapshot.schedule.map((t) => (
                <button
                  key={t.plot_id}
                  title={`Plot ${t.plot_id}: ${clock(t.start)}–${clock(t.end)}, ${litres(t.allocated_ml)} L`}
                  style={{
                    left: `${((t.start - source.start) / span) * 100}%`,
                    width: `${((t.end - t.start) / span) * 100}%`,
                  }}
                  className={`time-block ${(t.end - t.start) / span < 0.06 ? "narrow" : ""} ${selected === t.plot_id ? "selected" : ""} ${turns.find((x) => x.plot_id === t.plot_id)?.state === "Completed" ? "completed" : ""}`}
                  onClick={() => onSelect(t.plot_id)}
                >
                  <strong>{t.plot_id}</strong>
                  <span>{litres(t.allocated_ml)} L</span>
                </button>
              ))}
            </div>
          </div>
          <ol className="turn-list">
            {snapshot.schedule.map((t, i) => (
              <li key={t.plot_id}>
                <span className="turn-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <button
                  onClick={() => onSelect(t.plot_id)}
                  className="text-button"
                >
                  Plot {t.plot_id}
                </button>
                <span>
                  {clock(t.start)}–{clock(t.end)}
                </span>
                <strong>{litres(t.allocated_ml)} L</strong>
              </li>
            ))}
          </ol>
          <p className="timeline-note">
            Planned times are fixed at publication. Actual start and finish
            times are recorded in Delivery.
          </p>
        </>
      )}
    </section>
  );
}
