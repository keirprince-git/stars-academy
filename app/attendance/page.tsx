import { requireAuth } from "@/lib/auth";
import { getActivePlayers, recordAttendance, getRecentSessions, getSessionAttendance } from "@/lib/db";
import { redirect } from "next/navigation";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAuth(); // both admin and recorder can record attendance
  const sp = await searchParams;

  const view = sp.view ?? "record"; // "record" | "history" | "session"
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
          <a href="/attendance?view=history" className="btn btn-sm">View History</a>
        </div>

        {success && (
          <div style={{ background: "#d1e7dd", border: "1px solid #badbcc", borderRadius: "6px", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
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
                    background: i % 2 === 0 ? "transparent" : "#f8f9fa",
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
            <a href="/attendance?view=history" className="btn btn-sm">Back to History</a>
          </div>
        </div>

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

  // ── History view ────────────────────────────────────
  const sessions = getRecentSessions(50);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>Attendance History</h2>
        <a href="/attendance?view=record" className="btn btn-sm btn-primary">Record New</a>
      </div>

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
