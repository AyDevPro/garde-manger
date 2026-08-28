import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetActions, SheetKicker, SheetText, SheetTitle } from '../components/Sheet';
import { Button, Spinner, Thumb } from '../components/ui';
import { api } from '../lib/api';
import { parseGs1 } from '../lib/gs1';
import { useScanner } from '../lib/useScanner';
import { useStore } from '../store';
import type { Draft, Lookup } from '../types';

type Found = { lookup: Lookup; expiry?: string; lot?: string };

export function Scan() {
  const nav = useNavigate();
  const { locations, categories, setDraft, run, showToast } = useStore();
  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [manual, setManual] = useState('');
  const busyRef = useRef(false);

  const resolve = useCallback(async (code: string, extra?: { expiry?: string; lot?: string }) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const lookup = await run(() => api.get<Lookup>(`/lookup/${code}`));
    setBusy(false);
    busyRef.current = false;
    if (!lookup) return;
    setFound({ lookup, ...extra });
  }, [run]);

  const onResult = useCallback((r: { text: string; format: string }) => {
    // Les boîtes de médicaments portent un DataMatrix GS1 : code, péremption et lot d'un coup.
    const gs1 = parseGs1(r.text);
    if (gs1?.gtin) return void resolve(gs1.gtin, { expiry: gs1.expiry, lot: gs1.lot });
    const digits = r.text.replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 14) return void resolve(digits);
    showToast('Code illisible — réessayez ou saisissez-le à la main');
  }, [resolve, showToast]);

  const { videoRef, state, message, torchAvailable, torchOn, toggleTorch, rearm } =
    useScanner(onResult, mode === 'camera' && !found);

  useEffect(() => { if (!found) rearm(); }, [found, rearm]);

  const startDraft = (lookup: Lookup, extra?: { expiry?: string; lot?: string }) => {
    const pharmacie = locations.find((l) => l.kind === 'pharmacie');
    const frigo = locations.find((l) => l.kind === 'frigo') ?? locations[0];
    const isMed = Boolean(extra?.expiry && extra?.lot);
    const catHint = lookup.categoryHint?.toLowerCase() ?? '';
    const category =
      (isMed ? categories.find((c) => c.isMedicine) : null) ??
      categories.find((c) => catHint && c.name.toLowerCase().includes(catHint.split(' ')[0])) ??
      null;

    const draft: Draft = {
      name: lookup.name ?? '',
      brand: lookup.brand,
      barcode: lookup.barcode,
      imageUrl: lookup.imageUrl,
      packageText: lookup.packageText,
      categoryId: category?.id ?? null,
      locationId: (isMed ? pharmacie : frigo)?.id ?? null,
      qty: 1,
      unit: 'unités',
      dateType: extra?.expiry ? 'EXP' : 'DLC',
      bestBefore: extra?.expiry ?? null,
      lotCode: extra?.lot ?? null,
      daysAfterOpening: null,
      isMedicine: isMed,
      dosage: null,
      medForm: null,
      notes: null,
      productId: lookup.productId,
      recognizedFrom: lookup.source === 'none' ? undefined : lookup.source,
    };
    setDraft(draft);
    setFound(null);
    nav('/ajouter');
  };

  return (
    <div style={{ height: '100%', background: '#0A0A0A', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          padding: `calc(var(--safe-top) + var(--banner-h) + 14px) 18px 0`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}
      >
        <PillButton onClick={() => nav(-1)}>Annuler</PillButton>
        {mode === 'camera' && torchAvailable && (
          <PillButton onClick={toggleTorch} active={torchOn}>Lampe</PillButton>
        )}
        <PillButton onClick={() => nav('/scanner-date')}>Scanner la date</PillButton>
      </div>

      {mode === 'camera' ? (
        <CameraView
          videoRef={videoRef}
          state={state}
          message={message}
          busy={busy}
          onManual={() => setMode('manual')}
        />
      ) : (
        <ManualEntry
          code={manual}
          setCode={setManual}
          onCamera={() => setMode('camera')}
          onSubmit={() => manual.length >= 8 && resolve(manual)}
          busy={busy}
        />
      )}

      <Sheet open={Boolean(found)} onClose={() => setFound(null)}>
        {found?.lookup.name ? (
          <>
            <SheetKicker tone="var(--green)">
              {found.lookup.source === 'stock' ? 'Déjà dans votre stock'
                : found.lookup.source === 'cache' ? 'Produit déjà scanné'
                : 'Produit reconnu'}
            </SheetKicker>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
              <Thumb name={found.lookup.name} src={found.lookup.imageUrl} size={66} />
              <div style={{ minWidth: 0 }}>
                <div className="ellipsis" style={{ fontSize: 20, fontWeight: 700 }}>{found.lookup.name}</div>
                <div style={{ fontSize: 13.5, color: 'var(--fg-2)', marginTop: 5 }}>
                  {[found.lookup.brand, found.lookup.packageText].filter(Boolean).join(' · ') || 'Sans marque'}
                </div>
                <div className="mono" style={{ fontSize: 12, color: 'rgba(235,235,245,.35)', marginTop: 7 }}>
                  {found.lookup.barcode}
                </div>
              </div>
            </div>
            {found.expiry && (
              <SheetText>Le code contient une péremption au {found.expiry} — elle sera pré‑remplie.</SheetText>
            )}
            <SheetActions>
              <Button variant="ghost" style={{ flex: 1 }} onClick={() => setFound(null)}>Ce n’est pas ça</Button>
              <Button variant="primary" style={{ flex: 1.5 }} onClick={() => startDraft(found.lookup, found)}>
                Continuer
              </Button>
            </SheetActions>
          </>
        ) : found ? (
          <>
            <SheetKicker tone="var(--orange)">Produit inconnu</SheetKicker>
            <SheetTitle>Ce code n’est pas dans la base</SheetTitle>
            <SheetText>
              Nommez‑le une fois : il sera reconnu automatiquement lors des prochains scans.
            </SheetText>
            <div className="mono" style={{ fontSize: 12.5, color: 'rgba(235,235,245,.4)', marginTop: 12 }}>
              {found.lookup.barcode}
            </div>
            <SheetActions>
              <Button variant="ghost" style={{ flex: 1 }} onClick={() => setFound(null)}>Annuler</Button>
              <Button variant="primary" style={{ flex: 1.5 }} onClick={() => startDraft(found.lookup, found)}>
                Créer la fiche
              </Button>
            </SheetActions>
          </>
        ) : null}
      </Sheet>
    </div>
  );
}

