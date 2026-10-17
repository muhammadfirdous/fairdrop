import { useState } from "react";
import { Plus, ArrowUpRight } from "lucide-react";
import type {
  Day,
  Plot,
  User,
  Bootstrap,
  Mutate,
  RequestRecord,
} from "./types";
import { clock, litres, ml, seconds } from "./api";
import { Badge, Empty, Field, Form, Modal, Alert } from "./ui";
function RequestForm({
  day,
  plot,
  record,
  mutate,
  close,
}: {
  day: Day;
  plot: Plot;
  record?: RequestRecord;
  mutate: Mutate;
  close: () => void;
}) {
  const [openedRevision] = useState(day.revision);
  return (
    <Form
      submit="Save request"
      onSubmit={async (f) => {
        await mutate(
          `/requests/${plot.id}`,
          {
            revision: openedRevision,
            requested_ml: ml(f.get("quantity")),
            start: seconds(f.get("start")),
            end: seconds(f.get("end")),
            note: f.get("note"),
          },
          "PUT",
        );
        close();
      }}
    >
      <p className="muted">
        {plot.name} · {plot.crop}. Saving an edited request clears its previous
        approval.
      </p>
      <Field label="Requested water (L)">
        <input
          name="quantity"
          type="number"
          min="0"
          step="0.001"
          defaultValue={(record?.requested_ml ?? 0) / 1000}
          required
          autoFocus
        />
      </Field>
      <div className="form-grid">
        <Field label="Available from">
          <input
            name="start"
            type="time"
            defaultValue={clock(record?.start ?? day.source.start).slice(0, 5)}
            required
          />
        </Field>
        <Field label="Available until">
          <input
            name="end"
            type="time"
            defaultValue={clock(record?.end ?? day.source.end).slice(0, 5)}
            required
          />
        </Field>
      </div>
      <Field label="Note (optional)">
        <textarea name="note" maxLength={1000} defaultValue={record?.note} />
      </Field>
    </Form>
  );
}
function ReviewForm({
  day,
  record: r,
  mutate,
  close,
}: {
  day: Day;
  record: RequestRecord;
  mutate: Mutate;
  close: () => void;
}) {
  const [status, setStatus] = useState("approved"),
    [rev] = useState(day.revision);
  return (
    <Form
      submit={status === "approved" ? "Approve request" : "Reject request"}
      onSubmit={async (f) => {
        await mutate(`/requests/${r.plot_id}/review`, {
          revision: rev,
          status,
          approved_ml: status === "rejected" ? 0 : ml(f.get("approved")),
          minimum_ml: status === "rejected" ? 0 : ml(f.get("minimum")),
          reason: f.get("reason"),
        });
        close();
      }}
    >
      <div className="review-context">
        <strong>
          {r.name} · {r.grower_name}
        </strong>
        <p>
          {litres(r.requested_ml)} L requested · {clock(r.start)}–{clock(r.end)}
        </p>
        <p>{r.note || "No grower note."}</p>
      </div>
      <Field label="Review decision">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="approved">Approve request</option>
          <option value="rejected">Reject request</option>
        </select>
      </Field>
      {status === "approved" && (
        <div className="form-grid">
          <Field label="Approved water (L)">
            <input
              name="approved"
              type="number"
              min="0"
              max={r.requested_ml / 1000}
              step="0.001"
              defaultValue={
                (r.status === "approved" ? r.approved_ml : r.requested_ml) /
                1000
              }
              required
            />
          </Field>
          <Field label="Agreed minimum (L)">
            <input
              name="minimum"
              type="number"
              min="0"
              max={r.requested_ml / 1000}
              step="0.001"
              defaultValue={r.minimum_ml / 1000}
              required
            />
          </Field>
        </div>
      )}
      <Field
        label="Reason"
        hint="Required for a rejection or a reduction in quantity."
      >
        <textarea
          name="reason"
          maxLength={1000}
          defaultValue={r.reason}
          required={status === "rejected"}
        />
      </Field>
    </Form>
  );
}
export function RequestsView({
  day,
  boot,
  user,
  mutate,
  managePlot,
}: {
  day: Day;
  boot: Bootstrap;
  user: User;
  mutate: Mutate;
  managePlot: (plot: Plot | null) => void;
}) {
  const [editing, setEditing] = useState<Plot | null>(null),
    [reviewing, setReviewing] = useState<RequestRecord | null>(null);
  const coord = user.role === "coordinator",
    allowed = boot.plots.filter(
      (p) => p.active && (coord || p.grower_id === user.id),
    ),
    locked = day.state !== "Planning";
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">Before a litre is shared</span>
          <h2>
            {coord ? "Review the community’s needs" : "Your watering requests"}
          </h2>
          <p className="muted">
            Requests are editable during Planning. An edited request always
            needs a fresh review.
          </p>
        </div>
        {coord && (
          <button className="button" onClick={() => managePlot(null)}>
            <Plus size={16} />
            Manage plots
          </button>
        )}
      </div>
      {locked && (
        <Alert kind="info">
          Requests are locked for this {day.state.toLowerCase()} day. The
          published plan and explanations remain available.
        </Alert>
      )}
      <div className="request-list">
        {allowed.map((p) => {
          const r = day.requests.find((r) => r.plot_id === p.id);
          return (
            <article className="request-record" key={p.id}>
              <div className="request-title">
                <div className="plot-letter large">{p.id}</div>
                <div>
                  <h2>{p.name}</h2>
                  <p>
                    {r?.grower_name ||
                      boot.growers.find((u) => u.id === p.grower_id)?.name ||
                      user.name}{" "}
                    · {p.crop || "No crop description"}
                  </p>
                </div>
                <Badge state={r?.status || ""}>
                  {r?.status || "No request"}
                </Badge>
              </div>
              <dl className="request-values">
                <div>
                  <dt>Requested</dt>
                  <dd>{r ? `${litres(r.requested_ml)} L` : "—"}</dd>
                </div>
                <div>
                  <dt>Approved</dt>
                  <dd>{r ? `${litres(r.approved_ml)} L` : "—"}</dd>
                </div>
                <div>
                  <dt>Agreed minimum</dt>
                  <dd>{r ? `${litres(r.minimum_ml)} L` : "—"}</dd>
                </div>
                <div>
                  <dt>Availability</dt>
                  <dd>{r ? `${clock(r.start)}–${clock(r.end)}` : "—"}</dd>
                </div>
              </dl>
              {r?.note && <p className="record-note">{r.note}</p>}
              {r?.reason && (
                <p className="review-reason">
                  <strong>Review reason:</strong> {r.reason}
                </p>
              )}
              <div className="record-actions">
                <button
                  className="button"
                  disabled={locked}
                  onClick={() => setEditing(p)}
                >
                  {r ? "Edit request" : "Add request"}
                  <ArrowUpRight size={15} />
                </button>
                {coord && r && (
                  <button
                    className="button primary"
                    disabled={locked}
                    onClick={() => setReviewing(r)}
                  >
                    {r.status === "pending"
                      ? "Review request"
                      : "Change review"}
                  </button>
                )}
                {coord && (
                  <button className="text-button" onClick={() => managePlot(p)}>
                    Edit plot
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {allowed.length === 0 && (
        <Empty title="No assigned plots">
          The coordinator can create a plot and assign it to a grower.
        </Empty>
      )}
      {editing && (
        <Modal
          title={`${editing.name} · watering request`}
          close={() => setEditing(null)}
        >
          <RequestForm
            day={day}
            plot={editing}
            record={day.requests.find((r) => r.plot_id === editing.id)}
            mutate={mutate}
            close={() => setEditing(null)}
          />
        </Modal>
      )}
      {reviewing && (
        <Modal title="Review request" close={() => setReviewing(null)}>
          <ReviewForm
            day={day}
            record={reviewing}
            mutate={mutate}
            close={() => setReviewing(null)}
          />
        </Modal>
      )}
    </>
  );
}
export function PlotForm({
  day,
  boot,
  plot,
  save,
}: {
  day: Day;
  boot: Bootstrap;
  plot: Plot | null;
  save: (id: string, data: Record<string, unknown>) => Promise<void>;
}) {
  const [chosen, setChosen] = useState(plot),
    [rev] = useState(day.revision);
  return (
    <>
      <Field label="Plot record">
        <select
          value={chosen?.id || ""}
          onChange={(e) =>
            setChosen(boot.plots.find((p) => p.id === e.target.value) || null)
          }
        >
          <option value="">Create a new plot</option>
          {boot.plots.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.active ? "" : " (archived)"}
            </option>
          ))}
        </select>
      </Field>
      <Form
        key={chosen?.id || "new"}
        submit="Save plot"
        onSubmit={async (f) =>
          save(chosen?.id || String(f.get("id")), {
            date: day.date,
            revision: rev,
            name: f.get("name"),
            grower_id: Number(f.get("grower")),
            crop: f.get("crop"),
            area: f.get("area"),
            position: Number(f.get("position")),
            active: f.get("active") === "on",
          })
        }
      >
        {!chosen && (
          <Field label="Stable identifier">
            <input
              name="id"
              maxLength={12}
              pattern="[A-Za-z0-9_-]+"
              placeholder="G"
              required
            />
          </Field>
        )}
        <Field label="Plot name">
          <input
            name="name"
            maxLength={100}
            defaultValue={chosen?.name}
            required
          />
        </Field>
        <Field label="Assigned grower">
          <select name="grower" defaultValue={chosen?.grower_id} required>
            {boot.growers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Crop description">
          <input name="crop" maxLength={200} defaultValue={chosen?.crop} />
        </Field>
        <div className="form-grid">
          <Field label="Area (m², optional)">
            <input
              name="area"
              type="number"
              min="0"
              step="0.001"
              defaultValue={chosen?.area}
            />
          </Field>
          <Field label="Schematic position">
            <select
              name="position"
              defaultValue={
                chosen?.position ?? boot.plots.findIndex((p) => !p.active)
              }
            >
              {Array.from({ length: 6 }, (_, i) => (
                <option key={i} value={i}>
                  {i < 3 ? "Upper" : "Lower"} row · {(i % 3) + 1}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="checkbox-label">
          <input
            name="active"
            type="checkbox"
            defaultChecked={chosen?.active ?? true}
          />
          Active plot
        </label>
        <p className="muted text-sm">
          At most six active plots. Archiving preserves historical records.
          Assignments are locked while any day is Ready or Active.
        </p>
      </Form>
    </>
  );
}
