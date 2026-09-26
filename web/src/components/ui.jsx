import { statusTone } from '../lib/format.js';
import Icon from './Icon.jsx';

export function StatusBadge({ status, label }) {
  return <span className={`badge badge--${statusTone(status)}`}>{label || status}</span>;
}

export function Stepper({ steps, current }) {
  return (
    <>
      <ol className="stepper">
        {steps.map((step, index) => {
          const state = index === current ? 'is-active' : index < current ? 'is-done' : '';
          return (
            <li key={step} className={`step ${state}`} aria-current={index === current ? 'step' : undefined}>
              <span className="step__num">
                {index < current ? <Icon name="check" size={14} strokeWidth={2.6} /> : index + 1}
              </span>
              {step}
            </li>
          );
        })}
      </ol>
      <div className="stepper-compact">
        <div className="stepper-compact__label">
          <strong>{steps[current]}</strong>
          <span className="muted">
            Langkah {current + 1} dari {steps.length}
          </span>
        </div>
        <div className="progress">
          <div className="progress__bar" style={{ width: `${((current + 1) / steps.length) * 100}%` }} />
        </div>
      </div>
    </>
  );
}

export function Alert({ tone = 'info', children }) {
  if (!children) return null;
  return <div className={`alert alert--${tone}`}>{children}</div>;
}

export function Spinner({ ink = false }) {
  return <span className={`spinner${ink ? ' spinner--ink' : ''}`} aria-hidden="true" />;
}

export function LoadingState({ label = 'Memuat...' }) {
  return (
    <div className="empty">
      <Spinner ink />
      <div style={{ marginTop: 10 }}>{label}</div>
    </div>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

/** Selectable tile used for styles, marketplaces and categories. */
export function OptionTile({ selected, disabled, onClick, swatch, name, description, meta }) {
  return (
    <button
      type="button"
      className="option"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      {swatch && <div className="swatch" style={swatch} />}
      <div className="option__name">{name}</div>
      {description && <div className="option__desc">{description}</div>}
      {meta && (
        <div className="small muted" style={{ marginTop: 6 }}>
          {meta}
        </div>
      )}
    </button>
  );
}

/**
 * Tap-to-answer chips for a brief question. `value` is an option id (single)
 * or an array of ids (multi). Single behaves like a radio group; multi stops
 * accepting new picks once `max` is reached.
 */
export function ChoiceChips({ options, value, multi = false, max, onChange, label }) {
  const selected = multi ? value || [] : value ? [value] : [];
  const full = multi && max ? selected.length >= max : false;

  const toggle = (id) => {
    if (!multi) return onChange(id);
    if (selected.includes(id)) return onChange(selected.filter((item) => item !== id));
    if (!full) onChange([...selected, id]);
  };

  return (
    <div className="choices" role="group" aria-label={label}>
      {options.map((option) => {
        const isOn = selected.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            className="choice"
            aria-pressed={isOn}
            disabled={!isOn && full}
            onClick={() => toggle(option.id)}
          >
            {isOn && <Icon name="check" size={14} strokeWidth={2.6} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Turns a catalog style's background definition into an inline CSS value. */
export function swatchStyle(background) {
  if (!background) return { background: '#eee' };
  const [from, to] = background.colors;
  return background.type === 'gradient' && to
    ? { backgroundImage: `linear-gradient(160deg, ${from}, ${to})` }
    : { background: from };
}
