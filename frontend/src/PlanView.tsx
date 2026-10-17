import { useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  FlaskConical,
  SlidersHorizontal,
} from "lucide-react";
import type { Day, Plot, Snapshot, Mutate, User, Source } from "./types";
import { api, clock, litres, ml, seconds, timestamp } from "./api";
import { Alert, Badge, Field, Form, Modal } from "./ui";
import { Garden } from "./Garden";
import { Timeline } from "./Timeline";
import { Comparison } from "./Comparison";
export function sourceValues(f: FormData) {
  return {
    opening_ml: ml(f.get("opening")),
    flow_ml_min: ml(f.get("flow")),
    start: seconds(f.get("start")),
    end: seconds(f.get("end")),
    changeover: Math.round(Number(f.get("changeover")) * 60),
    policy: String(f.get("policy")),
  };
}
export function SourceFields({
  source,
  policy,
}: {
  source: Source;
  policy: string;
}) {
  return (
    <div className="form-grid">
      <Field label="Opening water budget (L)">
        <input
          name="opening"
          type="number"
          min="0"
          step="0.001"
          defaultValue={source.opening_ml / 1000}
          required
        />
      </Field>
      <Field label="Delivery rate (L/min)">
        <input
          name="flow"
          type="number"
          min="0.001"
          step="0.001"
          defaultValue={source.flow_ml_min / 1000}
          required
        />
      </Field>
      <Field label="Source opens">
        <input
          name="start"
          type="time"
          defaultValue={clock(source.start).slice(0, 5)}
          required
        />
      </Field>
      <Field label="Source closes">
        <input
          name="end"
          type="time"
          defaultValue={clock(source.end).slice(0, 5)}
          required
        />
      </Field>
      <Field label="Hose changeover (minutes)">
        <input
          name="changeover"
          type="number"
          min="0"
          max="60"
          step="0.1"
          defaultValue={source.changeover / 60}
          required
        />
      </Field>
      <Field label="Allocation policy">
        <select name="policy" defaultValue={policy}>
          <option value="proportional">Proportional approved need</option>
          <option value="minimums">Agreed minimums first</option>
        </select>
      </Field>
    </div>
  );
}
export function PlanView({
  day,
  plots,
  user,
  selected,
  setSelected,
  mutate,
  go,
}: {
  day: Day;
  plots: Plot[];
  user: User;
  selected: string;
  setSelected: (id: string) => void;
  mutate: Mutate;
  go: (tab: string) => void;
}) {
  const coord = user.role === "coordinator",
    saved = day.plan?.snapshot || day.draft?.snapshot || null;
  const [scenario, setScenario] = useState<Snapshot | null>(null),
    [preset, setPreset] = useState("saved"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [settings, setSettings] = useState(false),
    [settingsRevision, setSettingsRevision] = useState(day.revision),
    [explore, setExplore] = useState(false),
    [history, setHistory] = useState<number | null>(null);
  const token = useRef(0),
    revision = useRef(day.revision);
  revision.current = day.revision;
  const liveScenario = scenario?.revision === day.revision ? scenario : null;
  const snap = history
    ? day.history.find((p) => p.id === history)?.snapshot || saved
    : liveScenario || saved;
  const row = snap?.rows.find((r) => r.plot_id === selected),
    req = day.requests.find((r) => r.plot_id === selected),
    plot = plots.find((p) => p.id === selected);
  const pending = day.requests.filter((r) => r.status === "pending").length;
  async function action(path: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      await mutate(path, extra);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function runScenario(
    value: string,
    custom?: ReturnType<typeof sourceValues>,
  ) {
    const id = ++token.current;
    const rev = day.revision;
    setBusy(true);
    setPreset(value);
    setError("");
    try {
      const result = await api<Snapshot>(`/days/${day.date}/preview`, "POST", {
        revision: rev,
        preset: value,
        ...(custom ? { source: { ...custom, revision: rev } } : {}),
      });
      if (id === token.current && revision.current === rev) {
        setScenario(result);
        setHistory(null);
      }
    } catch (e) {
      if (id === token.current) setError((e as Error).message);
    } finally {
      if (id === token.current) setBusy(false);
    }
  }
  return (
    <>
      <div className="action-strip">
        <div>
          <span className="step-marker">
            {day.state === "Planning"
              ? "01"
              : day.state === "Ready"
                ? "02"
                : "03"}
          </span>
          <div>
            <strong>
              {day.state === "Planning"
                ? !day.requests.length
                  ? "Collect the first watering request"
                  : pending
                    ? `${pending} request${pending === 1 ? "" : "s"} awaiting review`
                    : day.draft
                      ? "Review the allocation, then publish"
                      : "Approved needs, ready to share"
                : day.state === "Ready"
                  ? "The community plan is published"
                  : day.state === "Active"
                    ? "Watering is underway"
                    : "This watering day is complete"}
            </strong>
            <p>
              {day.state === "Planning"
                ? "Only approved requests enter the plan. Every litre has an explanation."
                : day.state === "Ready"
                  ? "Growers can see their allocation and turn. Start watering when ready."
                  : "The published plan stays fixed. See actual deliveries in the water ledger."}
            </p>
          </div>
        </div>
        <div className="action-buttons">
          {coord && day.state === "Planning" ? (
            <>
              {pending > 0 && (
                <button className="button" onClick={() => go("requests")}>
                  Review requests
                </button>
              )}
              <button
                className={`button ${day.draft ? "" : "primary"}`}
                disabled={busy}
                onClick={() => action("/drafts")}
              >
                {day.draft ? "Generate new draft" : "Generate plan"}
                <ArrowRight size={16} />
              </button>
              {day.draft && (
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    !day.draft.snapshot.feasible ||
                    !day.draft.snapshot.rows.length ||
                    !!liveScenario ||
                    !!history
                  }
                  onClick={() =>
                    action("/publish", { draft_id: day.draft!.id })
                  }
                >
                  Publish plan
                  <Check size={16} />
                </button>
              )}
            </>
          ) : (
            <>
              <button
                className="button primary"
                onClick={() =>
                  go(day.state === "Planning" ? "requests" : "delivery")
                }
              >
                {day.state === "Planning"
                  ? "Save a request"
                  : day.state === "Ready"
                    ? "Begin watering"
                    : "View delivery ledger"}
                <ArrowRight size={16} />
              </button>
              {coord && day.state === "Ready" && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => action("/reopen")}
                >
                  Reopen for changes
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {error && <Alert>{error}</Alert>}
      {coord && (
        <div className="source-strip">
          <span className="eyebrow">Source & rule</span>
          <span>
            <strong>{litres(day.source.flow_ml_min)}</strong> L/min
          </span>
          <span>
            {clock(day.source.start)}–{clock(day.source.end)}
          </span>
          <span>{day.source.changeover / 60} min changeover</span>
          <span className="policy-name">
            {day.policy === "minimums"
              ? "Agreed minimums first"
              : "Proportional approved need"}
          </span>
          <button
            className="text-button"
            onClick={() => {
              setSettingsRevision(day.revision);
              setSettings(true);
            }}
          >
            <SlidersHorizontal size={14} />
            {day.state === "Planning" ? "Edit settings" : "View settings"}
          </button>
          <button className="text-button" onClick={() => setExplore(!explore)}>
            <FlaskConical size={15} />
            Explore scenarios
          </button>
        </div>
      )}
      {explore && coord && (
        <section className="scenario-box">
          <div className="section-heading">
            <div>
              <span className="eyebrow">A separate working page</span>
              <h2>Explore a scenario</h2>
            </div>
            <button
              className="text-button"
              onClick={() => {
                setScenario(null);
                setPreset("saved");
                token.current++;
                setExplore(false);
              }}
            >
              Return to saved plan
            </button>
          </div>
          <p>
            Previews do not change saved requests, the source budget, or
            delivery history. To use different inputs, edit the planning records
            and generate a new draft.
          </p>
          <div className="preset-buttons">
            {[
              ["adequate", "Adequate supply"],
              ["shortage", "160 L shortage"],
              ["changed-b", "B: later availability"],
              ["short-f", "F: only 10 minutes"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={`button ${preset === value ? "active" : ""}`}
                disabled={busy}
                onClick={() => runScenario(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <details>
            <summary>Custom source scenario</summary>
            <Form
              submit="Preview scenario"
              successText="Scenario calculated. Saved records are unchanged."
              onSubmit={async (f) => runScenario("custom", sourceValues(f))}
            >
              <SourceFields source={day.source} policy={day.policy} />
            </Form>
          </details>
          {liveScenario && (
            <p className="scenario-label">
              <FlaskConical size={16} />
              Unsaved scenario · {litres(liveScenario.totals.allocated_ml)} L
              allocated · {litres(liveScenario.totals.unmet_ml)} L unmet ·{" "}
              {liveScenario.feasible
                ? "feasible schedule"
                : "no complete schedule"}
            </p>
          )}
          {preset === "adequate" && liveScenario && (
            <p className="muted text-sm">
              Supply meets approved need. Existing windows and source hours
              still apply, so sufficient water may not mean sufficient time.
            </p>
          )}
        </section>
      )}
      {history && (
        <Alert kind="info">
          Viewing historical plan {history}.{" "}
          <button className="text-button" onClick={() => setHistory(null)}>
            Return to current plan
          </button>
        </Alert>
      )}
      <div className="plan-workspace">
        <Garden
          plots={
            snap
              ? snap.requests.map((r) => ({
                  id: r.plot_id,
                  name: r.name,
                  grower_id: r.grower_id,
                  crop: r.crop,
                  area: r.area,
                  position: r.position,
                  active: true,
                }))
              : plots
          }
          snapshot={snap}
          selected={selected}
          onSelect={setSelected}
          opening={snap?.source.opening_ml ?? day.source.opening_ml}
        />
        <section className="plot-ledger">
          <div className="section-heading">
            <div>
              <span className="eyebrow">The allocation ledger</span>
              <h2>Every plot, a fair share</h2>
            </div>
            <span className="count-label">
              {snap?.rows.length ?? day.requests.length} plots
            </span>
          </div>
          <div className="ledger-head">
            <span>Plot / grower</span>
            <span>Approved</span>
            <span>Allocated</span>
            <span>Share met</span>
          </div>
          <div className="ledger-rows">
            {(snap ? snap.rows : day.requests).map((r) => {
              const allocation = snap?.rows.find(
                (x) => x.plot_id === r.plot_id,
              );
              const a = allocation?.allocated_ml ?? null;
              const fulfillment = allocation?.fulfillment ?? 0;
              return (
                <button
                  key={r.plot_id}
                  className={`ledger-row ${selected === r.plot_id ? "selected" : ""}`}
                  onClick={() => setSelected(r.plot_id)}
                  aria-label={`View ${r.name} allocation`}
                  aria-pressed={selected === r.plot_id}
                >
                  <span className="plot-owner">
                    <i className="plot-letter">{r.plot_id}</i>
                    <span>
                      <strong>{r.name}</strong>
                      <small>{r.grower_name}</small>
                    </span>
                  </span>
                  <span>
                    <small className="mobile-label">Approved</small>
                    {litres(r.approved_ml)} L
                  </span>
                  <span className="allocated-value">
                    <small className="mobile-label">Allocated</small>
                    {a === null ? "—" : `${litres(a)} L`}
                  </span>
                  <span className="fulfillment">
                    <span>
                      {a === null
                        ? snap && !snap.feasible
                          ? "Infeasible"
                          : "Pending"
                        : `${fulfillment.toFixed(1)}%`}
                    </span>
                    <i>
                      <b style={{ width: `${fulfillment}%` }} />
                    </i>
                  </span>
                </button>
              );
            })}
            {!day.requests.length && !snap && (
              <p className="empty-inline">
                No requests yet. Open Requests to add the first plot.
              </p>
            )}
          </div>
          <div className="ledger-total">
            <span>Total allocation</span>
            <strong>
              {snap ? litres(snap.totals.allocated_ml) : "—"} <small>L</small>
            </strong>
          </div>
          <div className="ledger-caption">
            {snap
              ? `${litres(snap.totals.unmet_ml)} L of approved demand remains unmet.`
              : "Generate a plan to calculate allocations."}
          </div>
        </section>
      </div>
      <section className="plot-detail" aria-live="polite">
        <div>
          <span className="eyebrow">Selected plot · {selected}</span>
          <h2>{row?.name || plot?.name || "Select a plot"}</h2>
          <p>
            {row?.crop || plot?.crop || "No crop description"}
            {(row?.area || plot?.area) && ` · ${row?.area || plot?.area} m²`}
          </p>
        </div>
        <div>
          <span className="eyebrow">Why this allocation?</span>
          <p>
            {row?.explanation ||
              "Allocations will appear after the coordinator generates a plan from approved requests."}
          </p>
          {row && (
            <span className="detail-note">
              {litres(row.allocated_ml)} of {litres(row.approved_ml)} L
              allocated · Availability {clock(row.start)}–{clock(row.end)}
            </span>
          )}
          {req?.status === "pending" && (
            <Badge state="pending">Awaiting review</Badge>
          )}
        </div>
        <div className="baseline">
          <span className="eyebrow">First-come baseline</span>
          <strong>
            {row ? litres(row.baseline_ml) : "—"} <small>L</small>
          </strong>
          <p>Comparison only, ordered by request submission.</p>
        </div>
      </section>
      <Timeline
        snapshot={snap}
        turns={day.turns}
        selected={selected}
        onSelect={setSelected}
      />
      {snap && <Comparison snapshot={snap} versions={day.history} />}
      {day.history.length > 0 && (
        <details className="history">
          <summary>
            Plan versions <span>{day.history.length}</span>
          </summary>
          <div className="version-list">
            {day.history.map((p) => (
              <button
                key={p.id}
                className="version-row"
                onClick={() => {
                  setHistory(p.id);
                  setScenario(null);
                }}
              >
                <strong>Plan {p.id}</strong>
                <Badge state={p.status}>{p.status}</Badge>
                <span>Input revision {p.revision}</span>
                <span>{timestamp(p.published_at || p.created_at)}</span>
                <span>{p.snapshot.feasible ? "Feasible" : "Infeasible"}</span>
              </button>
            ))}
          </div>
        </details>
      )}
      {settings && (
        <Modal
          title="Source & allocation settings"
          close={() => setSettings(false)}
        >
          <p className="muted">
            One shared source, one hose. All times are local to Asia/Bishkek.
          </p>
          <Form
            submit="Save settings"
            disabled={day.state !== "Planning"}
            onSubmit={async (f) => {
              await mutate(
                "/source",
                { revision: settingsRevision, ...sourceValues(f) },
                "PUT",
              );
              setSettings(false);
            }}
          >
            <SourceFields source={day.source} policy={day.policy} />
          </Form>
          {day.state !== "Planning" && (
            <p className="muted">
              Published settings are fixed. Scenario exploration remains
              available.
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
