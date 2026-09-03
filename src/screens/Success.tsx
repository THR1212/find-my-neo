import { useState } from "react";
import { NeoHeader } from "../components/NeoChrome";
import { adminMailbox, orderIsReady, type CheckoutOrder } from "../lib/checkout";

export default function Success({
  order,
  onBack,
  onRestart,
}: {
  order: CheckoutOrder | null;
  onBack: () => void;
  onRestart: () => void;
}) {
  const [selfSetup, setSelfSetup] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const ready = orderIsReady(order);
  const admin = ready ? adminMailbox(order) : null;

  if (!ready || !admin) {
    return (
      <div className="neo-funnel">
        <NeoHeader />
        <div className="neo-success-empty">
          <p className="eyebrow">Order</p>
          <h1>We can’t find that purchase.</h1>
          <p className="lede">There’s no order on this session to finish setting up.</p>
          <button className="btn" type="button" onClick={onBack}>
            Back to checkout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="neo-funnel neo-success">
      <NeoHeader />

      <div className="neo-success-main">
        <p className="neo-success-kicker">Your order purchase is successful!</p>
        <hr className="neo-success-rule" />

        {order.hasSite ? (
          <>
            <h1 className="neo-success-title">Now let’s setup your email</h1>
            <p className="neo-success-copy">
              You’ll need to add some <strong>DNS records</strong> on your domain provider’s
              website to send and receive emails on your new{" "}
              <strong className="neo-success-mail">{admin.address}</strong> email address.
              Your site continues in Neo’s builder from here — we haven’t published it.
            </p>
          </>
        ) : (
          <>
            <h1 className="neo-success-title">Now let’s setup your email</h1>
            <p className="neo-success-copy">
              You’ll need to add some <strong>DNS records</strong> on your domain provider’s
              website to send and receive emails on your new{" "}
              <strong className="neo-success-mail">{admin.address}</strong> email address
            </p>
          </>
        )}

        <button
          className="neo-success-primary"
          type="button"
          onClick={() => {
            setHelpOpen(true);
            setSelfSetup(false);
          }}
        >
          Help me set it up
        </button>
        <p className="neo-success-hint">
          Our support team can chat or get on a call with you and get everything sorted out.
        </p>

        <button
          className="neo-success-secondary"
          type="button"
          onClick={() => {
            setSelfSetup(true);
            setHelpOpen(false);
          }}
        >
          I’ll setup myself
        </button>
        <p className="neo-success-hint">
          We’ll provide instructions to add <strong>DNS records</strong>
        </p>

        {helpOpen && (
          <div className="neo-success-panel">
            <p>
              A teammate can walk you through the DNS records for{" "}
              <strong>{admin.address}</strong>
              {order.hasSite
                ? ", and how your site continues in Neo’s builder."
                : "."}{" "}
              This checkout didn’t charge a card — nothing was sent to Stripe.
            </p>
          </div>
        )}

        {selfSetup && (
          <div className="neo-success-panel">
            <p>
              On the registrar for <strong>{order.domain}</strong>, add the MX and TXT records
              Neo emails you for <strong>{admin.address}</strong>. That is what points mail at
              this mailbox. We don’t publish a site from here
              {order.hasSite ? " — site editing stays in Neo’s builder." : "."}
            </p>
          </div>
        )}

        <button className="neo-text-link neo-success-again" type="button" onClick={onRestart}>
          Start another setup
        </button>
      </div>

      <button className="neo-need-help" type="button" onClick={() => setHelpOpen(true)}>
        <span className="neo-need-help-dot" aria-hidden="true" />
        Need help?
      </button>
    </div>
  );
}
