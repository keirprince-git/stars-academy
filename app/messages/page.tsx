import { requireAuth } from "@/lib/auth";
import { buildGroupTariffMessage, buildCancellationMessage } from "@/lib/whatsapp";
import { redirect } from "next/navigation";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const auth = await requireAuth();
  if (auth.role !== "admin") {
    return <p className="error-msg">Only admins can access messages.</p>;
  }

  const sp = await searchParams;

  // Pre-generate the tariff message
  const tariffMessage = buildGroupTariffMessage();

  // Generate cancellation message if form was submitted
  const cancelDate = sp.cancelDate ?? "";
  const cancelReason = sp.cancelReason ?? "";
  const cancellationMessage = cancelDate && cancelReason
    ? buildCancellationMessage({ date: cancelDate, reason: cancelReason })
    : null;

  const handleCancellation = async (formData: FormData) => {
    "use server";
    const date = formData.get("cancelDate") as string;
    const reason = formData.get("cancelReason") as string;
    if (!date || !reason) {
      redirect("/messages?error=invalid");
    }
    redirect(`/messages?cancelDate=${encodeURIComponent(date)}&cancelReason=${encodeURIComponent(reason)}`);
  };

  return (
    <>
      <h2 style={{ marginBottom: "1rem" }}>Group Messages</h2>
      <p className="text-dim" style={{ fontSize: "0.9rem", marginBottom: "1rem" }}>
        Pre-written messages for WhatsApp groups. Click &ldquo;Copy&rdquo; then paste into your group chat.
      </p>

      {/* ── Tariff announcement ──────────────────── */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <h2>Tariff Announcement</h2>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            id="copyTariffBtn"
          >
            Copy
          </button>
        </div>
        <p className="text-dim" style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>
          Current session pricing for both age groups, with bank details.
        </p>
        <pre
          id="tariffMessage"
          style={{
            background: "#f8f9fa",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            padding: "1rem",
            fontSize: "0.85rem",
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
          }}
        >
          {tariffMessage}
        </pre>
      </div>

      {/* ── Session cancellation ─────────────────── */}
      <div className="card" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginBottom: "0.75rem" }}>Session Cancellation</h2>
        <p className="text-dim" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
          Generate a cancellation notice. Fill in the details, then copy the message.
        </p>

        <form action={handleCancellation} style={{ display: "flex", gap: "0.75rem", alignItems: "end", flexWrap: "wrap", marginBottom: "1rem" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="cancelDate">Session date</label>
            <input
              id="cancelDate"
              name="cancelDate"
              type="date"
              defaultValue={cancelDate}
              required
              style={{ maxWidth: "180px" }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
            <label htmlFor="cancelReason">Reason</label>
            <input
              id="cancelReason"
              name="cancelReason"
              type="text"
              defaultValue={cancelReason}
              required
              placeholder="e.g. heavy rain"
              style={{ maxWidth: "300px" }}
            />
          </div>
          <button type="submit" className="btn btn-sm btn-primary">Generate</button>
        </form>

        {cancellationMessage && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.5rem" }}>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                id="copyCancelBtn"
              >
                Copy
              </button>
            </div>
            <pre
              id="cancelMessage"
              style={{
                background: "#f8f9fa",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                padding: "1rem",
                fontSize: "0.85rem",
                whiteSpace: "pre-wrap",
                lineHeight: 1.5,
              }}
            >
              {cancellationMessage}
            </pre>
          </>
        )}
      </div>

      {/* ── Copy-to-clipboard script ─────────────── */}
      <script dangerouslySetInnerHTML={{ __html: `
        function copyText(elementId, buttonId) {
          var text = document.getElementById(elementId).textContent;
          navigator.clipboard.writeText(text).then(function() {
            var btn = document.getElementById(buttonId);
            var orig = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(function() { btn.textContent = orig; }, 2000);
          });
        }
        document.getElementById('copyTariffBtn').addEventListener('click', function() {
          copyText('tariffMessage', 'copyTariffBtn');
        });
        var cancelBtn = document.getElementById('copyCancelBtn');
        if (cancelBtn) {
          cancelBtn.addEventListener('click', function() {
            copyText('cancelMessage', 'copyCancelBtn');
          });
        }
      `}} />
    </>
  );
}
