import type { Day, Config } from "./types";
import { clock, dayLabel, litres, timestamp } from "./api";
export function PrintDay({ day, config }: { day: Day; config: Config }) {
  const snap = day.plan?.snapshot || day.draft?.snapshot;
  const date = day.date;
  return (
    <section className="print-only">
      <h1>FairDrop · {config.community}</h1>
      <p>
        {dayLabel(date)} · {day.state} · revision {day.revision} · Asia/Bishkek
      </p>
      <h2>Plan & delivery ledger</h2>
      <p>
        Opening {litres(day.source.opening_ml)} L · Allocated{" "}
        {snap ? litres(snap.totals.allocated_ml) : "—"} L · Actually delivered{" "}
        {litres(day.accounting.delivered_ml)} L · Recorded balance{" "}
        {litres(day.accounting.balance_ml)} L
      </p>
      <table>
        <thead>
          <tr>
            <th>Plot</th>
            <th>Requested</th>
            <th>Approved</th>
            <th>Allocated</th>
            <th>Turn</th>
            <th>Actual</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {(snap?.requests || day.requests).map((r) => {
            const a = snap?.rows.find((x) => x.plot_id === r.plot_id),
              t = day.turns.find((x) => x.plot_id === r.plot_id),
              s = snap?.schedule.find((x) => x.plot_id === r.plot_id);
            return (
              <tr key={r.plot_id}>
                <td>{r.name}</td>
                <td>{litres(r.requested_ml)} L</td>
                <td>{litres(r.approved_ml)} L</td>
                <td>{litres(a?.allocated_ml)} L</td>
                <td>
                  {s ? `${clock(s.start)}–${clock(s.end)}` : "Unscheduled"}
                </td>
                <td>
                  {t && ["Completed", "Missed"].includes(t.state)
                    ? `${litres(t.actual_ml)} L`
                    : "—"}
                </td>
                <td>{t?.state || r.status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h2>Allocation explanations</h2>
      {snap?.rows.map((r) => (
        <p key={r.plot_id}>
          <strong>{r.name}: </strong>
          {r.explanation}
        </p>
      ))}
      {snap?.errors.map((e) => (
        <p key={e}>{e}</p>
      ))}
      <h2>Activity</h2>
      {[...day.activity].reverse().map((a) => (
        <p key={a.id}>
          {timestamp(a.created_at)} · {a.actor} · {a.action}: {a.detail}
        </p>
      ))}
    </section>
  );
}
