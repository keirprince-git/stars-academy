import { requireAuth } from "@/lib/auth";
import { getActivePlayers, recordAttendance, getRecentSessions, getSessionAttendance, getAttendanceGrid, deleteAttendanceSession, changeSessionDate } from "@/lib/db";
import { redirect } from "next/navigation";

function fmtCol(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
  return { wd, dm: `${d.getDate()} ${mo}` };
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const auth = await requireAuth(); // both admin and recorder can record attendance
  const sp = await searchParams;

  const view = sp.view ?? "record"; // "record" | "history" | "session" | "grid"
  const success = sp.success;

  // Server action - declared at top level to avoid strict-mode block restriction
  const handleRecord = async (formData: FormData) => {
    "use server";
    const sessionDate = formData.get("session_date") as string;
    const sessionDay = formData.get("session_day") as string;

    if (!sessionDate) {
      redirect("/attendance?error=date_required");
    }

    const attendedIds: number[] = [];
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("player_") && value === "on") {
        attendedIds.push(parseInt(key.replace("player_", ""), 10));
      }
    }

    recordAttendance(sessionDate, sessionDay, attendedIds);
    redirect(`/attendance?success=1&recorded=${attendedIds.length}&date=${sessionDate}`);
  };

  // Delete a whole session (admin only) - for mistaken/empty entries
  const handleDeleteSession = async (formData: FormData) => {
    "use server";
    await requireAuth("admin");
    const sessionDate = formData.get("session_date") as string;
    if (sessionDate) deleteAttendanceSession(sessionDate);
    redirect(`/attendance?view=history&success=deleted&date=${sessionDate}`);
  };

  // Move a session to a different date (admin only) - for a wrong date entered
  const handleChangeDate = async (formData: FormData) => {
    "use server";
    await requireAuth("admin");
    const fromDate = formData.get("from_date") as string;
    const toDate = formData.get("to_date") as string;
    if (!toDate || toDate === fromDate) {
      redirect(`/attendance?view=session&date=${fromDate}`);
    }
    const res = changeSessionDate(fromDate, toDate);
    if ("error" in res) {
      redirect(`/attendance?view=session&date=${fromDate}&error=date_taken`);
    }
    redirect(`/attendance?view=session&date=${toDate}&success=moved&from=${fromDate}`);
  };

  // ── Record view ─────────────────────────────────────
  if (view === "record") {
    const players = getActivePlayers();
    const today = new Date().toISOString().slice(0, 10);

    // Determine day of week for default
    const dayOfWeek = new Date().getDay(); // 0=Sun, 2=Tue, 5=Fri
    const defaultDay = dayOfWeek === 5 ? "Friday" : "Tuesday";

    // If editing an existing session, pre-load attendance
    const editDate = sp.date;
    let preChecked: Set<number> | null = null;
    if (editDate) {
      const existing = getSessionAttendance(editDate);
      if (existing.length > 0) {
        preChecked = new Set(existing.filter(e => e.attended === 1).map(e => e.player_id));
      }
    }

    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2>Record Attendance</h2>
          <div className="gap-sm">
            {auth.role === "admin" && <a href="/attendance?view=grid" className="btn btn-sm">Overview</a>}
            <a href="/attendance?view=history" className="btn btn-sm">View History</a>
          </div>
        </div>

        {success && (
          <div className="alert alert-success">
            Attendance recorded: {sp.recorded} player{sp.recorded !== "1" ? "s" : ""} attended on {sp.date}.
          </div>
        )}

        {sp.error === "date_required" && (
          <div className="error-msg" style={{ marginBottom: "0.75rem" }}>Please enter a session date.</div>
        )}

        <div className="card">
          <form action={handleRecord}>
            {/* ── Date & Day ────────────────────────── */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="session_date">Session Date</label>
                <input
                  id="session_date"
                  name="session_date"
                  type="date"
                  defaultValue={editDate ?? today}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="session_day">Session Day</label>
                <select id="session_day" name="session_day" defaultValue={defaultDay}>
                  <option value="Tuesday">Tuesday</option>
                  <option value="Friday">Friday</option>
                </select>
              </div>
            </div>

            {/* ── Player checkboxes ─────────────────── */}
            <fieldset style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "1rem", marginTop: "0.75rem" }}>
              <legend style={{ fontWeight: 600, fontSize: "0.9rem", padding: "0 0.5rem" }}>
                Which players attended? ({players.length} active)
              </legend>

              {/* Select all / none controls */}
              <div style={{ marginBottom: "0.75rem", fontSize: "0.85rem" }}>
                <button type="button" className="btn btn-sm" style={{ marginRight: "0.5rem" }}
                  data-select-action="all">
                  Select all
                </button>
                <button type="button" className="btn btn-sm"
                  data-select-action="none">
                  Select none
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "2px" }}>
                {players.map((p, i) => (
                  <label key={p.id} style={{
                    display: "flex", alignItems: "center", gap: "0.5rem",
                    fontSize: "0.9rem", cursor: "pointer",
                    padding: "0.45rem 0.6rem", borderRadius: "4px",
                    background: i % 2 === 0 ? "transparent" : "#f5f1ea",
                  }}>
                    <input
                      type="checkbox"
                      name={`player_${p.id}`}
                      data-player-cb="true"
                      defaultChecked={preChecked ? preChecked.has(p.id) : false}
                      style={{ width: "16px", height: "16px", accentColor: "var(--primary)" }}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </fieldset>

            <button type="submit" className="btn btn-primary mt-1" style={{ marginTop: "1rem" }}>
              Record Attendance
            </button>
          </form>
        </div>

        {/* Inline script for select all/none buttons */}
        <script dangerouslySetInnerHTML={{ __html: `
          document.querySelectorAll('[data-select-action]').forEach(function(btn) {
            btn.addEventListener('click', function() {
              var checked = this.getAttribute('data-select-action') === 'all';
              document.querySelectorAll('[data-player-cb]').forEach(function(cb) { cb.checked = checked; });
            });
          });
        `}} />
      </>
    );
  }

  // ── Delete-session confirmation (admin only) ────────
  if (view === "deleteconfirm" && sp.date) {
    if (auth.role !== "admin") {
      return <p className="error-msg">Only admins can delete sessions.</p>;
    }
    const rows = getSessionAttendance(sp.date);
    const attended = rows.filter(r => r.attended === 1).length;
    return (
      <>
        <h2 style={{ marginBottom: "1rem" }}>Delete session?</h2>
        <div className="card">
          <p style={{ marginBottom: "0.75rem" }}>
            This permanently removes the attendance record for <strong>{sp.date}</strong>
            {" "}({attended} marked attended, {rows.length} player row{rows.length !== 1 ? "s" : ""}).
            This cannot be undone — you would have to re-record the session.
          </p>
          <div className="gap-sm">
            <form action={handleDeleteSession} style={{ display: "inline" }}>
              <input type="hidden" name="session_date" value={sp.date} />
              <button type="submit" className="btn btn-sm btn-danger">Yes, delete this session</button>
            </form>
            <a href={`/attendance?view=session&date=${sp.date}`} className="btn btn-sm">Cancel</a>
          </div>
        </div>
      </>
    );
  }

  // ── Session detail view ─────────────────────────────
  if (view === "session" && sp.date) {
    const rows = getSessionAttendance(sp.date);
    const attended = rows.filter(r => r.attended === 1);
    const absent = rows.filter(r => r.attended === 0);

    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2>Session: {sp.date}</h2>
          <div className="gap-sm">
            <a href={`/attendance?view=record&date=${sp.date}`} className="btn btn-sm btn-primary">Edit</a>
            {auth.role === "admin" && <a href={`/attendance?view=deleteconfirm&date=${sp.date}`} className="btn btn-sm btn-danger">Delete</a>}
            <a href="/attendance?view=history" className="btn btn-sm">Back to History</a>
          </div>
        </div>

        {sp.success === "moved" && (
          <div className="alert alert-success">Session moved{sp.from ? ` from ${sp.from}` : ""} to {sp.date}.</div>
        )}
        {sp.error === "date_taken" && (
          <div className="error-msg" style={{ marginBottom: "0.75rem" }}>
            That date already has a session recorded. Delete or edit it first, or pick another date.
          </div>
        )}

        <div className="summary-row">
          <div className="chip">
            <span className="chip-value">{attended.length}</span>
            <span className="chip-label">Attended</span>
          </div>
          <div className="chip">
            <span className="chip-value">{absent.length}</span>
            <span className="chip-label">Absent</span>
          </div>
        </div>

        {auth.role === "admin" && (
          <div className="card">
            <form action={handleChangeDate} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-end", flexWrap: "wrap", marginBottom: 0 }}>
              <input type="hidden" name="from_date" value={sp.date} />
              <div className="form-group" style={{ maxWidth: 200 }}>
                <label htmlFor="to_date">Change session date to</label>
                <input id="to_date" name="to_date" type="date" defaultValue={sp.date} required />
              </div>
              <button type="submit" className="btn btn-sm btn-primary" style={{ marginBottom: "0.1rem" }}>Move session</button>
            </form>
          </div>
        )}

        <div className="card">
          <h2>Attended ({attended.length})</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.3rem", fontSize: "0.9rem" }}>
            {attended.map(r => (
              <span key={r.player_id}>
                <a href={`/players/${r.player_id}`}>{r.name}</a>
                <span className="text-dim"> ({r.code})</span>
              </span>
            ))}
          </div>
        </div>

        {absent.length > 0 && (
          <div className="card">
            <h2>Absent ({absent.length})</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.3rem", fontSize: "0.9rem", color: "var(--text-dim)" }}>
              {absent.map(r => (
                <span key={r.player_id}>{r.name} ({r.code})</span>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  // ── Grid / overview view (admin only) ───────────────
  if (view === "grid") {
    if (auth.role !== "admin") {
      return <p className="error-msg">Only admins can view the attendance overview.</p>;
    }
    const grid = getAttendanceGrid(12);

    return (
      <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2>Attendance Overview</h2>
          <div className="gap-sm">
            <a href="/attendance?view=history" className="btn btn-sm">History</a>
            <a href="/attendance?view=record" className="btn btn-sm btn-primary">Record New</a>
          </div>
        </div>

        {grid.sessions.length === 0 ? (
          <div className="card"><p className="text-dim">No sessions recorded yet.</p></div>
        ) : (
          <>
            <p className="text-dim" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
              Last {grid.sessions.length} session{grid.sessions.length !== 1 ? "s" : ""} · active players, most regular first. ✓ = attended.
            </p>
            <div className="card" style={{ padding: 0, overflow: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr>
                    <th style={{ position: "sticky", left: 0, background: "var(--surface)", textAlign: "left", minWidth: 160, zIndex: 1 }}>Player</th>
                    {grid.sessions.map((s) => {
                      const c = fmtCol(s);
                      return (
                        <th key={s} className="text-center" style={{ minWidth: 46, lineHeight: 1.15, padding: "0.4rem 0.25rem" }}>
                          <div style={{ fontWeight: 600 }}>{c.wd}</div>
                          <div className="text-dim" style={{ fontWeight: 400, fontSize: "0.72rem" }}>{c.dm}</div>
                        </th>
                      );
                    })}
                    <th className="text-center" style={{ minWidth: 46 }}>Tot</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.players.map((p, ri) => (
                    <tr key={p.id} style={{ background: ri % 2 ? "var(--surface-2)" : "transparent" }}>
                      <td style={{ position: "sticky", left: 0, background: ri % 2 ? "var(--surface-2)" : "var(--surface)", whiteSpace: "nowrap" }}>
                        <a href={`/players/${p.id}`}>{p.name}</a>
                      </td>
                      {p.cells.map((on, ci) => (
                        <td key={ci} className="text-center" style={{
                          background: on ? "var(--primary-soft)" : "transparent",
                          color: on ? "var(--primary)" : "#cfd4d9",
                          fontWeight: on ? 700 : 400,
                        }}>{on ? "✓" : "·"}</td>
                      ))}
                      <td className="text-center" style={{ fontWeight: 600 }}>{p.total}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 600 }}>
                    <td style={{ position: "sticky", left: 0, background: "var(--surface)" }}>Attending</td>
                    {grid.sessionTotals.map((t, i) => (
                      <td key={i} className="text-center">{t}</td>
                    ))}
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </>
    );
  }

  // ── History view ────────────────────────────────────
  const sessions = getRecentSessions(50);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>Attendance History</h2>
        <div className="gap-sm">
          {auth.role === "admin" && <a href="/attendance?view=grid" className="btn btn-sm">Overview</a>}
          <a href="/attendance?view=record" className="btn btn-sm btn-primary">Record New</a>
        </div>
      </div>

      {sp.success === "deleted" && (
        <div className="alert alert-success">Session {sp.date} deleted.</div>
      )}

      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th className="text-right">Attended</th>
              <th className="text-right">Total</th>
              <th className="text-right">Rate</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 && (
              <tr><td colSpan={5} className="text-center text-dim" style={{ padding: "2rem" }}>No sessions recorded yet.</td></tr>
            )}
            {sessions.map((s) => (
              <tr key={s.session_date}>
                <td>{s.session_date}</td>
                <td className="text-right">{s.attended_count}</td>
                <td className="text-right">{s.total_count}</td>
                <td className="text-right">
                  {s.total_count > 0 ? `${Math.round((s.attended_count / s.total_count) * 100)}%` : "—"}
                </td>
                <td>
                  <a href={`/attendance?view=session&date=${s.session_date}`} className="btn btn-sm">View</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
