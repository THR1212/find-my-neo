import { useMemo, useState } from "react";
import { NeoHeader } from "../components/NeoChrome";
import {
  checkoutViewTotals,
  EMPTY_TOTALS,
  formatApproxInr,
  formatInr,
  orderIsReady,
  type CheckoutCycle,
  type CheckoutLine,
  type CheckoutOrder,
} from "../lib/checkout";
import { playSound, unlockSound } from "../sound";

const COUNTRIES = ["India", "United States", "United Kingdom", "Singapore", "United Arab Emirates"];

export default function Checkout({
  order,
  paying,
  onBack,
  onPay,
}: {
  order: CheckoutOrder | null;
  paying: boolean;
  onBack: () => void;
  onPay: () => void;
}) {
  const [cycle, setCycle] = useState<CheckoutCycle>("yearly");
  const [country, setCountry] = useState("India");
  const [pin, setPin] = useState("560099");
  const [stateName, setStateName] = useState("Karnataka");
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingName, setBillingName] = useState("");
  const [billingLine, setBillingLine] = useState("");
  const [chatOpen, setChatOpen] = useState(true);

  const ready = orderIsReady(order);
  const yearlyTotals = useMemo(
    () => (ready ? checkoutViewTotals(order, "yearly") : EMPTY_TOTALS),
    [ready, order],
  );
  const totals = useMemo(
    () => (ready ? checkoutViewTotals(order, cycle) : EMPTY_TOTALS),
    [ready, order, cycle],
  );

  if (!ready) {
    return (
      <div className="neo-funnel">
        <NeoHeader />
        <div className="neo-checkout-empty">
          <button className="neo-back" type="button" onClick={onBack}>
            ← Back
          </button>
          <p className="eyebrow">Checkout</p>
          <h1>We don’t have a setup to pay for yet.</h1>
          <p className="lede">
            Go back to the last page and pick a domain and plan first. Nothing here is leftover
            from another business.
          </p>
          <button className="btn" type="button" onClick={onBack}>
            Back to your setup
          </button>
        </div>
      </div>
    );
  }

  const dueLabel = totals.amountDueInr == null ? "Pay" : `Pay ${formatInr(totals.amountDueInr)}`;

  return (
    <div className="neo-funnel neo-checkout">
      <NeoHeader />

      <div className="neo-checkout-wrap">
        <div className="neo-checkout-grid">
          <section className="neo-checkout-pay">
            <button className="neo-back" type="button" onClick={onBack}>
              ← Back
            </button>
            <h1 className="neo-checkout-title">Checkout</h1>

            <h2 className="neo-section-label">Payment</h2>
            <div className="neo-card-method">
              <VisaMark />
              <span className="neo-card-method-text">Card ending with 4242</span>
            </div>
            <button className="neo-text-link" type="button">
              Update payment method
            </button>

            <div className="neo-bill-row">
              <label className="neo-field">
                <span>Country</span>
                <select value={country} onChange={(e) => setCountry(e.target.value)}>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="neo-field">
                <span>Pin Code</span>
                <input
                  value={pin}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  onChange={(e) => setPin(e.target.value)}
                />
              </label>
            </div>
            <label className="neo-field">
              <span>State</span>
              <input
                value={stateName}
                autoComplete="address-level1"
                onChange={(e) => setStateName(e.target.value)}
              />
            </label>

            <button
              className={`neo-optional${billingOpen ? " is-open" : ""}`}
              type="button"
              aria-expanded={billingOpen}
              onClick={() => setBillingOpen((v) => !v)}
            >
              <span>Add billing information (Optional)</span>
              <span className="neo-optional-arrow" aria-hidden="true">
                ›
              </span>
            </button>
            {billingOpen && (
              <div className="neo-optional-fields">
                <label className="neo-field">
                  <span>Billing name</span>
                  <input
                    value={billingName}
                    autoComplete="name"
                    onChange={(e) => setBillingName(e.target.value)}
                  />
                </label>
                <label className="neo-field">
                  <span>Address</span>
                  <input
                    value={billingLine}
                    autoComplete="street-address"
                    onChange={(e) => setBillingLine(e.target.value)}
                  />
                </label>
              </div>
            )}

            <button
              className="neo-pay"
              type="button"
              disabled={paying || totals.amountDueInr == null}
              onClick={() => {
                unlockSound();
                playSound("cta");
                onPay();
              }}
            >
              {paying ? "Processing…" : dueLabel}
            </button>
            <p className="neo-secure">
              Safe and secure checkout. Powered by <StripeWord />
            </p>
          </section>

          <aside className="neo-summary" aria-label="Order summary">
            <div className="neo-summary-head">
              <h2>Order Summary</h2>
              <CyclePicker
                cycle={cycle}
                savePercent={yearlyTotals.savePercent}
                onChange={setCycle}
              />
            </div>

            {totals.lines.map((line, i) => (
              <SummaryLine
                key={`${line.kind}-${line.title}`}
                line={line}
                mailboxes={line.kind === "mail" ? order.mailboxes : null}
                last={i === totals.lines.length - 1}
              />
            ))}

            <div className="neo-due">
              <p className="neo-due-label">Amount due now</p>
              <p className="neo-due-amount">
                {totals.amountDueInr == null ? "—" : formatInr(totals.amountDueInr)}
              </p>
            </div>
            {cycle === "yearly" && totals.savedInr > 0 && (
              <p className="neo-saved">YOU SAVED {formatInr(totals.savedInr)}!</p>
            )}
          </aside>
        </div>
      </div>

      {chatOpen && (
        <div className="neo-chat" role="complementary" aria-label="Chat">
          <button
            className="neo-chat-close"
            type="button"
            aria-label="Close chat"
            onClick={() => setChatOpen(false)}
          >
            ×
          </button>
          <div className="neo-chat-bubble">Hi. Need any help?</div>
        </div>
      )}
    </div>
  );
}

