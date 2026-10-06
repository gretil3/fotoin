import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { rupiah } from '../lib/format.js';
import ShotAngle from '../components/ShotAngle.jsx';
import UploadDropzone from '../components/UploadDropzone.jsx';
import {
  Alert,
  ChoiceChips,
  LoadingState,
  OptionTile,
  Spinner,
  Stepper,
  swatchStyle,
} from '../components/ui.jsx';

// Three steps, one decision each. Everything with a sensible default (style,
// brief, story) is folded away under "Atur sendiri", so a seller who is not
// comfortable with forms can tap straight through.
const STEPS = ['Foto', 'Jenis Produk', 'Bayar'];

const NOTES_MAX = 500;

// Tap to add a ready-made sentence to the story box, for sellers facing an
// empty text field. Plain Bahasa for the reviewer; they are not prompts.
const STORY_PHRASES = [
  'Warna kemasan jangan diubah.',
  'Tulisan di label harus terbaca jelas.',
  'Tampilkan produk dari depan.',
  'Latar jangan terlalu ramai.',
  'Tanpa orang atau tangan di foto.',
];

/** Every brief question at its default, so tapping straight through is valid. */
const briefDefaults = (questions) =>
  Object.fromEntries(
    questions.map((question) => [
      question.id,
      Array.isArray(question.default) ? [...question.default] : question.default,
    ]),
  );

const questionHint = (question) => {
  if (question.type === 'single') return 'Pilih satu';
  if (question.max) return `Maks. ${question.max} · kosongkan = serahkan ke kami`;
  return 'Boleh lebih dari satu';
};

const emptyForm = {
  sellerName: '',
  whatsapp: '',
  storeName: '',
  productName: '',
  categoryId: '',
  styleIds: [],
  marketplaceIds: [],
  packId: 'standar',
  notes: '',
  briefAnswers: {},
  paymentMethodId: 'qris',
};

export default function CreateOrderPage() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .catalog()
      .then((data) => {
        if (cancelled) return;
        setCatalog(data);
        setForm((prev) => ({ ...prev, briefAnswers: briefDefaults(data.briefQuestions || []) }));
      })
      .catch((err) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const pack = useMemo(
    () => catalog?.packs.find((item) => item.id === form.packId) || null,
    [catalog, form.packId],
  );
  const category = useMemo(
    () => catalog?.categories.find((item) => item.id === form.categoryId) || null,
    [catalog, form.categoryId],
  );
  // "Produk ini apa?" takes its options from the chosen category.
  const briefQuestions = useMemo(
    () =>
      (catalog?.briefQuestions || []).map((question) =>
        question.perCategory ? { ...question, options: category?.productTypes || [] } : question,
      ),
    [catalog, category],
  );

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const answer = (questionId, value) =>
    setForm((prev) => ({ ...prev, briefAnswers: { ...prev.briefAnswers, [questionId]: value } }));

  // A phrase chip adds its sentence to the story, or takes it back out.
  const togglePhrase = (phrase) => {
    const current = form.notes.trim();
    if (current.includes(phrase)) {
      set({ notes: current.replace(phrase, '').replace(/\s{2,}/g, ' ').trim() });
      return;
    }
    const next = current ? `${current} ${phrase}` : phrase;
    if (next.length <= NOTES_MAX) set({ notes: next });
  };

  const toggle = (key, value, max) => {
    const current = form[key];
    if (current.includes(value)) {
      set({ [key]: current.filter((item) => item !== value) });
    } else if (current.length < max) {
      set({ [key]: [...current, value] });
    }
  };

  // Changing category invalidates style picks (styles are category-scoped).
  const pickCategory = (categoryId) => {
    if (categoryId === form.categoryId) return;
    const next = catalog.categories.find((item) => item.id === categoryId);
    const defaultStyle = next.styles.find((style) => style.default)?.id;
    setForm((prev) => ({
      ...prev,
      categoryId,
      styleIds: defaultStyle ? [defaultStyle] : [],
      // Product types are category-scoped too.
      briefAnswers: { ...prev.briefAnswers, productType: null },
    }));
  };

  // Lowering the pack trims selections that no longer fit.
  const pickPack = (packId) => {
    const next = catalog.packs.find((item) => item.id === packId);
    set({
      packId,
      styleIds: form.styleIds.slice(0, next.maxStyles),
      marketplaceIds: form.marketplaceIds.slice(0, next.maxMarketplaces),
    });
  };

  const stepValid = [
    files.length > 0 && form.productName.trim().length >= 2,
    Boolean(form.categoryId) && form.styleIds.length > 0 && form.marketplaceIds.length > 0,
    form.sellerName.trim().length >= 2 && form.whatsapp.replace(/\D/g, '').length >= 9,
  ][step];

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { photos } = await api.uploadPhotos(files);
      const { briefAnswers, ...fields } = form;
      const { order } = await api.createOrder({ ...fields, brief: { answers: briefAnswers }, photos });
      try {
        // So "Pesanan Saya" can show this seller's orders without asking again.
        localStorage.setItem('fotoin:whatsapp', form.whatsapp.trim());
      } catch {
        /* private mode: they can type the number on the orders page */
      }
      navigate(`/pesanan/${order.id}`, { state: { justCreated: true } });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="container">
        <Alert tone="error">
          Tidak bisa memuat katalog: {loadError}. Pastikan server API berjalan di port 4000.
        </Alert>
      </div>
    );
  }
  if (!catalog) return <LoadingState label="Menyiapkan pilihan..." />;

  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <h1>Buat Pesanan</h1>
      <p className="muted">