function CameraView({
  videoRef, state, message, busy, onManual,
}: {
  videoRef: React.RefObject<HTMLVideoElement>; state: string; message: string | null;
  busy: boolean; onManual: () => void;
}) {
  const blocked = state === 'denied' || state === 'unsupported' || state === 'error';

  if (blocked) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 28px 70px' }}>
        <div
          style={{
            width: 48, height: 48, borderRadius: 14, background: 'rgba(255,69,58,.16)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22,
          }}
        >
          <span style={{ width: 22, height: 2.5, background: 'var(--red)', transform: 'rotate(-45deg)' }} />
        </div>
        <div style={{ font: '700 27px/1.15 var(--sans)', letterSpacing: '-.02em' }}>
          {state === 'denied' ? 'Caméra refusée' : 'Caméra indisponible'}
        </div>
        <div style={{ fontSize: 14.5, lineHeight: 1.5, color: 'var(--fg-2)', marginTop: 11 }}>
          {message ?? 'L’app n’a pas accès à l’appareil photo. Autorisez‑la dans Réglages iOS, ou saisissez le code à la main.'}
        </div>
        <Button variant="ghost" onClick={onManual} style={{ marginTop: 26 }}>Saisir le code manuellement</Button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 22px 48px' }}>
      <div
        style={{
          padding: '13px 22px', borderRadius: 14, background: 'rgba(20,20,20,.85)',
          border: '1px solid rgba(255,255,255,.2)', fontSize: 19, fontWeight: 700, marginBottom: 26,
        }}
      >
        {busy ? 'Recherche…' : state === 'starting' ? 'Caméra…' : 'Scannez le code‑barres'}
      </div>

      <div
        style={{
          position: 'relative', width: 'min(320px, 88vw)', aspectRatio: '3 / 2',
          borderRadius: 20, overflow: 'hidden', background: '#161310',
        }}
      >
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {[['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']].map(([v, h]) => (
          <span
            key={`${v}${h}`}
            style={{
              position: 'absolute', [v]: 12, [h]: 12, width: 30, height: 30,
              [`border${v === 'top' ? 'Top' : 'Bottom'}`]: '4px solid #fff',
              [`border${h === 'left' ? 'Left' : 'Right'}`]: '4px solid #fff',
              borderRadius: v === 'top' ? (h === 'left' ? '10px 0 0 0' : '0 10px 0 0') : (h === 'left' ? '0 0 0 10px' : '0 0 10px 0'),
            } as React.CSSProperties}
          />
        ))}
        <span
          style={{
            position: 'absolute', left: 42, right: 42, top: '50%', height: 2,
            background: 'var(--accent)', boxShadow: '0 0 16px var(--accent)',
            animation: 'sweep 2.2s ease-in-out infinite',
          }}
        />
        {busy && (
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.45)' }}>
            <Spinner size={30} />
          </span>
        )}
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--fg-3)', textAlign: 'center', marginTop: 18, maxWidth: 300 }}>
        Codes‑barres alimentaires et DataMatrix des boîtes de médicaments.
      </div>

      <Button
        variant="primary"
        onClick={onManual}
        style={{ marginTop: 22, width: 'auto', padding: '15px 34px', borderRadius: 14 }}
      >
        Saisir manuellement
      </Button>
    </div>
  );
}

