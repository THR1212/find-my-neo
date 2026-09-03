import { NeoHeader } from "../components/NeoChrome";
import { adminMailbox, orderIsReady, type CheckoutOrder } from "../lib/checkout";

export default function Success({
  order,
  onBack,
}: {
  order: CheckoutOrder | null;
  onBack: () => void;
}) {
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

        <h1 className="neo-success-title">Now let’s setup your email</h1>
        <p className="neo-success-copy">
          You’ll need to add some <strong>DNS records</strong> on your domain provider’s website
          to send and receive emails on your new{" "}
          <a className="neo-success-mail" href={`mailto:${admin.address}`}>
            {admin.address}
          </a>{" "}
          email address
        </p>

        <button className="neo-success-primary" type="button">
          Help me set it up
        </button>
        <p className="neo-success-hint">
          Our support team can chat or get on a call with you and get everything sorted out.
        </p>

        <button className="neo-success-secondary" type="button">
          I’ll setup myself
        </button>
        <p className="neo-success-hint">
          We’ll provide instructions to add <strong>DNS records</strong>
        </p>
      </div>

      <button className="neo-need-help" type="button">
        <span className="neo-need-help-dot" aria-hidden="true" />
        Need help?
      </button>
    </div>
  );
}
