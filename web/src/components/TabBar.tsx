import { useLocation, useNavigate } from 'react-router-dom';

const TABS = [
  { to: '/', label: 'Accueil', match: (p: string) => p === '/' },
  { to: '/stock', label: 'Stock', match: (p: string) => p.startsWith('/stock') || p.startsWith('/produit') },
  { to: '/dates', label: 'Dates', match: (p: string) => p.startsWith('/dates') },
  { to: '/reglages', label: 'Réglages', match: (p: string) => p.startsWith('/reglages') || p.startsWith('/securite') || p.startsWith('/gerer') || p.startsWith('/courses') || p.startsWith('/historique') },
];

/** Barre d'onglets flottante + le gros bouton Scanner : l'action la plus fréquente. */
export function TabBar() {
  const nav = useNavigate();
  const { pathname } = useLocation();

  return (
    <nav
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60,
        padding: `0 16px calc(var(--safe-bottom) + 14px)`, pointerEvents: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, pointerEvents: 'auto', maxWidth: 520, margin: '0 auto' }}>
        <div
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 2, padding: 6, borderRadius: 999,
            background: 'rgba(28,28,30,.94)', backdropFilter: 'blur(18px)',
            WebkitBackdropFilter: 'blur(18px)', border: '1px solid rgba(255,255,255,.08)',
          }}
        >
          {TABS.map((t) => {
            const on = t.match(pathname);
            return (
              <button
                key={t.to}
                type="button"
                onClick={() => nav(t.to)}
                aria-current={on ? 'page' : undefined}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                  padding: '9px 0', borderRadius: 999, border: 'none',
                  background: on ? 'rgba(245,166,35,.16)' : 'transparent',
                  color: on ? 'var(--accent)' : 'rgba(235,235,245,.5)',
                }}
              >
                <TabIcon name={t.label} />
                <span style={{ fontSize: 10, fontWeight: 600 }}>{t.label}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => nav('/scanner')}
          aria-label="Scanner un produit"
          style={{
            flex: 'none', width: 66, height: 66, borderRadius: '50%', border: 'none',
            background: 'var(--accent)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 3,
            boxShadow: '0 12px 26px rgba(245,166,35,.35)',
          }}
        >
          <span
            style={{
              width: 24, height: 20, borderLeft: '2.5px solid var(--on-accent)',
              borderRight: '2.5px solid var(--on-accent)', display: 'flex', justifyContent: 'center', gap: 3,
            }}
          >
            <span style={{ width: 2.5, background: 'var(--on-accent)' }} />
            <span style={{ width: 2.5, background: 'var(--on-accent)' }} />
          </span>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--on-accent)' }}>Scanner</span>
        </button>
      </div>
    </nav>
  );
}

function TabIcon({ name }: { name: string }) {
  if (name === 'Accueil') return <span style={{ width: 18, height: 16, border: '2px solid currentColor', borderRadius: 4 }} />;
  if (name === 'Stock') {
    return (
      <span style={{ width: 18, height: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <span style={{ height: 4, border: '2px solid currentColor', borderRadius: 2 }} />
        <span style={{ height: 9, border: '2px solid currentColor', borderRadius: 3 }} />
      </span>
    );
  }
  if (name === 'Dates') {
    return (
      <span style={{ width: 17, height: 17, border: '2px solid currentColor', borderRadius: '50%', position: 'relative' }}>
        <span style={{ position: 'absolute', left: 5.5, top: 2.5, width: 2, height: 6, background: 'currentColor' }} />
      </span>
    );
  }
  return (
    <span
      style={{
        width: 17, height: 17, border: '2px solid currentColor', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
    </span>
  );
}
