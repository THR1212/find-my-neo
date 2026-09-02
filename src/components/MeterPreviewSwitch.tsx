import type { MeterVariant } from "./NarrowingMeter";
import { METER_VARIANTS } from "./NarrowingMeter";

/** Team-only compare. Remove once a treatment is chosen. */
export default function MeterPreviewSwitch({
  value,
  onChange,
}: {
  value: MeterVariant;
  onChange: (next: MeterVariant) => void;
}) {
  const active = METER_VARIANTS.find((v) => v.id === value);

  return (
    <div className="meter-demo">
      <p className="meter-demo-kicker">Team preview — Numbers shows 5,318 on the pill</p>
      <div className="meter-demo-row" role="tablist" aria-label="Meter treatments">
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
