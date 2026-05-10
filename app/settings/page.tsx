import { requireAuth } from "@/lib/auth";
import { getAllSettings, setSetting } from "@/lib/db";
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

  // Build a preview using the actual buildChaseMessage function
  const preview = buildChaseMessage({
    playerName: "Amjad",
    balance: -5,
    parentName: "Mohammed Al-Rashid",
  });

  return (
    <>
      <h2 style={{ marginBottom: "1rem" }}>Settings</h2>

      {sp.success === "saved" && (
        <div style={{ background: "#d1e7dd", border: "1px solid #badbcc", borderRadius: "6px", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.9rem" }}>
          Settings saved.
        </div>
      )}

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
          <div style={{ fontSize: "0.8rem", color: "#6c757d", marginBottom: "0.5rem" }}>
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
          <pre style={{
            background: "#f8f9fa",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            padding: "1rem",
            fontSize: "0.85rem",
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
          }}>
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
