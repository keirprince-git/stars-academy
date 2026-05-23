import { requireAuth } from "@/lib/auth";
import {
  ensureKitOrdersForAllPlayers,
  getAllKitOrders,
  setKitOrderStatus,
  type KitOrderStatus,
} from "@/lib/db";
import { buildKitOrderMessage, buildWhatsAppLink } from "@/lib/whatsapp";
import { KIT_YEAR, KIT_LABEL, KIT_PRICE, KIT_AVAILABILITY_DATE, APP_BASE_URL } from "@/lib/kit";
import { redirect } from "next/navigation";

export default async function KitOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const auth = await requireAuth();
  if (auth.role !== "admin") {
    return <p className="error-msg">Only admins can manage kit orders.</p>;
  }

  const sp = await searchParams;
  const statusFilter = (sp.status ?? "all") as "all" | KitOrderStatus;

  // Make sure every player has a kit_orders row for the current year.
  ensureKitOrdersForAllPlayers(KIT_YEAR);

  const allOrders = getAllKitOrders(KIT_YEAR);
  const orders = statusFilter === "all"
    ? allOrders
    : allOrders.filter((o) => o.status === statusFilter);

  // Counters for the summary chips
  const counts = {
    total: allOrders.length,
    pending: allOrders.filter((o) => o.status === "pending").length,
    confirmed: allOrders.filter((o) => o.status === "confirmed").length,
    paid: allOrders.filter((o) => o.status === "paid").length,
    gifted: allOrders.filter((o) => o.status === "gifted").length,
    collected: allOrders.filter((o) => o.status === "collected").length,
    declined: allOrders.filter((o) => o.status === "declined").length,
  };

  /* ── Server actions ──────────────────────────────────── */

  const handleSetStatus = async (formData: FormData) => {
    "use server";
    const orderId = parseInt(formData.get("order_id") as string, 10);
    const status = formData.get("status") as KitOrderStatus;
    if (!orderId || !status) redirect("/kit?error=invalid");
    setKitOrderStatus(orderId, status);
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    params.set("success", "updated");
    redirect(`/kit?${params.toString()}`);
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>Kit Orders — {KIT_YEAR}</h2>
      </div>

      <p className="text-dim" style={{ fontSize: "0.9rem", marginBottom: "1rem" }}>
        Each player has a unique confirmation link. Send it via WhatsApp; the parent confirms with one tap.
        Mark as paid once funds clear, then collected when the kit is handed over.
      </p>

      {sp.success === "updated" && (
        <div className="alert alert-success">Kit order updated.</div>
      )}

      {/* ── Summary chips ─────────────────────────── */}
      <div className="summary-row">
        <a href="/kit" className="chip" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="chip-value">{counts.total}</span>
          <span className="chip-label">Total</span>
        </a>
        <a href="/kit?status=pending" className="chip" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="chip-value" style={{ color: "var(--text-dim)" }}>{counts.pending}</span>
          <span className="chip-label">Pending</span>
        </a>
        <a href="/kit?status=confirmed" className="chip" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="chip-value" style={{ color: "var(--primary)" }}>{counts.confirmed}</span>
          <span className="chip-label">Confirmed</span>
        </a>
        <a href="/kit?status=paid" className="chip" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="chip-value" style={{ color: "var(--success)" }}>{counts.paid}</span>
          <span className="chip-label">Paid</span>
        </a>
        <a href="/kit?status=gifted" className="chip" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="chip-value" style={{ color: "#5a3296" }}>{counts.gifted}</span>
          <span className="chip-label">Free</span>
        </a>
        <a href="/kit?status=collected" className="chip" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="chip-value" style={{ color: "var(--success)" }}>{counts.collected}</span>
          <span className="chip-label">Collected</span>
        </a>
        <a href="/kit?status=declined" className="chip" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="chip-value" style={{ color: "var(--danger)" }}>{counts.declined}</span>
          <span className="chip-label">Declined</span>
        </a>
      </div>

      {/* ── Orders table ──────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Parent</th>
              <th>Status</th>
              <th>Confirmed</th>
              <th>Paid</th>
              <th>Collected</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr><td colSpan={7} className="text-center text-dim" style={{ padding: "2rem" }}>No kit orders match this filter.</td></tr>
            )}
            {orders.map((o) => {
              const link = `${APP_BASE_URL}/k/${o.token}`;
              const waMessage = buildKitOrderMessage({
                playerName: o.player_name,
                parentName: o.parent_name,
                link,
                price: KIT_PRICE,
                availabilityDate: KIT_AVAILABILITY_DATE,
              });
              const waLink = o.parent_phone
                ? buildWhatsAppLink(o.parent_phone, waMessage)
                : null;

              return (
                <tr key={o.id}>
                  <td>
                    <a href={`/players/${o.player_id}`}>{o.player_name}</a>
                    <span className="text-dim" style={{ fontSize: "0.85rem" }}> ({o.player_code})</span>
                  </td>
                  <td className="text-dim" style={{ fontSize: "0.85rem" }}>
                    {o.parent_name ?? "—"}
                    {o.parent_phone && (
                      <div style={{ fontSize: "0.8rem" }}>{o.parent_phone}</div>
                    )}
                  </td>
                  <td>
                    <span className={statusPillClass(o.status)}>{labelForStatus(o.status)}</span>
                  </td>
                  <td className="text-dim" style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                    {o.confirmed_at ? o.confirmed_at.slice(0, 10) : "—"}
                  </td>
                  <td className="text-dim" style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                    {o.paid_at
                      ? o.paid_at.slice(0, 10)
                      : o.gifted_at
                      ? `Free · ${o.gifted_at.slice(0, 10)}`
                      : "—"}
                  </td>
                  <td className="text-dim" style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                    {o.collected_at ? o.collected_at.slice(0, 10) : "—"}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {waLink ? (
                      <a href={waLink} target="_blank" rel="noopener" className="btn btn-sm" style={{ marginRight: "4px" }}>
                        WhatsApp link
                      </a>
                    ) : (
                      <a href={`/k/${o.token}`} target="_blank" rel="noopener" className="btn btn-sm" style={{ marginRight: "4px" }}>
                        Open link
                      </a>
                    )}

                    {o.status === "pending" && (
                      <StatusBtn orderId={o.id} status="confirmed" label="Mark confirmed" action={handleSetStatus} />
                    )}
                    {o.status === "confirmed" && (
                      <>
                        <StatusBtn orderId={o.id} status="paid" label="Mark paid" action={handleSetStatus} primary />
                        <StatusBtn orderId={o.id} status="gifted" label="Mark free" action={handleSetStatus} />
                      </>
                    )}
                    {(o.status === "paid" || o.status === "gifted") && (
                      <StatusBtn orderId={o.id} status="collected" label="Mark collected" action={handleSetStatus} primary />
                    )}
                    {(o.status === "confirmed" || o.status === "paid" || o.status === "gifted" || o.status === "collected" || o.status === "declined") && (
                      <StatusBtn orderId={o.id} status="pending" label="Reset" action={handleSetStatus} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-dim" style={{ fontSize: "0.8rem", marginTop: "0.75rem" }}>
        {KIT_LABEL} · ₦{KIT_PRICE.toLocaleString()} · Available from {KIT_AVAILABILITY_DATE}
      </p>
    </>
  );
}

function StatusBtn({
  orderId, status, label, action, primary,
}: {
  orderId: number;
  status: KitOrderStatus;
  label: string;
  action: (formData: FormData) => Promise<void>;
  primary?: boolean;
}) {
  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={`btn btn-sm ${primary ? "btn-primary" : ""}`} style={{ marginRight: "4px" }}>
        {label}
      </button>
    </form>
  );
}

function statusPillClass(status: KitOrderStatus): string {
  switch (status) {
    case "pending":   return "pill pill-muted";
    case "confirmed": return "pill pill-warning";
    case "paid":      return "pill pill-success";
    case "gifted":    return "pill pill-scholar";
    case "collected": return "pill pill-success";
    case "declined":  return "pill pill-danger";
  }
}

function labelForStatus(status: KitOrderStatus): string {
  switch (status) {
    case "pending":   return "Pending";
    case "confirmed": return "Confirmed";
    case "paid":      return "Paid";
    case "gifted":    return "Free";
    case "collected": return "Collected";
    case "declined":  return "Declined";
  }
}
