import { requireAuth } from "@/lib/auth";

/*
  Admin — application-level administration, as distinct from Settings,
  which configures the academy itself (tariffs, bank details, messaging).

  Settings = the academy.  Admin = the application.
*/

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAuth("admin");

  return (
    <>
      <h2 style={{ marginBottom: "1rem" }}>Admin</h2>

      {/* ── Data & backup ─────────────────────────── */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginBottom: "0.75rem" }}>Data &amp; Backup</h2>
        <p className="text-dim" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
          Downloads a complete copy of the database as a single file. The copy is
          taken with SQLite&apos;s <code>VACUUM INTO</code>, so it is consistent even
          if someone is recording attendance at the time.
        </p>

        <a href="/api/backup" className="btn-primary" download>
          Download backup
        </a>

        <div className="alert alert-info" style={{ marginTop: "1rem", marginBottom: 0 }}>
          <strong>This is the off-site copy.</strong> Railway separately snapshots
          the whole volume every day (kept 6 days), week (1 month) and month
          (3 months). Those snapshots protect against a bad deploy or volume
          corruption, but they live in the same Railway account as the live data —
          so they would not survive account loss or the project being deleted.
          Download a copy here before any significant change, and keep it somewhere
          outside Railway.
        </div>
      </div>
    </>
  );
}
