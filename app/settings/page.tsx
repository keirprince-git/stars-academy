import { requireAuth } from "@/lib/auth";
import {
  getAllSettings, setSetting,
  getTariffDates, getTariffPackages, getCurrentTariffDate,
  addTariffPackage, updateTariffPackage, deleteTariffPackage, copyTariffSet,
  getAllUsers, getUserById, addUser, updateUser, setUserPassword, deleteUser, countAdmins,
} from "@/lib/db";
import { buildChaseMessage } from "@/lib/whatsapp";
import { redirect } from "next/navigation";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const auth = await requireAuth();
  if (auth.role !== "admin") {
    return <p className="error-msg">Only admins can access settings.</p>;
  }

  const sp = await searchParams;
  const settings = getAllSettings();

  // Tariff data
  const tariffDates = getTariffDates();
  const currentTariffDate = getCurrentTariffDate();
  const viewingDate = sp.tariffDate ?? currentTariffDate ?? tariffDates[0] ?? null;
  const tariffPackages = viewingDate ? getTariffPackages(viewingDate) : [];
  const editingTariffId = sp.editTariff ? parseInt(sp.editTariff, 10) : null;

  // User management data
  const users = getAllUsers();
  const editingUserId = sp.editUser ? parseInt(sp.editUser, 10) : null;
  const resetPwdUserId = sp.resetPwd ? parseInt(sp.resetPwd, 10) : null;

  /* ── Server actions ──────────────────────────────── */

  const handleSave = async (formData: FormData) => {
    "use server";
    const fields = ["bank_name", "bank_bank", "bank_account", "coach_phone", "chase_template"];
    for (const key of fields) {
      const value = formData.get(key) as string;
      if (value !== null && value !== undefined) {
        setSetting(key, value);
      }
    }
    redirect("/settings?success=saved");
  };

  const handleAddTariff = async (formData: FormData) => {
    "use server";
    const effectiveFrom = formData.get("effective_from") as string;
    const label = formData.get("label") as string;
    const sessions = parseInt(formData.get("sessions") as string, 10);
    const priceUpper = parseFloat(formData.get("price_upper") as string);
    const priceLower = parseFloat(formData.get("price_lower") as string);
    if (!effectiveFrom || !label || isNaN(sessions) || isNaN(priceUpper) || isNaN(priceLower)) {
      redirect(`/settings?tariffDate=${effectiveFrom}&error=invalid`);
    }
    addTariffPackage(effectiveFrom, label, sessions, priceUpper, priceLower);
    redirect(`/settings?tariffDate=${effectiveFrom}&success=tariff_added`);
  };

  const handleUpdateTariff = async (formData: FormData) => {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    const label = formData.get("label") as string;
    const sessions = parseInt(formData.get("sessions") as string, 10);
    const priceUpper = parseFloat(formData.get("price_upper") as string);
    const priceLower = parseFloat(formData.get("price_lower") as string);
    const tariffDate = formData.get("tariff_date") as string;
    if (isNaN(id) || !label || isNaN(sessions) || isNaN(priceUpper) || isNaN(priceLower)) {
      redirect(`/settings?tariffDate=${tariffDate}&error=invalid`);
    }
    updateTariffPackage(id, label, sessions, priceUpper, priceLower);
    redirect(`/settings?tariffDate=${tariffDate}&success=tariff_updated`);
  };

  const handleDeleteTariff = async (formData: FormData) => {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    const tariffDate = formData.get("tariff_date") as string;
    deleteTariffPackage(id);
    redirect(`/settings?tariffDate=${tariffDate}&success=tariff_deleted`);
  };

  const handleCopyTariff = async (formData: FormData) => {
    "use server";
    const fromDate = formData.get("from_date") as string;
    const toDate = formData.get("to_date") as string;
    if (!fromDate || !toDate) {
      redirect(`/settings?error=invalid`);
    }
    copyTariffSet(fromDate, toDate);
    redirect(`/settings?tariffDate=${toDate}&success=tariff_copied`);
  };

  /* ── User management actions ─────────────────────── */

  const handleAddUser = async (formData: FormData) => {
    "use server";
    const username = (formData.get("username") as string ?? "").trim();
    const password = formData.get("password") as string;
    const role = formData.get("role") as 'admin' | 'recorder';

    if (!username || !password || (role !== "admin" && role !== "recorder")) {
      redirect("/settings?error=user_invalid");
    }
    if (password.length < 8) {
      redirect("/settings?error=user_pwd_short");
    }
    try {
      addUser(username, password, role);
      redirect("/settings?success=user_added");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("NEXT_REDIRECT")) throw e;
      if (msg.includes("UNIQUE")) {
        redirect("/settings?error=user_exists");
      }
      redirect(`/settings?error=${encodeURIComponent(msg)}`);
    }
  };

  const handleUpdateUser = async (formData: FormData) => {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    const username = (formData.get("username") as string ?? "").trim();
    const role = formData.get("role") as 'admin' | 'recorder';

    if (!id || !username || (role !== "admin" && role !== "recorder")) {
      redirect("/settings?error=user_invalid");
    }

    // Don't allow demoting the last admin.
    const target = getUserById(id);
    if (target?.role === "admin" && role !== "admin" && countAdmins() <= 1) {
      redirect("/settings?error=last_admin");
    }

    try {
      updateUser(id, username, role);
      redirect("/settings?success=user_updated");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      if (msg.includes("NEXT_REDIRECT")) throw e;
      if (msg.includes("UNIQUE")) {
        redirect("/settings?error=user_exists");
      }
      redirect(`/settings?error=${encodeURIComponent(msg)}`);
    }
  };

  const handleResetPassword = async (formData: FormData) => {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    const password = formData.get("password") as string;

    if (!id || !password) {
      redirect("/settings?error=user_invalid");
    }
    if (password.length < 8) {
      redirect("/settings?error=user_pwd_short");
    }

    // Admin reset → invalidate ALL sessions for that user (no keepToken).
    setUserPassword(id, password, null);
    redirect("/settings?success=user_pwd_reset");
  };

  const handleDeleteUser = async (formData: FormData) => {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);

    if (id === auth.userId) {
      redirect("/settings?error=delete_self");
    }
    const target = getUserById(id);
    if (target?.role === "admin" && countAdmins() <= 1) {
      redirect("/settings?error=last_admin");
    }

    deleteUser(id);
    redirect("/settings?success=user_deleted");
  };

  // Build a preview using the actual buildChaseMessage function
  const preview = buildChaseMessage({
    playerName: "Amjad",
    balance: -5,
    parentName: "Mohammed Al-Rashid",
    ageGroup: "Upper",
  });

  return (
    <>
      <h2 style={{ marginBottom: "1rem" }}>Settings</h2>

      {sp.success === "saved" && (
        <div className="alert alert-success">
          Settings saved.
        </div>
      )}
      {(sp.success === "tariff_added" || sp.success === "tariff_updated" || sp.success === "tariff_deleted" || sp.success === "tariff_copied") && (
        <div className="alert alert-success">
          {sp.success === "tariff_added" && "Tariff package added."}
          {sp.success === "tariff_updated" && "Tariff package updated."}
          {sp.success === "tariff_deleted" && "Tariff package deleted."}
          {sp.success === "tariff_copied" && "Tariff set copied to new effective date."}
        </div>
      )}
      {(sp.success === "user_added" || sp.success === "user_updated" || sp.success === "user_pwd_reset" || sp.success === "user_deleted") && (
        <div className="alert alert-success">
          {sp.success === "user_added" && "User added."}
          {sp.success === "user_updated" && "User updated."}
          {sp.success === "user_pwd_reset" && "Password reset. The user has been signed out of all devices."}
          {sp.success === "user_deleted" && "User deleted."}
        </div>
      )}
      {sp.error === "invalid" && (
        <div className="error-msg" style={{ marginBottom: "0.75rem" }}>Please fill in all required fields.</div>
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

      {/* ── Tariff packages ───────────────────────── */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginBottom: "0.75rem" }}>Session Tariffs</h2>
        <p className="text-dim" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
          Pricing packages used when allocating bank payments to players. Tariffs are grouped by effective date.
        </p>

        {/* Date selector */}
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap" }}>
          <span className="text-dim" style={{ fontSize: "0.85rem" }}>Effective date:</span>
          {tariffDates.map((d) => (
            <a
              key={d}
              href={`/settings?tariffDate=${d}`}
              className="btn btn-sm"
              style={d === viewingDate ? { background: "var(--primary)", color: "#fff" } : {}}
            >
              {d}{d === currentTariffDate ? " (current)" : ""}
            </a>
          ))}
        </div>

        {/* Packages table */}
        {viewingDate && tariffPackages.length > 0 && (
          <div style={{ overflow: "auto", marginBottom: "1rem" }}>
            <table>
              <thead>
                <tr>
                  <th>Package</th>
                  <th className="text-right">Sessions</th>
                  <th className="text-right">Upper (₦)</th>
                  <th className="text-right">Lower (₦)</th>
                  <th className="text-right">Per session Upper</th>
                  <th className="text-right">Per session Lower</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tariffPackages.map((pkg) => (
                  editingTariffId === pkg.id ? (
                    <tr key={pkg.id}>
                      <td colSpan={7}>
                        <form action={handleUpdateTariff} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                          <input type="hidden" name="id" value={pkg.id} />
                          <input type="hidden" name="tariff_date" value={viewingDate} />
                          <input name="label" defaultValue={pkg.label} required style={{ maxWidth: "150px" }} />
                          <input name="sessions" type="number" min="1" defaultValue={pkg.sessions} required style={{ maxWidth: "80px" }} />
                          <input name="price_upper" type="number" min="0" step="100" defaultValue={pkg.price_upper} required style={{ maxWidth: "100px" }} placeholder="Upper" />
                          <input name="price_lower" type="number" min="0" step="100" defaultValue={pkg.price_lower} required style={{ maxWidth: "100px" }} placeholder="Lower" />
                          <button type="submit" className="btn btn-sm btn-primary">Save</button>
                          <a href={`/settings?tariffDate=${viewingDate}`} className="btn btn-sm">Cancel</a>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr key={pkg.id}>
                      <td>{pkg.label}</td>
                      <td className="text-right">{pkg.sessions}</td>
                      <td className="text-right">₦{pkg.price_upper.toLocaleString()}</td>
                      <td className="text-right">₦{pkg.price_lower.toLocaleString()}</td>
                      <td className="text-right text-dim">₦{Math.round(pkg.price_upper / pkg.sessions).toLocaleString()}</td>
                      <td className="text-right text-dim">₦{Math.round(pkg.price_lower / pkg.sessions).toLocaleString()}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <a href={`/settings?tariffDate=${viewingDate}&editTariff=${pkg.id}`} className="btn btn-sm" style={{ marginRight: "0.25rem" }}>Edit</a>
                        <form action={handleDeleteTariff} style={{ display: "inline" }}>
                          <input type="hidden" name="id" value={pkg.id} />
                          <input type="hidden" name="tariff_date" value={viewingDate} />
                          <button type="submit" className="btn btn-sm" style={{ color: "var(--danger)" }}>Delete</button>
                        </form>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        )}

        {viewingDate && tariffPackages.length === 0 && (
          <p className="text-dim" style={{ marginBottom: "1rem" }}>No packages for this date.</p>
        )}

        {/* Add new package */}
        {viewingDate && (
          <details style={{ marginBottom: "1rem" }}>
            <summary style={{ cursor: "pointer", fontSize: "0.9rem", fontWeight: 500 }}>Add package to {viewingDate}</summary>
            <form action={handleAddTariff} style={{ display: "flex", gap: "0.5rem", alignItems: "end", flexWrap: "wrap", marginTop: "0.5rem" }}>
              <input type="hidden" name="effective_from" value={viewingDate} />
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: "0.8rem" }}>Label</label>
                <input name="label" required placeholder="e.g. Eight sessions" style={{ maxWidth: "160px" }} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: "0.8rem" }}>Sessions</label>
                <input name="sessions" type="number" min="1" required placeholder="8" style={{ maxWidth: "80px" }} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: "0.8rem" }}>Upper (₦)</label>
                <input name="price_upper" type="number" min="0" step="100" required placeholder="50000" style={{ maxWidth: "110px" }} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: "0.8rem" }}>Lower (₦)</label>
                <input name="price_lower" type="number" min="0" step="100" required placeholder="45000" style={{ maxWidth: "110px" }} />
              </div>
              <button type="submit" className="btn btn-sm btn-primary">Add</button>
            </form>
          </details>
        )}

        {/* Copy tariff set to new year */}
        <details>
          <summary style={{ cursor: "pointer", fontSize: "0.9rem", fontWeight: 500 }}>Create new tariff year</summary>
          <form action={handleCopyTariff} style={{ display: "flex", gap: "0.5rem", alignItems: "end", flexWrap: "wrap", marginTop: "0.5rem" }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: "0.8rem" }}>Copy from</label>
              <select name="from_date" required style={{ maxWidth: "160px" }}>
                {tariffDates.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: "0.8rem" }}>New effective date</label>
              <input name="to_date" type="date" required style={{ maxWidth: "160px" }} />
            </div>
            <button type="submit" className="btn btn-sm btn-primary">Copy &amp; Create</button>
          </form>
          <p className="text-dim" style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
            Copies all packages from the selected date. You can then edit prices for the new year.
          </p>
        </details>
      </div>

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
                        <a href="/settings" className="btn btn-sm">Cancel</a>
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
                        <a href="/settings" className="btn btn-sm">Cancel</a>
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
                    <a href={`/settings?editUser=${u.id}`} className="btn btn-sm" style={{ marginRight: "4px" }}>Edit</a>
                    <a href={`/settings?resetPwd=${u.id}`} className="btn btn-sm" style={{ marginRight: "4px" }}>Reset Password</a>
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

      <form action={handleSave}>
        {/* ── Bank details ─────────────────────────── */}
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 style={{ marginBottom: "0.75rem" }}>Bank Details</h2>
          <p className="text-dim" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
            Used in the WhatsApp chase message and anywhere bank details are shown.
          </p>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="bank_name">Account Name</label>
              <input id="bank_name" name="bank_name" type="text" defaultValue={settings.bank_name} required style={{ maxWidth: "300px" }} />
            </div>
            <div className="form-group">
              <label htmlFor="bank_bank">Bank</label>
              <input id="bank_bank" name="bank_bank" type="text" defaultValue={settings.bank_bank} required style={{ maxWidth: "200px" }} />
            </div>
            <div className="form-group">
              <label htmlFor="bank_account">Account Number</label>
              <input id="bank_account" name="bank_account" type="text" defaultValue={settings.bank_account} required style={{ maxWidth: "200px" }} />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="coach_phone">Coach Phone (for payment confirmation)</label>
            <input id="coach_phone" name="coach_phone" type="text" defaultValue={settings.coach_phone} required style={{ maxWidth: "200px" }} />
          </div>
        </div>

        {/* ── WhatsApp template ────────────────────── */}
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 style={{ marginBottom: "0.75rem" }}>WhatsApp Chase Message</h2>
          <p className="text-dim" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
            Template for the payment reminder sent via the "Chase Payment" button on the player page.
          </p>
          <div style={{ fontSize: "0.8rem", color: "var(--text-dim)", marginBottom: "0.5rem" }}>
            Available placeholders: <code>{"{{player}}"}</code> (player name),{" "}
            <code>{"{{parent}}"}</code> (parent first name),{" "}
            <code>{"{{balance_line}}"}</code> (auto-generated balance text),{" "}
            <code>{"{{bank_name}}"}</code>, <code>{"{{bank_bank}}"}</code>,{" "}
            <code>{"{{bank_account}}"}</code>, <code>{"{{coach_phone}}"}</code>
          </div>
          <div className="form-group">
            <label htmlFor="chase_template">Message Template</label>
            <textarea
              id="chase_template"
              name="chase_template"
              defaultValue={settings.chase_template}
              required
              rows={12}
              style={{ width: "100%", maxWidth: "600px", fontFamily: "monospace", fontSize: "0.85rem" }}
            />
          </div>
        </div>

        {/* ── Preview ──────────────────────────────── */}
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h2 style={{ marginBottom: "0.75rem" }}>Preview</h2>
          <p className="text-dim" style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
            Example with player "Amjad", parent "Mohammed", balance -5:
          </p>
          <pre className="preview-block" style={{ lineHeight: 1.5 }}>
            {preview}
          </pre>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="submit" className="btn btn-primary">Save Settings</button>
        </div>
      </form>
    </>
  );
}
