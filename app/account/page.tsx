import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAuth, verifyPassword } from "@/lib/auth";
import { getUserById, setUserPassword } from "@/lib/db";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const auth = await requireAuth();
  const sp = await searchParams;
  const user = getUserById(auth.userId);
  if (!user) redirect("/login");

  const handleChange = async (formData: FormData) => {
    "use server";
    const current = formData.get("current_password") as string;
    const next = formData.get("new_password") as string;
    const confirm = formData.get("confirm_password") as string;

    if (!current || !next || !confirm) {
      redirect("/account?error=missing");
    }
    if (next !== confirm) {
      redirect("/account?error=mismatch");
    }
    if (next.length < 8) {
      redirect("/account?error=too_short");
    }

    const me = getUserById(auth.userId);
    if (!me || !verifyPassword(current, me.password_hash)) {
      redirect("/account?error=wrong_current");
    }

    // Keep the current session alive but invalidate any others on this account.
    const jar = await cookies();
    const myToken = jar.get("stars_session")?.value ?? null;
    setUserPassword(auth.userId, next, myToken);

    redirect("/account?success=changed");
  };

  const errorMessage =
    sp.error === "missing"        ? "Please fill in all three fields."
  : sp.error === "mismatch"       ? "New password and confirmation don’t match."
  : sp.error === "too_short"      ? "New password must be at least 8 characters."
  : sp.error === "wrong_current"  ? "Current password is incorrect."
  : null;

  return (
    <>
      <h2>My Account</h2>

      {sp.success === "changed" && (
        <div className="alert alert-success">
          Password changed. Other devices have been signed out.
        </div>
      )}
      {errorMessage && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>{errorMessage}</div>
      )}

      <div className="card" style={{ maxWidth: 480, marginBottom: "1rem" }}>
        <h2>Profile</h2>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.35rem 1.5rem", fontSize: "0.9rem" }}>
          <dt className="text-dim">Username</dt><dd>{user.username}</dd>
          <dt className="text-dim">Role</dt>    <dd>{user.role === "admin" ? "Admin" : "Recorder"}</dd>
        </dl>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <h2>Change Password</h2>
        <form action={handleChange}>
          <div className="form-row full">
            <div className="form-group">
              <label htmlFor="current_password">Current password</label>
              <input id="current_password" name="current_password" type="password" autoComplete="current-password" required />
            </div>
          </div>
          <div className="form-row full">
            <div className="form-group">
              <label htmlFor="new_password">New password</label>
              <input id="new_password" name="new_password" type="password" autoComplete="new-password" required minLength={8} />
            </div>
          </div>
          <div className="form-row full">
            <div className="form-group">
              <label htmlFor="confirm_password">Confirm new password</label>
              <input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required minLength={8} />
            </div>
          </div>
          <p className="text-dim" style={{ fontSize: "0.8rem", marginBottom: "0.75rem" }}>
            Minimum 8 characters. Sessions on other devices will be signed out.
          </p>
          <button type="submit" className="btn btn-primary">Change password</button>
        </form>
      </div>
    </>
  );
}
