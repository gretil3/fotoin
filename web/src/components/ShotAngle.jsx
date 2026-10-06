// "Foto diambil dari mana?" on the upload step. The answer picks the shadow in
// the result (standing on a floor vs. lying flat), so the tips sit next to it:
// a photo taken at ~45° fits neither and is the most common reshoot.
// Labels come from the catalog's `angle` brief question; drawings and tips are
// presentation only. Tips follow pipeline/PANDUAN_FOTO.md.

const TIPS = {
  depan: [
    'HP sejajar dengan bagian tengah produk, jarak ±30 cm.',
    'Cocok untuk botol, gelas, kotak, toples.',
  ],
  atas: [
    'HP tegak lurus tepat di atas produk.',
    'Cocok untuk produk pipih: dompet, pouch, kosmetik, makanan di piring.',
  ],
};

const SHARED_TIPS = [
  'Jangan miring ±45° dari atas: hasilnya akan terlihat aneh.',
  'Foto dekat jendela di siang hari, lampu kuning dimatikan.',
  'Alasi kertas putih. Produk harus terlihat utuh, tidak terpotong.',
];

const Phone = ({ x, y, rotate }) => (
  <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
    <rect x="-9" y="-16" width="18" height="32" rx="3.5" fill="var(--ink-900)" />
    <rect x="-6.5" y="-12.5" width="13" height="23" rx="1.5" fill="#b8e6bf" />
  </g>
);

function Drawing({ angle }) {
  return (
    <svg viewBox="0 0 160 100" className="shot-angle__drawing" aria-hidden="true">
      <line x1="10" y1="82" x2="150" y2="82" stroke="var(--line-strong)" strokeWidth="2" />
      {angle === 'atas' ? (
        <>
          <rect x="62" y="74" width="40" height="8" rx="2" fill="var(--brand-500)" />
          <line x1="82" y1="34" x2="82" y2="70" stroke="var(--ink-300)" strokeWidth="1.5" strokeDasharray="3 3" />
          <Phone x={82} y={20} rotate={90} />
        </>
      ) : (
        <>
          <rect x="88" y="46" width="26" height="36" rx="4" fill="var(--brand-500)" />
          <line x1="44" y1="64" x2="84" y2="64" stroke="var(--ink-300)" strokeWidth="1.5" strokeDasharray="3 3" />
          <Phone x={32} y={64} rotate={0} />
        </>
      )}
    </svg>
  );
}

export default function ShotAngle({ question, value, onChange }) {
  if (!question) return null;
  return (
    <div className="shot-angle">
      <div className="brief-question__label">
        <span>{question.label}</span>
        <span className="small muted" style={{ fontWeight: 400 }}>
          Menentukan bayangan di hasil foto
        </span>
      </div>
      <div className="grid shot-angle__options">
        {question.options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="option"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
          >
            <Drawing angle={option.id} />
            <div className="option__name">{option.label}</div>
            <ul className="option__desc shot-angle__tips">
              {(TIPS[option.id] || []).map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </button>
        ))}
      </div>
      <ul className="small muted shot-angle__tips">
        {SHARED_TIPS.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </div>
  );
}
