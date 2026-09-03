import { CHECKOUT_ACCOUNT } from "../lib/checkout";

/**
 * Neo's own checkout chrome — logo + the signed-in account.
 *
 * This is a likeness of their header, not Find My Neo's wordmark: the Claim path
 * stays inside our app but has to read as their checkout. The account is fixed
 * to Moin F for this demo; do not put a leftover staging name here.
 */
export function NeoMark({ className = "neo-mark" }: { className?: string }) {
  return (
    <div className={className} aria-label="neo">
      <svg className="neo-mark-n" viewBox="0 0 36 36" width="28" height="28" aria-hidden="true">
        <path
          d="M6.2 29.4c0-9.8 0-16.4 0-22.6 0-1.4.9-2.3 2.2-2.3 1 0 1.7.4 2.6 1.5l11.2 14.2c.3.4.6.4.6-.2V7c0-1.5.8-2.5 2.2-2.5 1.4 0 2.3 1 2.3 2.5v22.4c0 1.5-.9 2.5-2.3 2.5-1 0-1.8-.5-2.6-1.6L11.2 16c-.3-.4-.6-.4-.6.3v12.6c0 1.5-.9 2.5-2.2 2.5-1.4 0-2.2-1-2.2-2z"
          fill="#1a73e8"
        />
        <path
          d="M20.4 6.4c2.8 3.6 7.2 9.4 10.6 13.8 1.2 1.6.4 3.4-1.6 3.4-1.1 0-2-.5-2.9-1.7L16.2 8.6c-1.1-1.5-.3-3.2 1.6-3.2 1 0 1.8.3 2.6 1z"
          fill="#f5a623"
        />
        <path
          d="M8.4 5.2c1.2 0 2 .5 2.8 1.6L22.2 20.8c.4.6.8.5.8-.2V7.2c0-1.2.6-2 1.7-2 .4 0 .8.1 1.1.4-1.2-1.6-2.4-2.4-4.1-2.4-1.3 0-2.3.5-3.2 1.6L8.8 17.2c-.2.2-.4.1-.4-.2V7.2c0-1.2.6-2 1.8-2.1.1 0 .2 0 .2 0z"
          fill="#2b7cff"
          opacity="0.95"
        />
      </svg>
      <span className="neo-mark-word">neo</span>
    </div>
  );
}

export function NeoAccount() {
  return (
    <div className="neo-account" title={CHECKOUT_ACCOUNT.name}>
      <span className="neo-avatar" aria-hidden="true">
        {CHECKOUT_ACCOUNT.initial}
      </span>
      <span className="neo-account-name">{CHECKOUT_ACCOUNT.name}</span>
      <span className="neo-account-caret" aria-hidden="true">
        ▾
      </span>
    </div>
  );
}

export function NeoHeader() {
  return (
    <header className="neo-header">
      <NeoMark />
      <NeoAccount />
    </header>
  );
}
