import { useState } from "react";
import { ArrowRight, Check, Clock, Droplets } from "lucide-react";
import type { Day, User, Turn, Mutate } from "./types";
import { clock, litres, ml, timestamp } from "./api";
import { Alert, Badge, Empty, Field, Form, Modal } from "./ui";
type DialogAction = {
  turn: Turn;
  kind: "complete" | "correct" | "miss" | "target";
};
function ExecutionForm({
  day,
  action,
  mutate,
  close,
}: {
  day: Day;
  action: DialogAction;
  mutate: Mutate;
  close: () => void;
}) {
  const [rev] = useState(day.revision);
  const { turn: t, kind } = action;
  return (
    <Form
      submit={
        kind === "complete"
          ? "Record delivery"
          : kind === "correct"
            ? "Save correction"
            : kind === "miss"
              ? "Mark turn missed"
              : "Authorize smaller target"
      }
      onSubmit={async (f) => {
        const values: Record<string, unknown> = {
          revision: rev,
          reason: f.get("reason"),
        };
        if (kind === "complete" || kind === "correct")
          values.actual_ml = ml(f.get("quantity"));
        if (kind === "target") values.target_ml = ml(f.get("quantity"));
        await mutate(`/turns/${t.id}/${kind}`, values);
        close();
      }}
    >
      <p className="review-context">
        Plot {t.plot_id} · {litres(t.allocated_ml)} L allocated ·{" "}
        {clock(t.start)}–{clock(t.end)}
        <br />
        Recorded source balance:{" "}
        <strong>{litres(day.accounting.balance_ml)} L</strong>
      </p>
      {kind !== "miss" && (
        <Field
          label={
            kind === "target"
              ? "Execution target (L)"
              : "Actual volume delivered (L)"
          }
          hint={
            kind === "target"
              ? "This does not change the published allocation."
              : "Enter the total for this turn, not an additional amount."
          }
        >
          <input
            name="quantity"
            type="number"
            min="0"
            step="0.001"
            max={kind === "target" ? t.allocated_ml / 1000 : undefined}
            defaultValue={
              (kind === "correct" ? t.actual_ml : t.target_ml) / 1000
            }
            autoFocus
            required
          />
        </Field>
      )}
      <Field
        label="Reason"
        hint={
          kind === "complete"
            ? "Required for zero delivery or overdelivery. Optional for partial delivery."
            : "Required. This explanation is saved in the activity history."
        }
      >
        <textarea
          name="reason"
          maxLength={1000}
          required={kind !== "complete"}
        />
      </Field>
    </Form>
  );
}
function timing(day: Day, t: Turn) {
  if (!t.actual_start) return "";
  const planned = new Date(
    `${day.date}T${clock(t.start).slice(0, 5)}:00+06:00`,
  ).getTime();
  const diff = Math.round(
    (new Date(t.actual_start).getTime() - planned) / 60000,
  );
  return diff === 0
    ? "Started on time"
    : `Started ${Math.abs(diff)} min ${diff > 0 ? "late" : "early"}`;
}
export function DeliveryView({
  day,
  user,
  mutate,
}: {
  day: Day;
  user: User;
  mutate: Mutate;
}) {
  const [action, setAction] = useState<DialogAction | null>(null),
    [adjust, setAdjust] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const coord = user.role === "coordinator",
    a = day.accounting,
    next = day.turns.find((t) => ["Planned", "In progress"].includes(t.state));
  async function run(path: string) {
    setBusy(true);
    setError("");
    try {
      await mutate(path, {});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!day.plan)
    return (
      <Empty title="Publish a plan before watering">
        The delivery ledger opens when a feasible plan is published. Allocation
        alone does not consume water.
      </Empty>
    );
  return (
    <>
      <div className="delivery-balance">
        <div>
          <span className="eyebrow">Recorded source balance</span>
          <strong>
            {litres(a.balance_ml)} <small>L</small>
          </strong>
          <p>Calculated from manual records</p>
        </div>
        <div className="balance-equation">
          <span>
            <b>{litres(a.opening_ml)} L</b>Opening water
          </span>
          <i>+</i>
          <span>
            <b>{litres(a.adjustment_ml)} L</b>Adjustments
          </span>
          <i>−</i>
          <span>
            <b>{litres(a.delivered_ml)} L</b>Actual deliveries
          </span>
        </div>
        {coord && (
          <button className="button" onClick={() => setAdjust(true)}>
            <Droplets size={16} />
            Record source adjustment
          </button>
        )}
      </div>
      {a.remaining_shortfall_ml > 0 && (
        <Alert>
          <strong>
            {litres(a.remaining_shortfall_ml)} L shortfall against remaining
            planned turns
          </strong>
          <p>
            {litres(a.remaining_plan_ml)} L remains planned;{" "}
            {litres(a.balance_ml)} L is accounted for. The coordinator can
            authorize a smaller execution target, record a genuine source
            adjustment, or mark a turn missed. Original allocations stay fixed.
          </p>
        </Alert>
      )}
      <div className="section-heading">
        <div>
          <span className="eyebrow">The shared hose</span>
          <h2>
            {next
              ? next.state === "In progress"
                ? `Now watering · Plot ${next.plot_id}`
                : `Next turn · Plot ${next.plot_id}`
              : "All turns resolved"}
          </h2>
          <p className="muted">
            {next
              ? `${clock(next.start)}–${clock(next.end)} planned · ${litres(next.target_ml)} L execution target`
              : "The actual ledger remains available for review and audited corrections."}
          </p>
        </div>
        <Badge state={day.state}>{day.state}</Badge>
      </div>
      {error && <Alert>{error}</Alert>}
      <div className="delivery-list">
        {day.turns.map((t) => {
          const own = coord || t.grower_id === user.id;
          return (
            <article
              key={t.id}
              className={`delivery-record ${t.id === next?.id ? "next" : ""}`}
            >
              <div className="delivery-identity">
                <span className="turn-number">
                  {String(t.sequence + 1).padStart(2, "0")}
                </span>
                <div className="plot-letter large">{t.plot_id}</div>
                <div>
                  <h3>
                    {day.plan?.snapshot.rows.find(
                      (r) => r.plot_id === t.plot_id,
                    )?.name || `Plot ${t.plot_id}`}
                  </h3>
                  <p>
                    {clock(t.start)}–{clock(t.end)} planned
                  </p>
                </div>
                <Badge state={t.state}>{t.state}</Badge>
              </div>
              <dl className="delivery-values">
                <div>
                  <dt>Allocated</dt>
                  <dd>{litres(t.allocated_ml)} L</dd>
                </div>
                <div>
                  <dt>Execution target</dt>
                  <dd>{litres(t.target_ml)} L</dd>
                </div>
                <div>
                  <dt>Actually delivered</dt>
                  <dd className={t.state === "Completed" ? "good-text" : ""}>
                    {["Completed", "Missed"].includes(t.state)
                      ? `${litres(t.actual_ml)} L`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>
                    {t.state === "Completed" && t.actual_ml > t.allocated_ml
                      ? "Overdelivery"
                      : "Shortfall"}
                  </dt>
                  <dd>
                    {["Completed", "Missed"].includes(t.state)
                      ? `${litres(Math.abs(t.allocated_ml - t.actual_ml))} L`
                      : "Not finalized"}
                  </dd>
                </div>
              </dl>
              {t.actual_start && (
                <p className="actual-time">
                  <Clock size={14} />
                  {timing(day, t)} · Actual start {timestamp(t.actual_start)}
                  {t.actual_finish && ` · Finish ${timestamp(t.actual_finish)}`}
                </p>
              )}
              {t.reason && <p className="record-note">{t.reason}</p>}
              <div className="record-actions">
                {t.state === "Planned" && own && (
                  <>
                    <button
                      className="button primary"
                      disabled={
                        busy || next?.id !== t.id || day.state === "Closed"
                      }
                      onClick={() => run(`/turns/${t.id}/start`)}
                    >
                      Start turn
                      <ArrowRight size={16} />
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setAction({ turn: t, kind: "miss" })}
                    >
                      Mark missed
                    </button>
                    {coord && (
                      <button
                        className="text-button"
                        onClick={() => setAction({ turn: t, kind: "target" })}
                      >
                        Adjust execution target
                      </button>
                    )}
                  </>
                )}
                {t.state === "In progress" && own && (
                  <button
                    className="button primary"
                    onClick={() => setAction({ turn: t, kind: "complete" })}
                  >
                    Record delivery
                    <Check size={16} />
                  </button>
                )}
                {t.state === "Completed" && coord && (
                  <button
                    className="text-button"
                    onClick={() => setAction({ turn: t, kind: "correct" })}
                  >
                    Correct delivery
                  </button>
                )}
                {!own && ["Planned", "In progress"].includes(t.state) && (
                  <span className="muted text-sm">
                    Operated by the assigned grower or coordinator.
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <div className="delivery-footnote">
        <p>
          <strong>{litres(a.finalized_shortfall_ml)} L</strong> shortfall on
          finalized turns.
        </p>
        <p>
          <strong>{litres(a.delivery_shortfall_ml)} L</strong> not yet delivered
          against the entire plan
          {day.state !== "Closed" ? " (includes unfinished turns)" : ""}.
          Overdelivery never offsets another plot’s shortfall.
        </p>
        {coord && !next && day.state !== "Closed" && (
          <button
            className="button primary"
            disabled={busy}
            onClick={() => run("/close")}
          >
            Close watering day
            <Check size={16} />
          </button>
        )}
      </div>
      {action && (
        <Modal
          title={
            action.kind === "complete"
              ? "Record actual delivery"
              : action.kind === "correct"
                ? "Correct a finalized delivery"
                : action.kind === "target"
                  ? "Authorize execution target"
                  : "Mark an unstarted turn missed"
          }
          close={() => setAction(null)}
        >
          <ExecutionForm
            day={day}
            action={action}
            mutate={mutate}
            close={() => setAction(null)}
          />
        </Modal>
      )}
      {adjust && (
        <Modal title="Record source adjustment" close={() => setAdjust(false)}>
          <AdjustmentForm
            day={day}
            mutate={mutate}
            close={() => setAdjust(false)}
          />
        </Modal>
      )}
    </>
  );
}
function AdjustmentForm({
  day,
  mutate,
  close,
}: {
  day: Day;
  mutate: Mutate;
  close: () => void;
}) {
  const [rev] = useState(day.revision);
  return (
    <Form
      submit="Record adjustment"
      onSubmit={async (f) => {
        await mutate("/adjustments", {
          revision: rev,
          amount_ml: ml(f.get("amount")),
          reason: f.get("reason"),
        });
        close();
      }}
    >
      <p className="muted">
        Record a genuine top-up, loss, or accounting correction. This changes
        the recorded balance; the published opening budget stays fixed.
      </p>
      <Field
        label="Adjustment (L)"
        hint="Positive adds water. Negative records a loss."
      >
        <input name="amount" type="number" step="0.001" required autoFocus />
      </Field>
      <Field label="Reason">
        <textarea name="reason" maxLength={1000} required />
      </Field>
    </Form>
  );
}
