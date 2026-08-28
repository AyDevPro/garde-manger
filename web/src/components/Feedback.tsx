import { useStore } from '../store';

/**
 * Bandeau d'état réseau. Tant qu'il reste des écritures en file, il indique
 * combien et propose de réessayer : rien n'est perdu, c'est juste en attente.
 */
export function NetBanner() {
  const { netError, setNetError, pendingCount, syncing } = useStore();
  if (!netError && !pendingCount) return null;

  const waiting = pendingCount > 0;
  const tone = waiting ? 'var(--orange)' : 'var(--red)';
  const message = waiting
    ? `${pendingCount} modification${pendingCount > 1 ? 's' : ''} en attente d’envoi`
    : netError;

  return (
    <div
      role="status"
      style={{
        position: 'fixed', top: `calc(var(--safe-top) + 8px)`, left: 14, right: 14, zIndex: 80,
        maxWidth: 520, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 11,
        padding: '12px 15px', borderRadius: 17,
        background: waiting ? 'rgba(255,159,10,.16)' : 'rgba(255,69,58,.16)',
        border: `1px solid ${waiting ? 'rgba(255,159,10,.4)' : 'rgba(255,69,58,.4)'}`,
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', animation: 'rise .25s ease',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: tone, flex: 'none', animation: 'pulse 1.4s infinite' }} />
      <span style={{ flex: 1, fontSize: 13, lineHeight: 1.35 }}>{message}</span>
      <BannerAction waiting={waiting} syncing={syncing} tone={tone} onDismiss={() => setNetError(null)} />
    </div>
  );
}

function BannerAction({
  waiting, syncing, tone, onDismiss,
}: { waiting: boolean; syncing: boolean; tone: string; onDismiss: () => void }) {
  const { sync } = useStore();
  if (!waiting) {
    return (
      <button
        type="button"
        onClick={onDismiss}
        style={{ background: 'none', border: 'none', font: '600 12.5px/1 var(--sans)', color: tone, padding: '6px 8px' }}
      >
        OK
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => sync()}
      disabled={syncing}
      style={{
        background: 'none', border: 'none', font: '600 12.5px/1 var(--sans)',
        color: tone, padding: '6px 8px', opacity: syncing ? .5 : 1,
      }}
    >
      {syncing ? 'Envoi…' : 'Réessayer'}
    </button>
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