Cukup 3 langkah. Tinggal foto, pilih, bayar.</p>

      <Stepper steps={STEPS} current={step} />
      {error && <Alert tone="error">{error}</Alert>}

      <div className="card">
        {step === 0 && (
          <>
            <h3>1. Foto produkmu</h3>
            <p className="small muted">Pakai foto dari HP, apa adanya.</p>
            <ShotAngle
              question={briefQuestions.find((question) => question.id === 'angle')}
              value={form.briefAnswers.angle}
              onChange={(value) => answer('angle', value)}
            />
            <UploadDropzone
              files={files}
              onChange={setFiles}
              maxFiles={catalog.limits.maxFiles}
              maxSizeMb={catalog.limits.maxSizeMb}
            />
            <div className="field" style={{ marginTop: 20 }}>
              <label htmlFor="productName">Nama produk</label>
              <input
                id="productName"
                className="input"
                placeholder="Contoh: Rendang Frozen 500gr"
                value={form.productName}
                onChange={(event) => set({ productName: event.target.value })}
              />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h3>2. Produkmu apa?</h3>
            <div className="grid grid-4" style={{ marginBottom: 24 }}>
              {catalog.categories.map((item) => (
                <OptionTile
                  key={item.id}
                  name={item.name}
                  description={item.description}
                  selected={form.categoryId === item.id}
                  onClick={() => pickCategory(item.id)}
                />
              ))}
            </div>

            {category && (
              <>
                <h3>Mau jualan di mana?</h3>
                <p className="small muted">
                  Ukuran foto kami sesuaikan. Boleh pilih sampai {pack.maxMarketplaces}.
                </p>
                <div className="grid grid-2" style={{ marginBottom: 24 }}>
                  {catalog.marketplaces.map((market) => {
                    const selected = form.marketplaceIds.includes(market.id);
                    return (
                      <OptionTile
                        key={market.id}
                        name={market.name}
                        swatch={{ background: market.color, height: 8 }}
                        selected={selected}
                        disabled={!selected && form.marketplaceIds.length >= pack.maxMarketplaces}
                        onClick={() => toggle('marketplaceIds', market.id, pack.maxMarketplaces)}
                      />
                    );
                  })}
                </div>

                <div className="faq">
                  <details>
                    <summary>Atur sendiri gaya &amp; detail foto (tidak wajib)</summary>
                    <p className="small muted">
                      Kalau dilewati, kami pilihkan yang paling cocok untuk produkmu.
                    </p>

                    <div className="row row-between" style={{ margin: '16px 0 10px' }}>
                      <strong>Gaya foto</strong>
                      <span className="small muted">
                        {form.styleIds.length}/{pack.maxStyles} dipilih ({pack.name})
                      </span>
                    </div>
                    <div className="grid grid-3" style={{ marginBottom: 24 }}>
                      {category.styles.map((style) => {
                        const selected = form.styleIds.includes(style.id);
                        return (
                          <OptionTile
                            key={style.id}
                            name={style.name}
                            description={style.description}
                            swatch={swatchStyle(style.background)}
                            selected={selected}
                            disabled={!selected && form.styleIds.length >= pack.maxStyles}
                            onClick={() => toggle('styleIds', style.id, pack.maxStyles)}
                          />
                        );
                      })}
                    </div>

                    {/* The shooting angle is asked on the upload step, next to its tips. */}
                    {briefQuestions.filter((question) => question.id !== 'angle').map((question) => (
                      <div className="brief-question" key={question.id}>
                        <div className="brief-question__label">
                          <span>{question.label}</span>
                          <span className="small muted" style={{ fontWeight: 400 }}>
                            {questionHint(question)}
                          </span>
                        </div>
                        <ChoiceChips
                          label={question.label}
                          options={question.options || []}
                          multi={question.type === 'multi'}
                          max={question.max}
                          value={form.briefAnswers[question.id]}
                          onChange={(value) => answer(question.id, value)}
                        />
                      </div>
                    ))}

                    <div className="field" style={{ marginBottom: 10 }}>
                      <label htmlFor="notes">Ada pesan untuk kami?</label>
                      <textarea
                        id="notes"
                        className="textarea"
                        maxLength={NOTES_MAX}
                        placeholder='Contoh: Warna kemasan merah jangan diubah, tulisan "Halal" harus terbaca.'
                        value={form.notes}
                        onChange={(event) => set({ notes: event.target.value })}
                      />
                      <div className="char-count">
                        {form.notes.length}/{NOTES_MAX}
                      </div>
                    </div>
                    <div className="choices" role="group" aria-label="Kalimat cepat untuk pesan">
                      {STORY_PHRASES.map((phrase) => (
                        <button
                          key={phrase}
                          type="button"
                          className="choice choice--add"
                          aria-pressed={form.notes.includes(phrase)}
                          onClick={() => togglePhrase(phrase)}
                        >
                          {form.notes.includes(phrase) ? '✓' : '+'} {phrase}
                        </button>
                      ))}
                    </div>
                  </details>
                </div>
              </>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h3>3. Pilih paket</h3>
            <div className="grid grid-3" style={{ marginBottom: 24 }}>
              {catalog.packs.map((item) => (
                <OptionTile
                  key={item.id}
                  name={`${item.name}${item.popular ? ' - Terlaris' : ''}`}
                  description={`${rupiah(item.priceIdr)} - ${item.photoCount} foto, selesai ~${item.turnaroundHours} jam`}
                  selected={form.packId === item.id}
                  onClick={() => pickPack(item.id)}
                />
              ))}
            </div>

            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="sellerName">Nama kamu</label>
                <input
                  id="sellerName"
                  className="input"
                  placeholder="Contoh: Ibu Sari"
                  value={form.sellerName}
                  onChange={(event) => set({ sellerName: event.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="whatsapp">Nomor WhatsApp</label>
                <input
                  id="whatsapp"
                  className="input"
                  placeholder="08xxxxxxxxxx"
                  inputMode="tel"
                  value={form.whatsapp}
                  onChange={(event) => set({ whatsapp: event.target.value })}
                />
                <div className="hint">Foto jadi dikirim ke WhatsApp ini.</div>
              </div>
            </div>

            <div className="summary">
              <div className="row row-between">
                <div>
                  <strong>{pack.name}</strong>
                  <div className="small muted">Bayar pakai QRIS: bisa dari bank atau e-wallet apa pun.</div>
                </div>
                <div className="summary__price">{rupiah(pack.priceIdr)}</div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="wizard-nav">
        <button
          type="button"
          className="btn btn--ghost"
          disabled={step === 0 || submitting}
          onClick={() => setStep((value) => value - 1)}
        >
          Kembali
        </button>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="btn btn--primary"
            disabled={!stepValid}
            onClick={() => setStep((value) => value + 1)}
          >
            Lanjut
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary btn--lg"
            disabled={!stepValid || submitting}
            onClick={submit}
          >
            {submitting ? <Spinner /> : null}
            {submitting ? 'Mengirim...' : `Buat Pesanan · ${rupiah(pack.priceIdr)}`}
          </button>
        )}
      </div>
    </div>
  );
}