function ManualEntry({
  code, setCode, onCamera, onSubmit, busy,
}: {
  code: string; setCode: React.Dispatch<React.SetStateAction<string>>;
  onCamera: () => void; onSubmit: () => void; busy: boolean;
}) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '✓'];
  return (
    <div style={{ flex: 1, padding: '32px 24px 44px', maxWidth: 460, width: '100%', margin: '0 auto' }}>
      <div style={{ font: '700 26px/1.15 var(--sans)', letterSpacing: '-.02em' }}>Saisir le code‑barres</div>
      <div
        className="mono"
        style={{
          marginTop: 18, padding: '16px 18px', borderRadius: 16, background: 'var(--card)',
          font: '500 22px/1 var(--mono)', letterSpacing: '.06em', minHeight: 54,
        }}
      >
        {code}<span style={{ opacity: .4 }}>|</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 18 }}>
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              // Forme fonctionnelle : deux appuis rapprochés ne s'écrasent pas.
              if (k === '⌫') setCode((c) => c.slice(0, -1));
              else if (k === '✓') onSubmit();
              else setCode((c) => (c + k).slice(0, 14));
            }}
            style={{
              padding: '16px 0', borderRadius: 14, border: 'none', background: 'var(--card)',
              font: '500 20px/1 var(--mono)', color: 'var(--fg)',
            }}
          >
            {k}
          </button>
        ))}
      </div>
      <Button variant="primary" disabled={code.length < 8 || busy} onClick={onSubmit} style={{ marginTop: 16 }}>
        {busy ? <Spinner size={18} /> : 'Chercher ce code'}
      </Button>
      <Button variant="ghost" onClick={onCamera} style={{ marginTop: 10, fontSize: 15 }}>Revenir à la caméra</Button>
    </div>
  );
}

function PillButton({ children, onClick, active }: { children: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '10px 18px', borderRadius: 999, border: 'none',
        background: active ? 'var(--accent)' : 'rgba(255,255,255,.12)',
        color: active ? 'var(--on-accent)' : '#fff', font: '500 15px/1 var(--sans)', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}
