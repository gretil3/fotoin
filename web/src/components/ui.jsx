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

/** Turns a catalog style's background definition into an inline CSS value. */
export function swatchStyle(background) {
  if (!background) return { background: '#eee' };
  const [from, to] = background.colors;
  return background.type === 'gradient' && to
    ? { backgroundImage: `linear-gradient(160deg, ${from}, ${to})` }
    : { background: from };
}
