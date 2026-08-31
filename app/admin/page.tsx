import { requireAuth } from "@/lib/auth";
import {
  getAllUsers, getUserById, addUser, updateUser, setUserPassword, deleteUser, countAdmins,
} from "@/lib/db";
import { redirect } from "next/navigation";

/*
  Admin — application-level administration, as distinct from Settings,
  which configures the academy itself (tariffs, bank details, messaging).

  Settings = the academy.  Admin = the application.
*/

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const auth = await requireAuth("admin");

  const sp = await searchParams;

  // User management data
  const users = getAllUsers();
  const editingUserId = sp.editUser ? parseInt(sp.editUser, 10) : null;
  const resetPwdUserId = sp.resetPwd ? parseInt(sp.resetPwd, 10) : null;

  /* ── User management actions ─────────────────────── */

  const handleAddUser = async (formData: FormData) => {
    "use server";
    const username = (formData.get("username") as string ?? "").trim();
    const password = formData.get("password") as string;
    const role = formData.get("role") as 'admin' | 'recorder';

    if (!username || !password || (role !== "admin" && role !== "recorder")) {
      redirect("/admin?error=user_invalid");
    }
    if (password.length < 8) {
      redirect("/admin?error=user_pwd_short");
    }
    try {
      addUser(username, password, role);
      redirect("/admin?success=user_added");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("NEXT_REDIRECT")) throw e;
      if (msg.includes("UNIQUE")) {
        redirect("/admin?error=user_exists");
      }
      redirect(`/admin?error=${encodeURIComponent(msg)}`);
    }
  };

  const handleUpdateUser = async (formData: FormData) => {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    const username = (formData.get("username") as string ?? "").trim();
    const role = formData.get("role") as 'admin' | 'recorder';

    if (!id || !username || (role !== "admin" && role !== "recorder")) {
      redirect("/admin?error=user_invalid");
    }

    // Don't allow demoting the last admin.
    const target = getUserById(id);
    if (target?.role === "admin" && role !== "admin" && countAdmins() <= 1) {
      redirect("/admin?error=last_admin");
    }

    try {
      updateUser(id, username, role);
      redirect("/admin?success=user_updated");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("NEXT_REDIRECT")) throw e;
      if (msg.includes("UNIQUE")) {
        redirect("/admin?error=user_exists");
      }
      redirect(`/admin?error=${encodeURIComponent(msg)}`);
    }
  };

  const handleResetPassword = async (formData: FormData) => {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    const password = formData.get("password") as string;

    if (!id || !password) {
      redirect("/admin?error=user_invalid");
    }
    if (password.length < 8) {
      redirect("/admin?error=user_pwd_short");
    }

    // Admin reset → invalidate ALL sessions for that user (no keepToken).
    setUserPassword(id, password, null);
    redirect("/admin?success=user_pwd_reset");
  };

  const handleDeleteUser = async (formData: FormData) => {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);

    if (id === auth.userId) {
      redirect("/admin?error=delete_self");
    }
    const target = getUserById(id);
    if (target?.role === "admin" && countAdmins() <= 1) {
      redirect("/admin?error=last_admin");
    }

    deleteUser(id);
    redirect("/admin?success=user_deleted");
  };

  return (
    <>
      <h2 style={{ marginBottom: "1rem" }}>Admin</h2>

      {(sp.success === "user_added" || sp.success === "user_updated" || sp.success === "user_pwd_reset" || sp.success === "user_deleted") && (
        <div className="alert alert-success">
          {sp.success === "user_added" && "User added."}
          {sp.success === "user_updated" && "User updated."}
          {sp.success === "user_pwd_reset" && "Password reset. The user has been signed out of all devices."}
          {sp.success === "user_deleted" && "User deleted."}
        </div>
      )}
      {sp.error === "user_invalid" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>Please fill in all user fields.</div>
      )}
      {sp.error === "user_pwd_short" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>Password must be at least 8 characters.</div>
      )}
      {sp.error === "user_exists" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>That username is already taken.</div>
      )}
      {sp.error === "last_admin" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>Cannot remove the last admin. Promote another user to admin first.</div>
      )}
      {sp.error === "delete_self" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>You cannot delete your own account.</div>
      )}

      {/* ── Users ─────────────────────────────────── */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginBottom: "0.75rem" }}>Users</h2>
        <p className="text-dim" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
          Login accounts. Admins can manage all data; Recorders can only view records and record attendance.
        </p>

        <table>
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              if (editingUserId === u.id) {
                return (
                  <tr key={u.id}>
                    <td colSpan={4}>
                      <form action={handleUpdateUser} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                        <input type="hidden" name="id" value={u.id} />
                        <input name="username" defaultValue={u.username} required style={{ maxWidth: "180px" }} />
                        <select name="role" defaultValue={u.role}>
                          <option value="admin">Admin</option>
                          <option value="recorder">Recorder</option>
                        </select>
                        <button type="submit" className="btn btn-sm btn-primary">Save</button>
                        <a href="/admin" className="btn btn-sm">Cancel</a>
                      </form>
                    </td>
                  </tr>
                );
              }
              if (resetPwdUserId === u.id) {
                return (
                  <tr key={u.id}>
                    <td colSpan={4}>
                      <form action={handleResetPassword} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                        <input type="hidden" name="id" value={u.id} />
                        <span><strong>{u.username}</strong> — new password:</span>
                        <input name="password" type="password" required minLength={8} placeholder="Min 8 chars" style={{ maxWidth: "180px" }} autoComplete="new-password" />
                        <button type="submit" className="btn btn-sm btn-primary">Set Password</button>
                        <a href="/admin" className="btn btn-sm">Cancel</a>
                      </form>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={u.id}>
                  <td>
                    {u.username}
                    {u.id === auth.userId && (
                      <span className="text-dim" style={{ marginLeft: "0.5rem", fontSize: "0.8rem" }}>(you)</span>
                    )}
                  </td>
                  <td>
                    <span className={u.role === "admin" ? "pill pill-warning" : "pill pill-muted"}>
                      {u.role === "admin" ? "Admin" : "Recorder"}
                    </span>
                  </td>
                  <td className="text-dim" style={{ fontSize: "0.85rem" }}>
                    {u.created_at?.slice(0, 10) ?? "—"}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <a href={`/admin?editUser=${u.id}`} className="btn btn-sm" style={{ marginRight: "4px" }}>Edit</a>
                    <a href={`/admin?resetPwd=${u.id}`} className="btn btn-sm" style={{ marginRight: "4px" }}>Reset Password</a>
                    {u.id !== auth.userId && (
                      <form action={handleDeleteUser} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={u.id} />
                        <button type="submit" className="btn btn-sm" style={{ color: "var(--danger)" }}>Delete</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <details style={{ marginTop: "1rem" }}>
          <summary style={{ cursor: "pointer", fontSize: "0.9rem", fontWeight: 500 }}>Add new user</summary>
          <form action={handleAddUser} style={{ display: "flex", gap: "0.5rem", alignItems: "end", flexWrap: "wrap", marginTop: "0.5rem" }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: "0.8rem" }}>Username</label>
              <input name="username" required style={{ maxWidth: "180px" }} autoComplete="username" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: "0.8rem" }}>Password</label>
              <input name="password" type="password" required minLength={8} placeholder="Min 8 chars" style={{ maxWidth: "180px" }} autoComplete="new-password" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: "0.8rem" }}>Role</label>
              <select name="role" defaultValue="recorder" required>
                <option value="admin">Admin</option>
                <option value="recorder">Recorder</option>
              </select>
            </div>
            <button type="submit" className="btn btn-sm btn-primary">Add User</button>
          </form>
        </details>
      </div>

      {/* ── Data & backup ─────────────────────────── */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginBottom: "0.75rem" }}>Data &amp; Backup</h2>
        <p className="text-dim" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
          Downloads a complete copy of the database as a single file. The copy is
          taken with SQLite&apos;s <code>VACUUM INTO</code>, so it is consistent even
          if someone is recording attendance at the time.
        </p>

        <a href="/api/backup" className="btn btn-primary" download>
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
