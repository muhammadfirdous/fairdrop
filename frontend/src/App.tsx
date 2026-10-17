import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Droplets,
  Download,
  LayoutGrid,
  ListChecks,
  LogOut,
  Printer,
  RefreshCw,
  History,
  BookOpen,
} from "lucide-react";
import type { Bootstrap, Config, Day, Mutate, Plot, User } from "./types";
import { api, ApiError, dayLabel, litres, setCsrf, timestamp } from "./api";
import { Alert, Badge, Empty, Field, Form, Modal } from "./ui";
import { PlanView } from "./PlanView";
import { RequestsView, PlotForm } from "./RequestsView";
import { DeliveryView } from "./DeliveryView";
import { PrintDay } from "./PrintDay";
const tabs = [
  ["plan", "Plan", LayoutGrid],
  ["requests", "Requests", ListChecks],
  ["delivery", "Delivery", Droplets],
  ["activity", "Activity", History],
] as const;
function Login({
  config,
  onLogin,
}: {
  config: Config;
  onLogin: (user: User) => void;
}) {
  return (
    <main className="login-screen">
      <section className="login-intro">
        <div className="brand">
          <Droplets size={28} />
          <span>
            FairDrop<span className="brand-dot">.</span>
          </span>
        </div>
        <span className="eyebrow">A community water fieldbook</span>
        <h1>
          Share water.
          <br />
          Grow together.
        </h1>
        <p>
          One garden. One shared source.
          <br />A clear plan for every growing plot.
        </p>
        <div className="login-illustration" aria-hidden="true">
          {"ABCDEF".split("").map((letter, i) => (
            <div key={letter} style={{ height: [70, 95, 80, 95, 65, 85][i] }}>
              <span>{letter}</span>
              <i />
            </div>
          ))}
        </div>
        <span className="login-location">
          {config.community} · {config.timezone}
        </span>
      </section>
      <section className="login-form">
        <span className="eyebrow">Welcome to the garden</span>
        <h2>Open your fieldbook</h2>
        <p className="muted">
          Log in to plan water, see your turn, and record deliveries.
        </p>
        <Form
          submit="Log in"
          onSubmit={async (f) => {
            const result = await api<{ user: User; csrf: string }>(
              "/login",
              "POST",
              { email: f.get("email"), password: f.get("password") },
            );
            setCsrf(result.csrf);
            onLogin(result.user);
          }}
        >
          <Field label="Email">
            <input
              name="email"
              type="email"
              autoComplete="username"
              defaultValue={config.demo ? "coordinator@fairdrop.local" : ""}
              required
            />
          </Field>
          <Field label="Password">
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              defaultValue={config.demo ? "GardenTogether!26" : ""}
              required
            />
          </Field>
        </Form>
        {config.demo && (
          <div className="demo-credentials">
            <Badge>Fictional demonstration</Badge>
            <p>
              <strong>Coordinator</strong>
              <br />
              coordinator@fairdrop.local
            </p>
            <p>
              <strong>Growers A–F</strong>
              <br />
              grower.a@fairdrop.local through grower.f@fairdrop.local
            </p>
            <p>
              All demo passwords: <code>GardenTogether!26</code>
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
export default function App() {
  const [config, setConfig] = useState<Config | null>(null),
    [user, setUser] = useState<User | null>(null),
    [authLoaded, setAuthLoaded] = useState(false),
    [date, setDate] = useState(
      new URLSearchParams(location.search).get("date") || "",
    ),
    [tab, setTab] = useState(location.pathname.slice(1) || "plan"),
    [boot, setBoot] = useState<Bootstrap>({ plots: [], growers: [], days: [] }),
    [day, setDay] = useState<Day | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [missing, setMissing] = useState(false),
    [selected, setSelected] = useState("A"),
    [plotDialog, setPlotDialog] = useState<{ plot: Plot | null } | null>(null),
    [resetOpen, setResetOpen] = useState(false);
  const sequence = useRef(0),
    operations = useRef(new Map<string, string>());
  useEffect(() => {
    Promise.all([
      api<Config>("/config"),
      api<{ user: User; csrf: string }>("/me").catch((e) => {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }),
    ])
      .then(([c, auth]) => {
        setConfig(c);
        setDate((d) => d || c.today);
        if (auth) {
          setCsrf(auth.csrf);
          setUser(auth.user);
        }
        setAuthLoaded(true);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);
  const refresh = useCallback(
    async (quiet = false) => {
      if (!user || !date) return;
      const id = ++sequence.current;
      if (!quiet) setLoading(true);
      try {
        const [b, d] = await Promise.all([
          api<Bootstrap>("/bootstrap"),
          api<Day>(`/days/${date}`).catch((e) => {
            if (e instanceof ApiError && e.status === 404) return null;
            throw e;
          }),
        ]);
        if (id === sequence.current) {
          setBoot(b);
          setDay(d);
          setMissing(!d);
          setError("");
        }
      } catch (e) {
        if (id === sequence.current) {
          setError((e as Error).message);
          if (e instanceof ApiError && e.status === 401) {
            setUser(null);
            setCsrf("");
          }
        }
      } finally {
        if (id === sequence.current) setLoading(false);
      }
    },
    [date, user],
  );
  useEffect(() => {
    const cancel = () => {
      sequence.current++;
    };
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh(true);
    }, 7000);
    return () => {
      clearInterval(timer);
      cancel();
    };
  }, [refresh]);
  useEffect(() => {
    if (date) history.replaceState(null, "", `/${tab}?date=${date}`);
  }, [date, tab]);
  useEffect(() => {
    const handle = () => {
      setTab(location.pathname.slice(1) || "plan");
      const d = new URLSearchParams(location.search).get("date");
      if (d) setDate(d);
    };
    window.addEventListener("popstate", handle);
    return () => window.removeEventListener("popstate", handle);
  }, []);
  const mutate: Mutate = async (path, body, method = "POST") => {
    if (!day) return;
    const payload = { revision: day.revision, ...body };
    const signature = JSON.stringify({ date, path, method, payload });
    const id = operations.current.get(signature) || crypto.randomUUID();
    operations.current.set(signature, id);
    await api(`/days/${date}${path}`, method, {
      ...payload,
      ...(method === "PUT" || path.endsWith("/review")
        ? {}
        : { operation_id: id }),
    });
    operations.current.delete(signature);
    await refresh(true);
  };
  const logout = async () => {
    try {
      await api("/logout", "POST", {});
      setUser(null);
      setDay(null);
      setCsrf("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const go = (value: string) => {
    setTab(value);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const changeDate = (value: string) => {
    if (value) {
      sequence.current++;
      setDay(null);
      setMissing(false);
      setDate(value);
    }
  };
  if (!config || !authLoaded)
    return (
      <div className="startup">
        <Droplets size={28} />
        <h1>FairDrop</h1>
        {error ? (
          <Alert>
            {error}
            <button className="button" onClick={() => location.reload()}>
              Retry connection
            </button>
          </Alert>
        ) : (
          <p>Opening the fieldbook…</p>
        )}
      </div>
    );
  if (!user) return <Login config={config} onLogin={setUser} />;
  const snap = day?.plan?.snapshot || day?.draft?.snapshot;
  if (day && tab === "print")
    return (
      <div className="print-preview">
        <div className="print-toolbar">
          <button className="button" onClick={() => go("plan")}>
            Back to plan
          </button>
          <button className="button primary" onClick={() => window.print()}>
            <Printer size={16} />
            Print or save PDF
          </button>
        </div>
        <PrintDay day={day} config={config} />
      </div>
    );
  const requestTotal =
      day?.requests.reduce((n, r) => n + r.requested_ml, 0) || 0,
    approvedTotal = day?.requests.reduce((n, r) => n + r.approved_ml, 0) || 0;
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="masthead">
        <div className="masthead-inner">
          <a
            className="brand"
            href="/plan"
            onClick={(e) => {
              e.preventDefault();
              go("plan");
            }}
          >
            <Droplets size={26} />
            <span>
              FairDrop<span className="brand-dot">.</span>
            </span>
          </a>
          <div className="community-name">
            {config.community}
            <small>
              {config.demo
                ? "Fictional demo community"
                : "Community water fieldbook"}
            </small>
          </div>
          <div className="masthead-date">
            <CalendarDays size={17} />
            <input
              type="date"
              aria-label="Watering date"
              value={date}
              onChange={(e) => changeDate(e.target.value)}
            />
          </div>
          <div className="account">
            <span>
              {user.name}
              <small>{user.role}</small>
            </span>
            <button
              className="icon-button"
              onClick={logout}
              aria-label="Log out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>
      <nav className="navigation" aria-label="Main navigation">
        <div className="nav-inner">
          <div>
            {tabs.map(([value, label, Icon]) => (
              <button
                key={value}
                className={tab === value ? "current" : ""}
                aria-current={tab === value ? "page" : undefined}
                onClick={() => go(value)}
              >
                <Icon size={17} />
                {label}
                {value === "requests" &&
                  day &&
                  day.requests.some((r) => r.status === "pending") && (
                    <span className="nav-dot" />
                  )}
              </button>
            ))}
          </div>
          <span className="nav-note">
            <i />
            One source. A shared responsibility.
          </span>
        </div>
      </nav>
      <main id="main" className="app-main">
        <div className="page-heading">
          <div>
            <div className="page-kicker">
              <span>
                FIELDNOTES /{" "}
                {String(tabs.findIndex((t) => t[0] === tab) + 1).padStart(
                  2,
                  "0",
                )}
              </span>
              <span>{day ? `REVISION ${day.revision}` : "NEW DAY"}</span>
            </div>
            <h1>
              {tab === "requests"
                ? "Watering requests"
                : tab === "delivery"
                  ? "The water ledger"
                  : tab === "activity"
                    ? "A record of every decision"
                    : "The daily water plan"}
            </h1>
            <p>
              {dayLabel(date)} <span className="separator">/</span> Asia/Bishkek{" "}
              {day && <Badge state={day.state}>{day.state}</Badge>}
            </p>
          </div>
          <div className="page-tools">
            <button
              className="icon-button"
              aria-label="Refresh day"
              onClick={() => refresh()}
            >
              <RefreshCw size={17} className={loading ? "spin" : ""} />
            </button>
            {day && (user.role === "coordinator" || day.plan) && (
              <>
                <a
                  className="button compact"
                  href={`/api/days/${date}/export.csv`}
                  download
                >
                  <Download size={15} />
                  <span>Export CSV</span>
                </a>
                <button className="button compact" onClick={() => go("print")}>
                  <Printer size={15} />
                  <span>Print day</span>
                </button>
              </>
            )}
            <label className="saved-days">
              <span className="sr-only">Saved days</span>
              <select
                value={boot.days.some((d) => d.date === date) ? date : ""}
                onChange={(e) => changeDate(e.target.value)}
              >
                <option value="" disabled>
                  Saved days
                </option>
                {boot.days.map((d) => (
                  <option key={d.date} value={d.date}>
                    {d.date} · {d.state}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {error && (
          <Alert>
            {error}{" "}
            <button className="text-button" onClick={() => refresh()}>
              Retry
            </button>
          </Alert>
        )}
        {loading && !day && !missing && (
          <p className="loading-message" role="status">
            Loading this watering day…
          </p>
        )}
        {missing && (
          <Empty title="No watering day on this date">
            {user.role === "coordinator" ? (
              <>
                Open a day to collect requests and configure the shared source.
                <button
                  className="button primary"
                  onClick={async () => {
                    try {
                      await api(`/days/${date}`, "POST", {});
                      await refresh();
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Open watering day
                  <ArrowRight size={16} />
                </button>
              </>
            ) : (
              "The coordinator has not opened planning for this date."
            )}
          </Empty>
        )}
        {day && (
          <>
            <section className="summary-band" aria-label="Day summary">
              <div>
                <span>Available water</span>
                <strong>
                  {litres(day.source.opening_ml)} <small>L</small>
                </strong>
                <em>Opening source budget</em>
              </div>
              <div>
                <span>Requested / approved</span>
                <strong>
                  {litres(snap?.totals.requested_ml ?? requestTotal)}{" "}
                  <small>/</small>{" "}
                  {litres(snap?.totals.approved_ml ?? approvedTotal)}{" "}
                  <small>L</small>
                </strong>
                <em>
                  {user.role === "grower" && !day.plan
                    ? "Your visible requests"
                    : "Community demand"}
                </em>
              </div>
              <div className="water-text">
                <span>Allocated</span>
                <strong>
                  {snap ? litres(snap.totals.allocated_ml) : "—"}{" "}
                  <small>L</small>
                </strong>
                <em>
                  {snap
                    ? `${litres(snap.totals.scheduled_ml)} L scheduled`
                    : "Generate a plan first"}
                </em>
              </div>
              <div className="attention-text">
                <span>Unmet approved demand</span>
                <strong>
                  {snap ? litres(snap.totals.unmet_ml) : "—"} <small>L</small>
                </strong>
                <em>
                  {snap
                    ? `${litres(snap.totals.unused_ml)} L left unallocated`
                    : "Allocation not calculated"}
                </em>
              </div>
              <div>
                <span>Actually delivered</span>
                <strong>
                  {litres(day.accounting.delivered_ml)} <small>L</small>
                </strong>
                <em>
                  {day.turns.filter((t) => t.state === "Completed").length} of{" "}
                  {day.turns.length} turns completed
                </em>
              </div>
            </section>
            <div className="view-content" key={`${date}:${tab}`}>
              {tab === "requests" ? (
                <RequestsView
                  day={day}
                  boot={boot}
                  user={user}
                  mutate={mutate}
                  managePlot={(plot) => setPlotDialog({ plot })}
                />
              ) : tab === "delivery" ? (
                <DeliveryView day={day} user={user} mutate={mutate} />
              ) : tab === "activity" ? (
                <>
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">Transparent by design</span>
                      <h2>The day’s activity</h2>
                      <p className="muted">
                        Every change records who, when, and why. Times shown in
                        Asia/Bishkek.
                      </p>
                    </div>
                    <BookOpen size={24} />
                  </div>
                  <ol className="activity-list">
                    {day.activity.map((a) => (
                      <li key={a.id}>
                        <div className="activity-dot" />
                        <time>{timestamp(a.created_at)}</time>
                        <div>
                          <h3>{a.action}</h3>
                          <p>{a.detail}</p>
                          <small>{a.actor}</small>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {day.activity.length === 0 && (
                    <Empty title="Nothing recorded yet">
                      Changes to this day will appear here.
                    </Empty>
                  )}
                </>
              ) : (
                <PlanView
                  day={day}
                  plots={boot.plots}
                  user={user}
                  selected={selected}
                  setSelected={setSelected}
                  mutate={mutate}
                  go={go}
                />
              )}
            </div>
          </>
        )}
      </main>
      <footer className="footer">
        <span>
          <Droplets size={15} />
          FairDrop <span className="footer-dot">/</span> Share water, grow
          together.
        </span>
        <div>
          <span>Manually recorded. Openly shared.</span>
          {config.demo && user.role === "coordinator" && (
            <button className="text-button" onClick={() => setResetOpen(true)}>
              Reset demo
            </button>
          )}
        </div>
      </footer>
      {day && <PrintDay day={day} config={config} />}
      {plotDialog && day && (
        <Modal
          title="Manage plots & assignments"
          close={() => setPlotDialog(null)}
        >
          <PlotForm
            day={day}
            boot={boot}
            plot={plotDialog.plot}
            save={async (id, data) => {
              await api(`/plots/${id}`, "PUT", data);
              await refresh(true);
              setPlotDialog(null);
            }}
          />
        </Modal>
      )}
      {resetOpen && (
        <Modal
          title="Reset the fictional demonstration"
          close={() => setResetOpen(false)}
        >
          <Alert>
            This deletes all users, sessions, plots, saved days, plan versions,
            deliveries, source adjustments, and activity in this demo database.
            The six fictional grower accounts and today’s demo requests will be
            recreated.
          </Alert>
          <Form
            submit="Reset fictional demo"
            onSubmit={async (f) => {
              await api("/demo/reset", "POST", {
                confirmation: f.get("confirmation"),
              });
              setResetOpen(false);
              setUser(null);
              setDay(null);
              setDate(config.today);
              setCsrf("");
            }}
          >
            <Field label="Type RESET FICTIONAL DEMO to confirm">
              <input name="confirmation" required autoComplete="off" />
            </Field>
          </Form>
        </Modal>
      )}
    </>
  );
}
