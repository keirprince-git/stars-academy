import { requireAuth } from "@/lib/auth";
import { getPlayers } from "@/lib/db";

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const auth = await requireAuth();
  const sp = await searchParams;

  const status      = sp.status      ?? "all";
  const scholarship = sp.scholarship ?? "all";
  const search      = sp.search      ?? "";
  const sort        = sp.sort        ?? "code";
  const dir         = sp.dir         ?? "asc";

  const players = getPlayers({ status, scholarship, search, sort, dir });

  function sortLink(field: string, label: string) {
    const nextDir = sort === field && dir === "asc" ? "desc" : "asc";
    const p = new URLSearchParams();
    if (status !== "all")      p.set("status", status);
    if (scholarship !== "all") p.set("scholarship", scholarship);
    if (search)                p.set("search", search);
    p.set("sort", field);
    p.set("dir", nextDir);
    const arrow = sort === field ? (dir === "asc" ? " ↑" : " ↓") : "";
    return `<a href="/players?${p.toString()}">${label}${arrow}</a>`;
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>Players ({players.length})</h2>
        {auth.role === "admin" && (
          <a href="/players/new" className="btn btn-primary btn-sm">Add player</a>
        )}
      </div>

      {/* ── Filters ────────────────────────────── */}
      <form action="/players" method="GET" className="filter-bar">
        <div className="filter-group">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" name="status" defaultValue={status}>
            <option value="all">All</option>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Left">Left</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="f-schol">Scholarship</label>
          <select id="f-schol" name="scholarship" defaultValue={scholarship}>
            <option value="all">All</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="f-search">Search</label>
          <input id="f-search" name="search" type="search" defaultValue={search} placeholder="Name or code" />
        </div>
        <button type="submit" className="btn btn-sm btn-primary">Filter</button>
        <a href="/players" className="btn btn-sm">Clear</a>
      </form>

      {/* ── Table ──────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th dangerouslySetInnerHTML={{ __html: sortLink("code", "ID") }} />
              <th dangerouslySetInnerHTML={{ __html: sortLink("name", "Name") }} />
              <th dangerouslySetInnerHTML={{ __html: sortLink("play_status", "Status") }} />
              <th>Scholarship</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {players.length === 0 && (
              <tr><td colSpan={5} className="text-center text-dim" style={{ padding: "2rem" }}>No players found.</td></tr>
            )}
            {players.map((p) => (
              <tr key={p.id}>
                <td><a href={`/players/${p.id}`}>{p.code}</a></td>
                <td><a href={`/players/${p.id}`}>{p.name}</a></td>
                <td>
                  <span className={
                    p.play_status === "Active" ? "badge-active" :
                    p.play_status === "Inactive" ? "badge-inactive" : "badge-left"
                  }>{p.play_status}</span>
                </td>
                <td>{p.scholarship ? "Yes" : ""}</td>
                <td className="text-dim" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.notes ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
