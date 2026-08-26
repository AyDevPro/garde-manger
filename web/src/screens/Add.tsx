import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Chip, Eyebrow, Row, Spinner, Thumb } from '../components/ui';
import { Switch } from './Detail';
import { useResource } from '../hooks';
import { api } from '../lib/api';
import { DATE_TYPE_LABEL, addDaysIso, frDate, todayIso } from '../lib/format';
import { useStore } from '../store';
import type { DateType, Draft, RecentProduct } from '../types';

const DATE_TYPES: DateType[] = ['DLC', 'DDM', 'EXP'];

const emptyDraft = (locationId: string | null): Draft => ({
  name: '', brand: null, barcode: null, imageUrl: null, packageText: null,
  categoryId: null, locationId, qty: 1, unit: 'unités', dateType: 'DLC',
  bestBefore: null, lotCode: null, daysAfterOpening: null,
  isMedicine: false, dosage: null, medForm: null, notes: null,
});

export function AddProduct() {
  const nav = useNavigate();
  const { draft, setDraft, locations, categories, run, touch, showToast } = useStore();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Arrivée directe par « + » : brouillon vierge, rangé par défaut au frigo.
  // Les emplacements arrivent parfois après le premier rendu (ouverture directe
  // de l'URL) : on complète alors le brouillon plutôt que de le laisser vide.
  useEffect(() => {
    const fallback = locations.find((l) => l.kind === 'frigo')?.id ?? locations[0]?.id ?? null;
    if (!draft) setDraft(emptyDraft(fallback));
    else if (!draft.locationId && fallback) setDraft({ ...draft, locationId: fallback });
  }, [draft, locations, setDraft]);

  const { data: recents } = useResource<RecentProduct[]>(draft && !draft.name && !draft.barcode ? '/recent-products' : null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));

  const tracked = draft?.dateType !== 'NONE';
  const title = draft?.batchId ? 'Modifier le produit'
    : draft?.recognizedFrom ? 'Produit reconnu'
    : draft?.barcode ? 'Nouveau produit'
    : 'Ajout manuel';

  const dateShortcuts = useMemo(() => ([
    { label: "Aujourd'hui", iso: todayIso() },
    { label: 'Dans 3 j', iso: addDaysIso(3) },
    { label: 'Dans 1 semaine', iso: addDaysIso(7) },
    { label: 'Dans 1 mois', iso: addDaysIso(30) },
  ]), []);

  if (!draft) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 100 }}><Spinner /></div>;

  async function pickPhoto(file: File) {
    setUploading(true);
    try {
      const dataUrl = await shrinkImage(file);
      const r = await run(() => api.post<{ url: string }>('/uploads', { dataUrl }));
      if (r) set('imageUrl', r.url);
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (saving) return;
    const name = draft!.name.trim();
    if (!name) { showToast('Donnez un nom au produit'); return; }
    setSaving(true);

    const productFields = {
      name,
      brand: draft!.brand || null,
      barcode: draft!.barcode || null,
      categoryId: draft!.categoryId,
      imageUrl: draft!.imageUrl,
      packageText: draft!.packageText,
      defaultUnit: draft!.unit,
      isMedicine: draft!.isMedicine,
      dosage: draft!.dosage,
      medForm: draft!.medForm,
      daysAfterOpening: draft!.daysAfterOpening,
      notes: draft!.notes,
    };
    const batchFields = {
      locationId: draft!.locationId,
      qty: draft!.qty,
      unit: draft!.unit,
      dateType: draft!.dateType,
      bestBefore: draft!.dateType === 'NONE' ? null : draft!.bestBefore,
      lotCode: draft!.lotCode,
    };

    let ok: unknown;
    if (draft!.batchId && draft!.productId) {
      ok = await run(async () => {
        await api.patch(`/products/${draft!.productId}`, productFields);
        return api.patch(`/batches/${draft!.batchId}`, batchFields);
      });
    } else if (draft!.productId) {
      ok = await run(() => api.post('/batches', { productId: draft!.productId, ...batchFields }));
    } else {
      ok = await run(() => api.post('/products', { ...productFields, batch: batchFields }));
    }
    setSaving(false);
    if (!ok) return;

    touch();
    const where = locations.find((l) => l.id === draft!.locationId)?.name;
    showToast(draft!.batchId ? `${name} mis à jour` : `${name} rangé au ${where ?? 'stock'}`);
    const wasEdit = Boolean(draft!.batchId);
    setDraft(null);
    if (wasEdit) nav(-1);
    else nav('/');
  }

  return (
    <div
      className="scroll"
      style={{
        height: '100%',
        padding: `calc(var(--safe-top) + 14px) 18px calc(var(--safe-bottom) + 40px)`,
        maxWidth: 520, margin: '0 auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <button
          type="button"
          onClick={() => { setDraft(null); nav(-1); }}
          style={{ padding: '10px 18px', borderRadius: 999, border: 'none', background: 'rgba(255,255,255,.12)', color: '#fff', font: '500 15px/1 var(--sans)' }}
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={() => nav('/scanner')}
          aria-label="Scanner un code‑barres"
          style={{
            width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span style={{ width: 18, height: 16, borderLeft: '2px solid #fff', borderRight: '2px solid #fff', display: 'flex', justifyContent: 'center', gap: 2 }}>
            <span style={{ width: 2, background: '#fff' }} />
            <span style={{ width: 2, background: '#fff' }} />
          </span>
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            padding: '10px 18px', borderRadius: 999, border: 'none', background: 'var(--accent)',
            color: 'var(--on-accent)', font: '600 15px/1 var(--sans)', opacity: saving ? .6 : 1,
          }}
        >
          {saving ? '…' : 'Sauvegarder'}
        </button>
      </div>

      <div style={{ fontSize: 13, color: 'var(--fg-3)', margin: '14px 2px 0' }}>
        {title} · {draft.brand || 'marque à préciser'} · {draft.barcode || 'sans code'}
      </div>

      {recents && recents.length > 0 && (
        <>
          <Eyebrow style={{ margin: '18px 2px 9px' }}>Déjà achetés</Eyebrow>
          <div className="hscroll" style={{ display: 'flex', gap: 8 }}>
            {recents.slice(0, 12).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setDraft((d) => ({
                  ...(d ?? emptyDraft(null)),
                  productId: p.id, name: p.name, brand: p.brand, barcode: p.barcode,
                  imageUrl: p.imageUrl, unit: p.defaultUnit, categoryId: p.categoryId,
                  daysAfterOpening: p.daysAfterOpening, isMedicine: p.isMedicine,
                }))}
                style={{
                  flex: 'none', width: 96, padding: 10, borderRadius: 16, border: 'none',
                  background: 'var(--card)', color: 'inherit', textAlign: 'left',
                }}
              >
                <Thumb name={p.name} src={p.imageUrl} size={40} />
                <span className="ellipsis" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginTop: 8 }}>
                  {p.name}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        style={{
          marginTop: 20, width: '100%', height: 132, borderRadius: 20, border: 'none',
          background: draft.imageUrl ? '#000' : 'var(--card-hi)', color: 'inherit',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 10, overflow: 'hidden', padding: 0,
        }}
      >
        {uploading ? <Spinner /> : draft.imageUrl ? (
          <img src={draft.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        ) : (
          <>
            <span style={{ width: 34, height: 28, border: '2px solid rgba(235,235,245,.5)', borderRadius: 6, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 5, bottom: 4, width: 8, height: 8, borderRadius: '50%', background: 'rgba(235,235,245,.5)' }} />
            </span>
            <span style={{ fontSize: 14, color: 'var(--fg-2)' }}>Appuyez pour ajouter une image</span>
          </>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) pickPhoto(f); e.target.value = ''; }}
      />
      {draft.imageUrl && (
        <button
          type="button"
          onClick={() => set('imageUrl', null)}
          style={{ background: 'none', border: 'none', color: 'var(--fg-3)', fontSize: 13, marginTop: 8, padding: 0 }}
        >
          Retirer la photo
        </button>
      )}

      <Card style={{ marginTop: 20, borderRadius: 20 }}>
        <Field label="Nom" value={draft.name} onChange={(v) => set('name', v)} placeholder="Nom du produit" autoFocus={!draft.name} />
        <Field label="Marque" value={draft.brand ?? ''} onChange={(v) => set('brand', v || null)} placeholder="Facultatif" last />
      </Card>

      <Eyebrow style={{ margin: '20px 2px 9px' }}>Emplacement</Eyebrow>
      <div className="hscroll" style={{ display: 'flex', gap: 7 }}>
        {locations.map((l) => (
          <Chip key={l.id} label={l.name} active={draft.locationId === l.id} onClick={() => set('locationId', l.id)} />
        ))}
      </div>

      <Eyebrow style={{ margin: '20px 2px 9px' }}>Catégorie</Eyebrow>
      <div className="hscroll" style={{ display: 'flex', gap: 7 }}>
        {categories.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            active={draft.categoryId === c.id}
            onClick={() => setDraft((d) => d && ({ ...d, categoryId: c.id, isMedicine: c.isMedicine }))}
          />
        ))}
      </div>

      <Card style={{ marginTop: 20, borderRadius: 20 }}>
        <Row label="Suivi d’expiration" last={!tracked}>
          <Switch
            on={tracked}
            onToggle={() => setDraft((d) => d && ({
              ...d,
              dateType: tracked ? 'NONE' : 'DLC',
              bestBefore: tracked ? null : (d.bestBefore ?? addDaysIso(7)),
            }))}
          />
        </Row>
        {tracked && (
          <>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '15px 17px', borderBottom: '1px solid var(--line)' }}>
              <span style={{ fontSize: 16.5 }}>Date</span>
              <input
                type="date"
                value={draft.bestBefore ?? ''}
                onChange={(e) => set('bestBefore', e.target.value || null)}
                style={{
                  background: 'var(--card-2)', border: 'none', borderRadius: 11, padding: '8px 13px',
                  font: '500 15px/1 var(--mono)', color: 'var(--fg)',
                }}
              />
            </label>
            <Row label="Type de date" value={DATE_TYPE_LABEL[draft.dateType]} last />
          </>
        )}
      </Card>

      {tracked && (
        <>
          <div className="hscroll" style={{ display: 'flex', gap: 7, marginTop: 10 }}>
            {dateShortcuts.map((s) => (
              <Chip key={s.label} label={s.label} active={draft.bestBefore === s.iso} onClick={() => set('bestBefore', s.iso)} />
            ))}
            <Chip label="Scanner la date" onClick={() => nav('/scanner-date')} />
          </div>
          <div className="hscroll" style={{ display: 'flex', gap: 7, marginTop: 8 }}>
            {DATE_TYPES.map((t) => (
              <Chip key={t} label={t} active={draft.dateType === t} onClick={() => set('dateType', t)} />
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--fg-4)', margin: '10px 2px 0' }}>
            {draft.bestBefore ? `${DATE_TYPE_LABEL[draft.dateType]} ${frDate(draft.bestBefore)}` : 'Aucune date choisie.'}
          </div>
        </>
      )}

      <Card style={{ marginTop: 20, borderRadius: 20 }}>
        <Row label="Quantité" last={false}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--card-2)', borderRadius: 12, padding: 4 }}>
            <StepButton onClick={() => set('qty', Math.max(0, Number((draft.qty - 1).toFixed(2))))}>−</StepButton>
            <span className="mono" style={{ minWidth: 44, textAlign: 'center', font: '700 18px/1 var(--mono)' }}>{draft.qty}</span>
            <StepButton accent onClick={() => set('qty', Number((draft.qty + 1).toFixed(2)))}>+</StepButton>
          </span>
        </Row>
        <Field label="Unité" value={draft.unit} onChange={(v) => set('unit', v)} placeholder="pots, boîtes…" />
        <Field label="Conditionnement" value={draft.packageText ?? ''} onChange={(v) => set('packageText', v || null)} placeholder="250 g" />
        <Field label="Code‑barres" value={draft.barcode ?? ''} onChange={(v) => set('barcode', v.replace(/\D/g, '') || null)} placeholder="Facultatif" mono />
        <Field label="Lot" value={draft.lotCode ?? ''} onChange={(v) => set('lotCode', v || null)} placeholder="Facultatif" mono last={!tracked} />
        {tracked && (
          <Field
            label="Après ouverture"
            value={draft.daysAfterOpening === null ? '' : String(draft.daysAfterOpening)}
            onChange={(v) => set('daysAfterOpening', v.trim() === '' ? null : Math.max(0, Number(v.replace(/\D/g, '')) || 0))}
            placeholder="jours"
            mono
            last
          />
        )}
      </Card>

      <Card style={{ marginTop: 20, borderRadius: 20 }}>
        <Row label="Médicament" last={!draft.isMedicine}>
          <Switch on={draft.isMedicine} onToggle={() => set('isMedicine', !draft.isMedicine)} />
        </Row>
        {draft.isMedicine && (
          <>
            <Field label="Dosage" value={draft.dosage ?? ''} onChange={(v) => set('dosage', v || null)} placeholder="500 mg" />
            <Field label="Forme" value={draft.medForm ?? ''} onChange={(v) => set('medForm', v || null)} placeholder="comprimé, sirop…" last />
          </>
        )}
      </Card>

      {draft.isMedicine && (
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--fg-4)', margin: '10px 2px 0' }}>
          La pharmacie reste un inventaire : l’app ne suit ni prise ni prescription.
        </div>
      )}

      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--fg-4)', margin: '18px 2px 0' }}>
        Un produit déjà connu se rajoute en deux gestes : scan puis Sauvegarder.
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, last, mono, autoFocus,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  last?: boolean; mono?: boolean; autoFocus?: boolean;
}) {
  return (
    <label
      style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '16px 17px',
        borderBottom: last ? 'none' : '1px solid var(--line)',
      }}
    >
      <span style={{ fontSize: 16.5, flex: 'none' }}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={mono ? 'mono' : undefined}
        style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', textAlign: 'right', fontSize: 16.5, color: 'var(--fg)' }}
      />
    </label>
  );
}

function StepButton({ children, onClick, accent }: { children: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 44, height: 38, borderRadius: 9, border: 'none',
        background: accent ? 'rgba(245,166,35,.2)' : 'transparent',
        color: accent ? 'var(--accent)' : 'var(--fg)',
        font: '500 22px/1 var(--sans)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}

/** Réduit la photo avant l'envoi : un cliché d'iPhone pèse plusieurs mégaoctets. */
async function shrinkImage(file: File, max = 1000): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.82);
}