function SummaryLine({
  line,
  mailboxes,
  last,
}: {
  line: CheckoutLine;
  mailboxes: CheckoutOrder["mailboxes"] | null;
  last: boolean;
}) {
  const price =
    line.due == null ? "—" : line.approx ? formatApproxInr(line.due) : formatInr(line.due);

  if (line.kind === "mail") {
    return (
      <div className="neo-line">
        <div className="neo-line-main">
          <div className="neo-line-title-row">
            <p className="neo-line-title">{line.title}</p>
            <p className="neo-line-price">
              {price}
              <span
                className="neo-info"
                title="Price from the same plan shown on your setup. Yearly is 12 months at the yearly mailbox rate."
              >
                ?
              </span>
            </p>
          </div>
          {mailboxes && (
            <ul className="neo-mails">
              {mailboxes.map((m) => (
                <li key={m.address}>
                  <span>
                    {m.address}
                    {m.admin ? " (Admin)" : ""}
                  </span>
                  {!m.admin && <TrashIcon />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  if (line.kind === "domain") {
    return (
      <div className={`neo-line neo-line-domain${last ? " neo-line-last" : ""}`}>
        <div className="neo-line-title-row">
          <div>
            <p className="neo-line-title">{line.title}</p>
            {line.host && <p className="neo-line-host">{line.host}</p>}
            {line.afterCopy && (
              <p className="neo-line-after">
                {line.afterCopy}
                <span
                  className="neo-info"
                  title="First cycle is free on .co.site. After that, Neo's sheet retail for the subdomain applies."
                >
                  ?
                </span>
              </p>
            )}
          </div>
          <div className="neo-site-price">
            <p className="neo-line-price">
              {price}
              {line.approx && (
                <span
                  className="neo-info"
                  title="Indicative registrar price from the same lookup as your setup. Yearly is that figure; monthly is it divided by 12."
                >
                  ?
                </span>
              )}
            </p>
            {line.promo && <p className="neo-free-beta">{line.promo}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="neo-line neo-line-site">
      <div className="neo-line-title-row">
        <div>
          <p className="neo-line-title">{line.title}</p>
          {line.host && <p className="neo-line-host">{line.host}</p>}
        </div>
        <div className="neo-site-price">
          <p className="neo-line-price">
            {price}
            <span
              className="neo-info"
              title="Price from the same plan shown on your setup (neo.space live rates). Yearly is 12 months at the yearly site rate."
            >
              ?
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

function CyclePicker({
  cycle,
  savePercent,
  onChange,
}: {
  cycle: CheckoutCycle;
  savePercent: number;
  onChange: (cycle: CheckoutCycle) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="neo-cycle">
      <button
        className="neo-cycle-btn"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {cycle === "yearly" ? (
          <>
            Yearly
            {savePercent > 0 && <span className="neo-save-tag"> (SAVE {savePercent}%)</span>}
          </>
        ) : (
          "Monthly"
        )}
        <span className="neo-cycle-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <ul className="neo-cycle-menu" role="listbox">
          <li>
            <button
              type="button"
              role="option"
              aria-selected={cycle === "yearly"}
              onClick={() => {
                onChange("yearly");
                setOpen(false);
              }}
            >
              Yearly
              {savePercent > 0 && <span className="neo-save-tag"> (SAVE {savePercent}%)</span>}
            </button>
          </li>
          <li>
            <button
              type="button"
              role="option"
              aria-selected={cycle === "monthly"}
              onClick={() => {
                onChange("monthly");
                setOpen(false);
              }}
            >
              Monthly
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg className="neo-trash" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 2h4l.4 1H14v1.5H2V3h3.6L6 2zm1 4.2v5.3h1.2V6.2H7zm2.4 0v5.3h1.2V6.2h-1.2zM4.6 6.2v5.3H5.8V6.2H4.6zM3.2 13c0 .6.5 1 1 1h7.6c.5 0 1-.4 1-1V5H3.2v8z"
      />
    </svg>
  );
}

function VisaMark() {
  return (
    <span className="neo-visa" aria-hidden="true">
      VISA
    </span>
  );
}

function StripeWord() {
  return (
    <span className="neo-stripe" aria-label="stripe">
      stripe
    </span>
  );
}
