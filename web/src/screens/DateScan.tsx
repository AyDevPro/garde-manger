import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Chip, Eyebrow, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { DATE_TYPE_LABEL, frDate } from '../lib/format';
import { useStore } from '../store';
import type { DateType } from '../types';

type Candidate = { iso: string; raw: string; dateType: DateType | null };

/**
 * Lecture de la date imprimée. La photo sert de loupe : on fige l'image, on lit
 * la date dessus, et l'app propose les dates trouvées dans le texte saisi.
 * Rien n'est enregistré sans confirmation — une date mal lue est pire qu'absente.
 */
export function DateScan() {
  const nav = useNavigate();
  const { setDraft, run } = useStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [shot, setShot] = useState<string | null>(null);
  const [camera, setCamera] = useState<'off' | 'on' | 'blocked'>('off');
  const [text, setText] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [iso, setIso] = useState('');
  const [dateType, setDateType] = useState<DateType>('DLC');
  const [busy, setBusy] = useState(false);
  // Incrémenté par « Reprendre » : relance la caméra sans recharger la page.
  const [session, setSession] = useState(0);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } }, audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCamera('on');
      } catch {
        if (!cancelled) setCamera('blocked');
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [stop, session]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    setShot(canvas.toDataURL('image/jpeg', 0.85));
    stop();
    setCamera('off');
  }

  // La saisie du texte imprimé alimente la détection côté serveur.
  useEffect(() => {
    if (text.trim().length < 4) { setCandidates([]); return; }
    const t = setTimeout(async () => {
      setBusy(true);
      const r = await run(() => api.post<{ candidates: Candidate[] }>('/parse-date', { text }));
      setBusy(false);
      if (r) {
        setCandidates(r.candidates);
        if (r.candidates[0]) {
          setIso(r.candidates[0].iso);
          if (r.candidates[0].dateType) setDateType(r.candidates[0].dateType);
        }
      }
    }, 350);
    return () => clearTimeout(t);
  }, [text, run]);

  function confirm() {
    if (!iso) return;
    setDraft((d) => (d ? { ...d, bestBefore: iso, dateType } : d));
    nav('/ajouter');
  }

  return (
    <div
      className="scroll"
      style={{
        height: '100%', background: '#0A0A0A',
        padding: `calc(var(--safe-top) + var(--banner-h) + 14px) 22px calc(var(--safe-bottom) + 30px)`,
        maxWidth: 520, margin: '0 auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          type="button"
          onClick={() => nav(-1)}
          style={{ padding: '10px 18px', borderRadius: 999, border: 'none', background: 'rgba(255,255,255,.12)', color: '#fff', font: '500 15px/1 var(--sans)' }}
        >
          Annuler
        </button>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Date imprimée</span>
        <span style={{ width: 74 }} />
      </div>

      <div
        style={{
          position: 'relative', marginTop: 22, width: '100%', aspectRatio: '3 / 2',
          borderRadius: 20, overflow: 'hidden', background: '#141210',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {shot ? (
          <img src={shot} alt="Photo de la date imprimée" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : camera === 'blocked' ? (
          <span style={{ fontSize: 14, color: 'var(--fg-2)', textAlign: 'center', padding: 24 }}>
            Caméra indisponible — saisissez la date à la main plus bas.
          </span>
        ) : (
          <>
            <video ref={videoRef} muted autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <span
              style={{
                position: 'absolute', left: '18%', right: '18%', top: '42%', height: 44,
                border: '2.5px solid var(--accent)', borderRadius: 10, boxShadow: '0 0 20px rgba(245,166,35,.4)',
                pointerEvents: 'none',
              }}
            />
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        {shot ? (
          <Button variant="ghost" onClick={() => { setShot(null); setCamera('off'); setSession((n) => n + 1); }} style={{ flex: 1 }}>
            Reprendre
          </Button>
        ) : (
          <Button variant="ghost" onClick={capture} disabled={camera !== 'on'} style={{ flex: 1 }}>
            Figer l’image
          </Button>
        )}
      </div>

      <Eyebrow style={{ margin: '24px 2px 9px' }}>Ce qui est imprimé</Eyebrow>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="À consommer jusqu’au 02/09/2026"
        style={{
          width: '100%', background: 'var(--card)', border: 'none', borderRadius: 16,
          padding: '14px 16px', fontSize: 15, lineHeight: 1.4, color: 'var(--fg)', resize: 'none',
        }}
      />
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--fg-4)', margin: '8px 2px 0' }}>
        Recopiez la mention lue sur l’emballage : l’app en extrait la date et son type.
      </div>

      {(candidates.length > 0 || busy) && (
        <div className="hscroll" style={{ display: 'flex', gap: 7, marginTop: 12, alignItems: 'center' }}>
          {busy && <Spinner size={16} />}
          {candidates.map((c) => (
            <Chip
              key={c.iso}
              label={frDate(c.iso, true)}
              active={iso === c.iso}
              onClick={() => { setIso(c.iso); if (c.dateType) setDateType(c.dateType); }}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: 20, padding: '17px 19px', borderRadius: 20, background: 'var(--card)' }}>
        <Eyebrow>Date retenue</Eyebrow>
        <input
          type="date"
          value={iso}
          onChange={(e) => setIso(e.target.value)}
          style={{
            marginTop: 10, width: '100%', background: 'var(--card-2)', border: 'none', borderRadius: 12,
            padding: '12px 14px', font: '700 20px/1 var(--mono)', color: 'var(--fg)',
          }}
        />
        <div className="hscroll" style={{ display: 'flex', gap: 7, marginTop: 12 }}>
          {(['DLC', 'DDM', 'EXP'] as DateType[]).map((t) => (
            <Chip key={t} label={t} active={dateType === t} onClick={() => setDateType(t)} />
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--fg-3)', marginTop: 10 }}>{DATE_TYPE_LABEL[dateType]}</div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <Button variant="ghost" onClick={() => nav(-1)} style={{ flex: 1 }}>Retour</Button>
        <Button variant="primary" onClick={confirm} disabled={!iso} style={{ flex: 1.4 }}>Utiliser cette date</Button>
      </div>
    </div>
  );
}
