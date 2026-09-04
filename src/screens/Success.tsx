import { useState } from "react";
import { NeoHeader } from "../components/NeoChrome";
import { adminMailbox, orderIsReady, type CheckoutOrder } from "../lib/checkout";
import { isCoSite } from "../lib/domains";

export default function Success({
  order,
  onBack,
  onRestart,
}: {
  order: CheckoutOrder | null;
  onBack: () => void;
  /**
   * The way out, and it has to exist here.
   *
   * Every other control on this screen is a deliberate mock of Neo's — "Help me set it up",
   * "I'll setup myself", "Need help?" — and none of them does anything. That is fine as
   * mimicry right up until this is the LAST screen, at which point a run that finished had no
   * exit at all: no Back (that lives on Checkout), no restart, and a reload restored straight
   * back onto it. The only escape was clearing session storage or opening a new tab.
   */
  onRestart: () => void;
}) {
  const ready = orderIsReady(order);
  const admin = ready ? adminMailbox(order) : null;
  const [shareNote, setShareNote] = useState(false);

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
          <button className="btn btn-ghost" type="button" onClick={onRestart}>
            Start over
          </button>
        </div>
      </div>
    );
  }

  if (isCoSite(order.domain)) {
    return (
      <div className="neo-funnel neo-success neo-success-mailbox">
        <NeoHeader />
        <div className="neo-success-mailbox-main">
          <div className="neo-success-check" aria-hidden="true">
            <svg viewBox="0 0 88 88" width="88" height="88">
              <circle cx="44" cy="44" r="44" fill="#0066ff" />
              <path
                d="M25 45.5l12.5 12.5 26-28"
                fill="none"
                stroke="#fff"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1>Congratulations!</h1>
          <a className="neo-success-mail" href={`mailto:${admin.address}`}>
            {admin.address}
          </a>
          <p className="neo-success-ready">Your mailbox is now ready for you!</p>
          <button className="neo-success-primary" type="button">
            Go to your webmail
          </button>
          <button
            className="neo-success-share"
            type="button"
            onClick={() => setShareNote(true)}
          >
            Share login info with your team members
          </button>
          {shareNote && (
            <p className="neo-success-share-note">Login details stay on this page for the demo.</p>
          )}
        </div>

        {/* Same exit as the other terminal branch — this one is reached on a `.co.site`
            order, and a run that ends here needs a way out just as much. */}
        <button className="neo-start-again" type="button" onClick={onRestart}>
          Start over
        </button>
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

      {/* Ours, not Neo's — kept quiet and below their chrome so it does not read as part of
          their page, but present, because this is where a demo ends and the next one starts. */}
      <button className="neo-start-again" type="button" onClick={onRestart}>
        Start over
      </button>
    </div>
  );
}
