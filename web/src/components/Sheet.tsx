import { useEffect, type ReactNode } from 'react';

/** Feuille modale qui monte du bas, comme les feuilles iOS. */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,.55)',
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520, margin: '0 auto', background: 'var(--card)',
          borderRadius: '28px 28px 0 0', padding: `20px 20px calc(var(--safe-bottom) + 30px)`,
          animation: 'rise .22s ease', maxHeight: '86vh', overflowY: 'auto',
        }}
      >
        <div style={{ width: 38, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.2)', margin: '0 auto 20px' }} />
        {children}
      </div>
    </div>
  );
}

export function SheetKicker({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <div
      className="mono"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 600,
        letterSpacing: '.08em', textTransform: 'uppercase', color: tone,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: tone }} />
      {children}
    </div>
  );
}

export function SheetTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{ font: '700 24px/1.15 var(--sans)', letterSpacing: '-.02em', marginTop: 14 }}>{children}</div>
  );
}

export function SheetText({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 14, lineHeight: 1.5, color: 'rgba(235,235,245,.55)', marginTop: 9 }}>{children}</div>;
}

export function SheetActions({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>{children}</div>;
}
