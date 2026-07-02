interface SettingStepperProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  formatValue?: (value: number) => string
  onChange: (value: number) => void
}

function clampStep(value: number, min: number, max: number, step: number): number {
  const stepped = Math.round(value / step) * step
  const fixed = Number(stepped.toFixed(4))
  return Math.min(max, Math.max(min, fixed))
}

export function SettingStepper({
  label,
  value,
  min,
  max,
  step = 1,
  formatValue = (v) => String(v),
  onChange,
}: SettingStepperProps) {
  const canDecrease = value > min + step / 2
  const canIncrease = value < max - step / 2

  function adjust(delta: number) {
    onChange(clampStep(value + delta, min, max, step))
  }

  return (
    <div className="reader-setting-stepper">
      <span className="reader-setting-stepper-label">{label}</span>
      <div className="reader-setting-stepper-controls">
        <button
          type="button"
          className="reader-setting-stepper-btn"
          aria-label={`减少 ${label}`}
          disabled={!canDecrease}
          onClick={() => adjust(-step)}
        >
          −
        </button>
        <span className="reader-setting-stepper-value">{formatValue(value)}</span>
        <button
          type="button"
          className="reader-setting-stepper-btn"
          aria-label={`增加 ${label}`}
          disabled={!canIncrease}
          onClick={() => adjust(step)}
        >
          +
        </button>
      </div>
    </div>
  )
}
