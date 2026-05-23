import { redirect } from "next/navigation";
import { getKitOrderByToken, setKitOrderStatus, getAllSettings } from "@/lib/db";
import { KIT_LABEL, KIT_PRICE, KIT_ITEMS, KIT_AVAILABILITY_DATE } from "@/lib/kit";

export const metadata = { title: "Stars Academy — Kit Confirmation" };

export default async function KitConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const order = getKitOrderByToken(token);
  const settings = getAllSettings();
  // A kit marked free keeps its gifted_at stamp even after it's collected,
  // so we treat it as a free kit throughout (no payment instructions).
  const wasGifted = !!order?.gifted_at;

  // Server actions ─────────────────────────────────
  async function handleConfirm() {
    "use server";
    const o = getKitOrderByToken(token);
    if (!o) return;
    setKitOrderStatus(o.id, "confirmed");
    redirect(`/k/${token}?action=confirmed`);
  }

  async function handleDecline() {
    "use server";
    const o = getKitOrderByToken(token);
    if (!o) return;
    setKitOrderStatus(o.id, "declined");
    redirect(`/k/${token}?action=declined`);
  }

  async function handleReset() {
    "use server";
    const o = getKitOrderByToken(token);
    if (!o) return;
    setKitOrderStatus(o.id, "pending");
    redirect(`/k/${token}`);
  }

  return (
    <div className="kit-page">
      <header className="kit-header">
        <img src="/Logo.JPG" alt="Stars Academy" />
        <div className="brand">
          <div className="academy">The Stars Football Academy</div>
          <div className="tagline">Kit confirmation</div>
        </div>
      </header>

      <main className="kit-main">
        {!order && (
          <div className="kit-card alert alert-danger" style={{ textAlign: "center" }}>
            We couldn’t find that kit confirmation link. Please double-check the URL,
            or get in touch with Coach Sunny.
          </div>
        )}

        {order && (
          <>
            <h1 className="kit-title">
              {KIT_LABEL}<br />
              <span className="kit-for">for {order.player_name}</span>
            </h1>

            <div className="kit-card">
              <div className="kit-price">
                <span className="label">Complete bundle</span>
                <span className="amount"><span className="currency">₦</span>{KIT_PRICE.toLocaleString()}</span>
                <span className="avail">Available from {KIT_AVAILABILITY_DATE}</span>
              </div>
              <ul className="kit-items">
                {KIT_ITEMS.map((item) => (<li key={item}>{item}</li>))}
              </ul>
              <p className="kit-note">
                The kits have been tailor-made for each player, so no sizing is needed —
                just confirm below and we’ll have it ready for collection.
              </p>
            </div>

            {/* ── Confirmation state (paid flow) ──────────── */}
            {!wasGifted && (order.status === "confirmed" || order.status === "paid" || order.status === "collected") && (
              <div className="kit-card kit-state confirmed">
                <div className="state-icon">✓</div>
                <h2>Confirmed — thank you!</h2>
                <p>
                  We have your kit order for <strong>{order.player_name}</strong>.
                  To complete your order, please transfer the payment using the bank details below
                  and send the payment confirmation to Coach Sunny on WhatsApp.
                </p>
                <p className="state-extra-soft">
                  Once we receive the confirmation, the kit will be ready for {order.player_name} to
                  collect at the next training session.
                </p>
                {order.status === "paid" && (
                  <p className="state-extra">Payment received — kit ready for collection at the next session.</p>
                )}
                {order.status === "collected" && (
                  <p className="state-extra">Kit collected. Enjoy the new season!</p>
                )}
              </div>
            )}

            {/* ── Gifted state (free kit, incl. once collected) ── */}
            {wasGifted && (
              <div className="kit-card kit-state confirmed">
                <div className="state-icon">✓</div>
                <h2>Kit provided free</h2>
                <p>
                  The academy is providing {order.player_name}’s kit free of charge —
                  no payment is needed.
                  {order.status === "collected"
                    ? " Kit collected — enjoy the new season!"
                    : " It will be ready to collect at the next training session."}
                </p>
              </div>
            )}

            {/* ── Payment details (shown whenever payment may be required) ── */}
            {order.status !== "declined" && !wasGifted && (
              <div className="kit-card kit-payment">
                <h3>How to pay</h3>
                <p className="pay-intro">
                  Transfer <strong>₦{KIT_PRICE.toLocaleString()}</strong> to the academy account, then send
                  proof of payment to Coach Sunny on WhatsApp.
                </p>
                <dl className="bank">
                  <dt>Account name</dt>
                  <dd>{settings.bank_name || "The Stars Football Academy"}</dd>
                  <dt>Bank</dt>
                  <dd>{settings.bank_bank || "Taj Bank"}</dd>
                  <dt>Account number</dt>
                  <dd className="account">{settings.bank_account || "0010270588"}</dd>
                </dl>
                <div className="coach-line">
                  <span className="coach-label">Send payment confirmation to Coach Sunny:</span>
                  <span className="coach-num">{settings.coach_phone || "0807 077 7069"}</span>
                </div>
                <p className="collect-note">
                  Once Coach Sunny has confirmed payment, the kit will be ready for
                  {order.status === "pending" ? " your child" : ` ${order.player_name}`} to collect
                  at the next training session.
                </p>
              </div>
            )}

            {order.status === "declined" && (
              <div className="kit-card kit-state declined">
                <h2>Marked as “not this season”</h2>
                <p>No problem — we’ve recorded that {order.player_name} won’t be taking the kit this season.</p>
              </div>
            )}

            {order.status === "pending" && (
              <div className="kit-card kit-actions">
                <p className="prompt">
                  Would you like to order the kit for <strong>{order.player_name}</strong>?
                </p>
                <form action={handleConfirm}>
                  <button type="submit" className="kit-btn kit-btn-primary">
                    Yes, please order the kit (₦{KIT_PRICE.toLocaleString()})
                  </button>
                </form>
                <form action={handleDecline}>
                  <button type="submit" className="kit-btn kit-btn-ghost">
                    No, not this season
                  </button>
                </form>
              </div>
            )}

            {/* Reset link sits below once the order is in a settled state */}
            {(order.status === "confirmed" || order.status === "paid" || order.status === "gifted" || order.status === "collected" || order.status === "declined") && (
              <form action={handleReset} style={{ textAlign: "center" }}>
                <button type="submit" className="kit-link-btn">Changed your mind? Reset</button>
              </form>
            )}

            {sp.action === "confirmed" && (
              <p className="kit-toast">Thanks — your confirmation is recorded.</p>
            )}
            {sp.action === "declined" && (
              <p className="kit-toast">Recorded. You can change your mind any time using this link.</p>
            )}
          </>
        )}

        <footer className="kit-footer">
          The Stars Football Academy · Abuja
        </footer>
      </main>

      <style>{`
        :root {
          --kit-primary: #E8772E;
          --kit-primary-hover: #d06820;
          --kit-text: #11161b;
          --kit-text-dim: #6a727a;
          --kit-bg: #fff8f1;
          --kit-surface: #ffffff;
          --kit-success: #2a9d5a;
          --kit-success-bg: #e0f3e8;
          --kit-muted: #ebedf0;
        }
        body { margin: 0; background: var(--kit-bg); }
        .kit-page {
          font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
          color: var(--kit-text);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }
        .kit-header {
          background: #11161b;
          color: white;
          padding: 0.9rem 1.25rem;
          display: flex;
          align-items: center;
          gap: 0.7rem;
          border-bottom: 3px solid var(--kit-primary);
        }
        .kit-header img {
          height: 36px;
          background: white;
          padding: 2px;
          border-radius: 4px;
          display: block;
        }
        .kit-header .brand .academy {
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          line-height: 1.1;
          text-transform: uppercase;
        }
        .kit-header .brand .tagline {
          font-size: 0.78rem;
          color: var(--kit-primary);
          margin-top: 2px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .kit-main {
          flex: 1;
          max-width: 480px;
          margin: 0 auto;
          width: 100%;
          padding: 1.5rem 1rem 2rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .kit-title {
          margin: 0.5rem 0 0.25rem;
          font-size: 1.5rem;
          line-height: 1.25;
          font-weight: 700;
          text-align: center;
        }
        .kit-title .kit-for {
          color: var(--kit-text-dim);
          font-weight: 500;
          font-size: 1.1rem;
        }
        .kit-card {
          background: var(--kit-surface);
          border-radius: 12px;
          padding: 1.25rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.02);
        }
        .kit-price {
          display: flex;
          flex-direction: column;
          align-items: center;
          background: var(--kit-primary);
          color: white;
          border-radius: 10px;
          padding: 1rem;
          margin-bottom: 1rem;
        }
        .kit-price .label {
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          opacity: 0.95;
        }
        .kit-price .amount {
          font-size: 2.4rem;
          font-weight: 900;
          line-height: 1;
          margin-top: 0.2rem;
          font-variant-numeric: tabular-nums;
        }
        .kit-price .amount .currency {
          font-size: 1.2rem;
          vertical-align: top;
          margin-right: 2px;
        }
        .kit-price .avail {
          margin-top: 0.5rem;
          font-size: 0.82rem;
          opacity: 0.95;
        }
        .kit-items {
          list-style: none;
          padding: 0;
          margin: 0 0 0.75rem;
        }
        .kit-items li {
          padding: 0.4rem 0;
          font-size: 0.95rem;
          font-weight: 500;
          border-bottom: 1px solid #f3f4f6;
          padding-left: 1.7rem;
          position: relative;
        }
        .kit-items li:last-child { border-bottom: 0; }
        .kit-items li::before {
          content: "";
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 1.1rem;
          height: 1.1rem;
          border-radius: 50%;
          background: var(--kit-primary);
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><path fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round' d='M3.5 8.5l3 3 6-6'/></svg>");
          background-size: 100% 100%;
        }
        .kit-note {
          color: var(--kit-text-dim);
          font-size: 0.85rem;
          margin: 0;
          line-height: 1.45;
        }
        .kit-actions {
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .kit-actions .prompt {
          margin: 0 0 0.4rem;
          font-size: 1rem;
          font-weight: 500;
          text-align: center;
        }
        .kit-btn {
          width: 100%;
          padding: 0.9rem 1rem;
          border-radius: 10px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid transparent;
          font-family: inherit;
        }
        .kit-btn-primary {
          background: var(--kit-primary);
          color: white;
        }
        .kit-btn-primary:hover { background: var(--kit-primary-hover); }
        .kit-btn-ghost {
          background: transparent;
          color: var(--kit-text-dim);
          border-color: #e5e8eb;
          font-weight: 500;
          font-size: 0.9rem;
          padding: 0.7rem 1rem;
        }
        .kit-btn-ghost:hover { background: #f5f1ea; color: var(--kit-text); }
        .kit-state {
          text-align: center;
        }
        .kit-state.confirmed {
          background: var(--kit-success-bg);
          border: 1px solid #c5e6d2;
        }
        .kit-state.confirmed .state-icon {
          font-size: 2.2rem;
          color: var(--kit-success);
          font-weight: 700;
          line-height: 1;
          margin-bottom: 0.3rem;
        }
        .kit-state.declined {
          background: var(--kit-muted);
          border: 1px solid #d6dade;
        }
        .kit-state h2 {
          font-size: 1.2rem;
          font-weight: 700;
          margin: 0 0 0.4rem;
        }
        .kit-state p {
          margin: 0;
          font-size: 0.95rem;
          line-height: 1.45;
        }
        .kit-state .state-extra {
          margin-top: 0.5rem;
          font-weight: 600;
          color: var(--kit-success);
        }
        .kit-state .state-extra-soft {
          margin-top: 0.5rem;
          color: var(--kit-text-dim);
          font-size: 0.9rem;
        }

        /* Payment block */
        .kit-payment h3 {
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--kit-text-dim);
          margin: 0 0 0.6rem;
        }
        .kit-payment .pay-intro {
          margin: 0 0 0.85rem;
          font-size: 0.95rem;
          line-height: 1.4;
        }
        .kit-payment .bank {
          background: #fff4ea;
          border-left: 4px solid var(--kit-primary);
          border-radius: 0 8px 8px 0;
          padding: 0.75rem 1rem;
          margin-bottom: 0.9rem;
        }
        .kit-payment .bank dt {
          color: var(--kit-text-dim);
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-top: 0.4rem;
        }
        .kit-payment .bank dt:first-child { margin-top: 0; }
        .kit-payment .bank dd {
          margin: 0;
          font-weight: 700;
          font-size: 1rem;
        }
        .kit-payment .bank dd.account {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 1.15rem;
          letter-spacing: 0.06em;
        }
        .kit-payment .coach-line {
          background: var(--kit-text);
          color: white;
          border-radius: 8px;
          padding: 0.7rem 0.85rem;
          margin-bottom: 0.85rem;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .kit-payment .coach-label {
          font-size: 0.8rem;
          opacity: 0.88;
        }
        .kit-payment .coach-num {
          font-weight: 800;
          font-size: 1.15rem;
          color: var(--kit-primary);
          letter-spacing: 0.04em;
        }
        .kit-payment .collect-note {
          margin: 0;
          font-size: 0.85rem;
          line-height: 1.45;
          color: var(--kit-text-dim);
          font-style: italic;
        }
        .kit-link-btn {
          margin-top: 1rem;
          background: transparent;
          border: 0;
          color: var(--kit-text-dim);
          font-size: 0.8rem;
          text-decoration: underline;
          cursor: pointer;
          font-family: inherit;
        }
        .kit-toast {
          background: #fff4ea;
          color: #8a4a10;
          padding: 0.65rem 0.85rem;
          border-radius: 8px;
          font-size: 0.85rem;
          margin: 0;
          text-align: center;
        }
        .alert {
          padding: 0.85rem 1rem;
          border-radius: 8px;
          font-size: 0.95rem;
          line-height: 1.45;
        }
        .alert-danger {
          background: #fde7e7;
          color: #b22020;
          border: 1px solid #f5cdcd;
        }
        .kit-footer {
          margin-top: auto;
          padding-top: 1.5rem;
          text-align: center;
          color: var(--kit-text-dim);
          font-size: 0.78rem;
        }
      `}</style>
    </div>
  );
}
