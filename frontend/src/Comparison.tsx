import { useState } from "react";
import type { Plan, Snapshot } from "./types";
import { litres } from "./api";
import { Field } from "./ui";
export function Comparison({
  snapshot,
  versions,
}: {
  snapshot: Snapshot;
  versions: Plan[];
}) {
  const [version, setVersion] = useState("");
  const other = versions.find((p) => String(p.id) === version);
  return (
    <details className="history comparison">
      <summary>Compare allocation outcomes</summary>
      <p className="muted">
        First-come is a volume comparison ordered by submission time. It does
        not override the selected policy or provide a replacement schedule.
      </p>
      <Field label="Compare with a saved plan">
        <select value={version} onChange={(e) => setVersion(e.target.value)}>
          <option value="">First-come baseline only</option>
          {versions.map((p) => (
            <option key={p.id} value={p.id}>
              Plan {p.id} · revision {p.revision} · {p.status}
            </option>
          ))}
        </select>
      </Field>
      <div className="comparison-rows">
        {snapshot.rows.map((r) => {
          const previous = other?.snapshot.rows.find(
            (p) => p.plot_id === r.plot_id,
          );
          return (
            <div className="comparison-row" key={r.plot_id}>
              <strong>{r.name}</strong>
              <div>
                <span>Viewed allocation</span>
                <b>{litres(r.allocated_ml)} L</b>
                <small>
                  {r.allocated_ml === null
                    ? "Infeasible"
                    : `${r.fulfillment.toFixed(1)}% of approved`}
                </small>
              </div>
              <div>
                <span>First-come baseline</span>
                <b>{litres(r.baseline_ml)} L</b>
                <small>
                  {r.approved_ml
                    ? ((r.baseline_ml / r.approved_ml) * 100).toFixed(1)
                    : "0.0"}
                  % of approved
                </small>
              </div>
              {other && (
                <div>
                  <span>Plan {other.id}</span>
                  <b>{litres(previous?.allocated_ml)} L</b>
                  <small>
                    {previous?.allocated_ml != null
                      ? `${previous.fulfillment.toFixed(1)}% of approved`
                      : "No allocation"}
                  </small>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}
