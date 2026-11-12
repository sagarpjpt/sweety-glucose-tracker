import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/dm-mono/400.css";
import "@fontsource/dm-mono/500.css";
import "./style.css";
const slots = [
  "Morning (fasting)",
  "After breakfast",
  "After lunch",
  "After dinner",
];
async function api(path, options = {}) {
  const res = await fetch("/api" + path, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Sweety-Request": "1",
      ...options.headers,
    },
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}
const pretty = (date) =>
  new Date(date + "T12:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
function App() {
  const [user, setUser] = useState(null),
    [ready, setReady] = useState(false),
    [mode, setMode] = useState("login"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [date, setDate] = useState(""),
    [type, setType] = useState("daily"),
    [report, setReport] = useState(null),
    [records, setRecords] = useState([]),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0);
  const [editing, setEditing] = useState(null),
    [entry, setEntry] = useState({ date: "", slot: 0, value: "" }),
    [notice, setNotice] = useState(""),
    [deleting, setDeleting] = useState(null),
    [loading, setLoading] = useState(false),
    [formError, setFormError] = useState("");
  useEffect(() => {
    api("/auth/me")
      .then((u) => {
        setUser(u);
        setDate(u.today);
        setEntry((e) => ({ ...e, date: u.today }));
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!user || !date) return;
    let active = true;
    setLoading(true);
    setReport(null);
    setError("");
    Promise.all([
      api(`/reports?type=${type}&date=${date}`),
      api(`/readings?page=${page}&limit=12`),
    ])
      .then(([r, list]) => {
        if (active) {
          setReport(r);
          setRecords(list.readings);
          setTotal(list.total);
        }
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [user, date, type, page, notice]);
  async function auth(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await api("/auth/" + mode, {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(f)),
      });
      const u = await api("/auth/me");
      setUser(u);
      setDate(u.today);
      setEntry({ date: u.today, slot: 0, value: "" });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      await api("/readings" + (editing ? "/" + editing : ""), {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({
          ...entry,
          value: entry.value === "" ? "" : Number(entry.value),
        }),
      });
      setEntry({ date: entry.date, slot: entry.slot, value: "" });
      setEditing(null);
      setNotice(
        (editing ? "Reading updated." : "Reading saved.") +
          " " +
          new Date().toLocaleTimeString(),
      );
    } catch (e) {
      setFormError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api("/readings/" + deleting.id, { method: "DELETE" });
      setDeleting(null);
      setNotice("Reading deleted. " + new Date().toLocaleTimeString());
      if (records.length === 1 && page > 1) setPage(page - 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function edit(r) {
    setEditing(r.id);
    setEntry({ date: r.date, slot: r.slot, value: String(r.value) });
    setFormError("");
    document.getElementById("entry-title")?.scrollIntoView({ block: "center" });
  }
  if (!ready) return <main className="waiting">Opening your record…</main>;
  if (!user)
    return (
      <div className="auth-layout">
        <section className="cover">
          <div className="eyebrow">A PERSONAL GLUCOSE RECORD / EST. 2026</div>
          <h1>
            Sweety<span>.</span>
          </h1>
          <p className="cover-copy">
            Four readings.
            <br />
            One day at a time.
          </p>
          <p className="cover-note">
            Record your glucose. Keep the dates.
            <br />
            See what changed over the month.
          </p>
          <div className="cover-bottom">
            01 — MORNING &nbsp; 02 — BREAKFAST
            <br />
            03 — LUNCH &nbsp;&nbsp;&nbsp; 04 — DINNER
          </div>
        </section>
        <section className="auth-panel">
          <div className="eyebrow">YOUR NOTEBOOK</div>
          <h2>{mode === "login" ? "Welcome back." : "Begin your record."}</h2>
          <p>
            {mode === "login"
              ? "Log in to pick up where you left off."
              : "Create an account. Your readings stay in your account."}
          </p>
          <form onSubmit={auth}>
            {mode === "register" && (
              <label>
                Name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={80}
                />
              </label>
            )}
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
                minLength={mode === "register" ? 8 : undefined}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Open my record →"
                  : "Create account →"}
            </button>
          </form>
          <button
            className="text-button"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {mode === "login"
              ? "New here? Create an account"
              : "Already registered? Log in"}
          </button>
          <aside className="demo-note">
            TAKE A LOOK
            <br />
            Demo: demo@sweety.example
            <br />
            Password: DemoPass123!
          </aside>
          <p className="fine">
            A record-keeping tool. It does not interpret readings or replace
            medical advice.
          </p>
        </section>
      </div>
    );
  return (
    <>
      <header className="masthead">
        <a className="wordmark" href="/">
          Sweety<span>.</span>
        </a>
        <span className="edition">
          THE DAILY RECORD
          <br />
          BLOOD GLUCOSE / mg/dl
        </span>
        <div className="account">
          <span>{user.name}</span>
          <button
            onClick={async () => {
              try {
                await api("/auth/logout", { method: "POST" });
                setUser(null);
                setReport(null);
                setRecords([]);
                setNotice("");
                setError("");
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Log out
          </button>
        </div>
      </header>
      <main className="notebook">
        <div className="page-title">
          <div>
            <p className="eyebrow">YOUR NUMBERS, KEPT IN ORDER</p>
            <h1>A day on record.</h1>
          </div>
          <p className="intro">
            A small habit.
            <br />A clear history.
          </p>
        </div>
        <div className="workspace">
          <section className="report-section">
            <div className="section-top">
              <h2>01 / The report</h2>
              <label className="date-picker">
                Reference date
                <input
                  type="date"
                  value={date}
                  max={user.today}
                  min="1900-01-01"
                  onChange={(e) => {
                    if (e.target.value) setDate(e.target.value);
                  }}
                />
              </label>
            </div>
            <nav className="tabs" aria-label="Report range">
              {[
                ["daily", "Daily"],
                ["mtd", "Month to date"],
                ["monthly", "Previous month"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={type === key}
                  onClick={() => setType(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {loading ? (
              <p role="status" className="empty">
                Fetching your readings…
              </p>
            ) : (
              report && (
                <>
                  <p className="report-date">
                    {pretty(report.start)}
                    {report.start !== report.end
                      ? " – " + pretty(report.end)
                      : ""}
                  </p>
                  <div className="stats">
                    <div className="average">
                      <span className="eyebrow">AVERAGE / mg/dl</span>
                      <strong>
                        {report.average === null
                          ? "—"
                          : report.average.toFixed(1)}
                      </strong>
                      <span>
                        {report.count}{" "}
                        {report.count === 1 ? "reading" : "readings"} recorded
                      </span>
                    </div>
                    <dl>
                      <div>
                        <dt>HIGHEST</dt>
                        <dd>{report.highest ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>LOWEST</dt>
                        <dd>{report.lowest ?? "—"}</dd>
                      </div>
                    </dl>
                  </div>
                  {report.count === 0 ? (
                    <div className="empty">
                      <h3>Nothing written here yet.</h3>
                      <p>
                        Add a reading for this date. Your report will appear
                        here.
                      </p>
                    </div>
                  ) : (
                    <>
                      {type === "daily" ? (
                        <div className="daily-list">
                          {slots.map((s, i) => {
                            const r = report.readings.find((r) => r.slot === i);
                            return (
                              <div key={s}>
                                <span className="slot-number">0{i + 1}</span>
                                <span>{s}</span>
                                <strong>{r ? r.value : "Not recorded"}</strong>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="trend">
                          <p className="eyebrow">DAILY AVERAGES / mg/dl</p>
                          <div className="bar-chart">
                            {Object.entries(
                              Object.groupBy(report.readings, (r) => r.date),
                            ).map(([d, rs]) => {
                              const avg =
                                rs.reduce((s, r) => s + r.value, 0) / rs.length;
                              return (
                                <div
                                  className="bar-column"
                                  key={d}
                                  title={`${pretty(d)}: ${avg.toFixed(1)} mg/dl`}
                                >
                                  <span className="bar-value">
                                    {avg.toFixed(0)}
                                  </span>
                                  <div
                                    className="bar"
                                    style={{
                                      height: Math.max(3, (avg / 600) * 150),
                                    }}
                                  />
                                  <span>{Number(d.slice(-2))}</span>
                                </div>
                              );
                            })}
                          </div>
                          <p className="fine">
                            Each bar is a recorded day; missing days are
                            omitted. Scale: 0–600 mg/dl.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </>
              )
            )}
          </section>
          <aside className="entry-section">
            <p className="eyebrow">MAKE A NOTE</p>
            <h2 id="entry-title" tabIndex="-1">
              {editing ? "Correct a reading." : "Add a reading."}
            </h2>
            <p>
              One entry per slot.
              <br />
              Up to four entries each day.
            </p>
            <form onSubmit={save} noValidate>
              <label>
                Reading date
                <input
                  type="date"
                  value={entry.date}
                  max={user.today}
                  min="1900-01-01"
                  onChange={(e) => setEntry({ ...entry, date: e.target.value })}
                />
              </label>
              <label>
                Time slot
                <select
                  value={entry.slot}
                  onChange={(e) =>
                    setEntry({ ...entry, slot: Number(e.target.value) })
                  }
                >
                  {slots.map((s, i) => (
                    <option value={i} key={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Glucose value <span className="unit">mg/dl</span>
                <input
                  inputMode="numeric"
                  type="number"
                  min="40"
                  max="600"
                  step="1"
                  placeholder="e.g. 112"
                  value={entry.value}
                  onChange={(e) =>
                    setEntry({ ...entry, value: e.target.value })
                  }
                />
              </label>
              <p className="fine">Whole numbers only. Between 40 and 600.</p>
              {formError && (
                <p className="error" role="alert">
                  {formError}
                </p>
              )}
              <button className="primary" disabled={busy}>
                {busy
                  ? "Saving…"
                  : editing
                    ? "Update reading →"
                    : "Save reading →"}
              </button>
              {editing && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setEditing(null);
                    setEntry({ date: user.today, slot: 0, value: "" });
                    setFormError("");
                  }}
                >
                  Cancel edit
                </button>
              )}
            </form>
            <p className="notice" role="status">
              {notice}
            </p>
          </aside>
        </div>
        <section className="history">
          <div className="section-top">
            <h2>02 / The ledger</h2>
            <span className="eyebrow">{total} ENTRIES / NEWEST FIRST</span>
          </div>
          {records.length === 0 ? (
            <p className="empty">
              Your ledger is empty. Start with your first reading.
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time slot</th>
                    <th>mg/dl</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td>{pretty(r.date)}</td>
                      <td>{slots[r.slot]}</td>
                      <td className="reading-value">{r.value}</td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => edit(r)}
                          aria-label={`Edit ${r.date} ${slots[r.slot]}`}
                        >
                          Edit
                        </button>
                        <button
                          className="text-button delete"
                          onClick={() => setDeleting(r)}
                          aria-label={`Delete ${r.date} ${slots[r.slot]}`}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pagination">
            <button
              disabled={page === 1 || loading}
              onClick={() => setPage(page - 1)}
            >
              ← Newer
            </button>
            <span>
              PAGE {page} OF {Math.max(1, Math.ceil(total / 12))}
            </span>
            <button
              disabled={page * 12 >= total || loading}
              onClick={() => setPage(page + 1)}
            >
              Older →
            </button>
          </div>
        </section>
        <footer>
          <span>SWEETY / A PERSONAL RECORD</span>
          <span>
            Dates use {user.timezone}. For record-keeping, not medical advice.
          </span>
        </footer>
      </main>
      {deleting && (
        <div className="modal-backdrop">
          <section
            className="confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <h2 id="delete-title">Remove this entry?</h2>
            <p>
              {pretty(deleting.date)} · {slots[deleting.slot]} ·{" "}
              {deleting.value} mg/dl
            </p>
            <p>This cannot be undone.</p>
            <button className="primary" disabled={busy} onClick={remove}>
              Delete reading
            </button>
            <button
              className="text-button"
              autoFocus
              onClick={() => setDeleting(null)}
            >
              Keep it
            </button>
          </section>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
