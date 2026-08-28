import { useEffect } from 'react';
import { useStore } from '../store';

/** Hauteur réservée en haut des écrans quand la pastille est là. */
const BANNER_HEIGHT = 34;

/**
 * État du réseau, en une ligne. La pastille ne recouvre rien : elle réserve sa
 * hauteur via `--banner-h`, dont les écrans tiennent compte dans leur marge
 * haute. Sur un iPhone, deux lignes flottantes mangeaient les tuiles.
 */
export function NetBanner() {
  const { netError, setNetError, pendingCount, syncing, sync } = useStore();
  const waiting = pendingCount > 0;
  const visible = Boolean(netError) || waiting;

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--banner-h', visible ? `${BANNER_HEIGHT + 8}px` : '0px');
    return () => root.style.setProperty('--banner-h', '0px');
  }, [visible]);

  if (!visible) return null;

  const tone = waiting ? 'var(--orange)' : 'var(--red)';
  const label = syncing
    ? 'Envoi…'
    : waiting
      ? `${pendingCount} en attente`
      : 'Hors ligne';

  return (
    <div
      role="status"
      style={{
        position: 'fixed', top: 'calc(var(--safe-top) + 6px)', left: 0, right: 0, zIndex: 80,
        display: 'flex', justifyContent: 'center', pointerEvents: 'none',
      }}
    >
      <button
        type="button"
        onClick={() => (waiting ? sync() : setNetError(null))}
        disabled={syncing}
        style={{
          pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 8,
          height: BANNER_HEIGHT, maxWidth: 'calc(100% - 28px)',
          padding: '0 14px', borderRadius: 999, border: `1px solid ${tone}55`,
          background: waiting ? 'rgba(255,159,10,.18)' : 'rgba(255,69,58,.18)',
          backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          color: 'var(--fg)', font: '600 13px/1 var(--sans)', whiteSpace: 'nowrap',
          animation: 'rise .22s ease',
        }}
      >
        <span
          style={{
            width: 7, height: 7, borderRadius: '50%', background: tone, flex: 'none',
            animation: syncing ? 'pulse .9s infinite' : 'pulse 1.8s infinite',
          }}
        />
        <span className="ellipsis">{label}</span>
        {waiting && !syncing && (
          <span style={{ color: tone, fontWeight: 600 }}>· Envoyer</span>
        )}
      </button>
    </div>
  );
}

/** Confirmation éphémère, avec « Annuler » quand l'action est réversible. */
export function Toast() {
  const { toast, dismissToast } = useStore();
  if (!toast) return null;
  return (
    <div
      role="status"
      style={{
        position: 'fixed', left: 16, right: 16, bottom: `calc(var(--safe-bottom) + 106px)`, zIndex: 70,
        maxWidth: 520, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 11,
        padding: '14px 16px', borderRadius: 18, background: 'rgba(44,44,46,.96)',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 14px 34px rgba(0,0,0,.55)', animation: 'rise .2s ease',
      }}
    >
      <span style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--green)', flex: 'none' }} />
      <span style={{ flex: 1, fontSize: 14, lineHeight: 1.35 }}>{toast.text}</span>
      {toast.undo && (
        <button
          type="button"
          onClick={async () => { const u = toast.undo!; dismissToast(); await u(); }}
          style={{ background: 'none', border: 'none', font: '600 13px/1 var(--sans)', color: 'var(--accent)', padding: '6px 8px' }}
        >
          Annuler
        </button>
      )}
    </div>
  );
}
