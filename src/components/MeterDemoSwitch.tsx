import type { MeterVariant } from "./NarrowingMeter";
import { METER_VARIANTS } from "./NarrowingMeter";

/**
 * Review-only control. Lets someone compare meter copy without a rebuild.
 * Not a product setting — remove once a treatment is chosen.
 */
export default function MeterDemoSwitch({
  value,
  onChange,
}: {
  value: MeterVariant;
  onChange: (next: MeterVariant) => void;
}) {
  const active = METER_VARIANTS.find((v) => v.id === value);

  return (
    <div className="meter-demo">
      <p className="meter-demo-kicker">Meter demo — pick a treatment</p>
      <div className="meter-demo-row" role="tablist" aria-label="Meter treatment">
        {METER_VARIANTS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={v.id === value}
            className={`meter-demo-chip${v.id === value ? " is-on" : ""}`}
            onClick={() => onChange(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>
      {active ? <p className="meter-demo-hint">{active.hint}</p> : null}
    </div>
  );
}
