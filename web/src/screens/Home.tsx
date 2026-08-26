import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StockRow } from '../components/StockRow';
import { Card, Eyebrow, Screen, Spinner } from '../components/ui';
import { ZeroSheet } from './sheets';
import { useResource, useStockActions } from '../hooks';
import { frToday } from '../lib/format';
import type { Dashboard, StockItem } from '../types';

/** Quatre tuiles : ce qui est expiré, ce qui presse, et le reste. */
const TILES = [
  { key: 'total', label: 'Tous', fg: 'var(--blue)', bg: 'rgba(10,132,255,.14)', border: 'rgba(10,132,255,.35)', shape: '3px', to: '/stock' },
  { key: 'today', label: "Aujourd'hui", fg: 'var(--green)', bg: 'rgba(48,209,88,.13)', border: 'rgba(48,209,88,.32)', shape: '2px', to: '/stock?bucket=today' },
  { key: 'expired', label: 'Expirés', fg: 'var(--red)', bg: 'rgba(255,69,58,.13)', border: 'rgba(255,69,58,.32)', shape: '50%', to: '/stock?bucket=expired' },
  { key: 'programmes', label: 'Programmés', fg: 'var(--orange)', bg: 'rgba(255,159,10,.13)', border: 'rgba(255,159,10,.32)', shape: '50%', to: '/dates' },
] as const;

export function Home() {
  const nav = useNavigate();
  const [zero, setZero] = useState<StockItem | null>(null);
  const { data, loading } = useResource<Dashboard>('/dashboard');
  const { consume } = useStockActions(setZero);

  if (loading && !data) {
    return (
      <Screen>
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spinner /></div>
      </Screen>
    );
  }
  if (!data) return <Screen><div style={{ paddingTop: 60, color: 'var(--fg-2)' }}>Données indisponibles.</div></Screen>;

  const counts = data.counts;
  const value = (key: string) =>
    key === 'programmes' ? counts.next3 + counts.week + counts.later : (counts as Record<string, number>)[key] ?? 0;

  return (
    <Screen pad={false}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px' }}>
        <div>
          <Eyebrow>{frToday()}</Eyebrow>
          <h1 style={{ font: '700 30px/1.1 var(--sans)', letterSpacing: '-.02em', margin: '7px 0 0' }}>Inventaire</h1>
        </div>
        <div style={{ display: 'flex', gap: 9 }}>
          <IconButton label="Historique" onClick={() => nav('/historique')}>
            <span style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid #fff', position: 'relative' }}>
              <span style={{ position: 'absolute', left: 5, top: 2, width: 2, height: 6, background: '#fff' }} />
            </span>
          </IconButton>
          <IconButton label="Réglages" onClick={() => nav('/reglages')}>
            {[0, 1, 2].map((i) => <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: '#fff' }} />)}
          </IconButton>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11, padding: '18px 20px 0' }}>
        {TILES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => nav(t.to)}
            style={{
              padding: '15px 16px 14px', borderRadius: 22, background: t.bg,
              border: `1px solid ${t.border}`, textAlign: 'left',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span
                style={{
                  width: 30, height: 30, borderRadius: '50%', background: t.fg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span style={{ width: 12, height: 12, borderRadius: t.shape, background: '#0B0B0C' }} />
              </span>
              <span className="mono" style={{ font: '700 26px/1 var(--mono)', color: t.fg }}>{value(t.key)}</span>
            </span>
            <span style={{ display: 'block', marginTop: 14, fontSize: 16, fontWeight: 600, color: t.fg }}>{t.label}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '28px 20px 11px' }}>
        <h2 style={{ font: '700 20px/1.2 var(--sans)', letterSpacing: '-.01em', margin: 0 }}>À consommer vite</h2>
        <button
          type="button"
          onClick={() => nav('/dates')}
          style={{ background: 'none', border: 'none', font: '600 13.5px/1 var(--sans)', color: 'var(--accent)' }}
        >
          Tout voir
        </button>
      </div>

      {data.urgent.length ? (
        <Card style={{ margin: '0 20px' }}>
          {data.urgent.slice(0, 5).map((item, i, arr) => (
            <StockRow
              key={item.id}
              item={item}
              subtitle="urgency"
              last={i === arr.length - 1}
              onOpen={() => nav(`/produit/${item.id}`)}
              onConsume={() => consume(item)}
            />
          ))}
        </Card>
      ) : (
        <div style={{ margin: '0 20px', padding: '36px 22px', textAlign: 'center', background: 'var(--card)', borderRadius: 22 }}>
          <div style={{ width: 36, height: 36, margin: '0 auto 14px', borderRadius: '50%', border: '2px solid var(--green)' }} />
          <div style={{ fontSize: 17, fontWeight: 600 }}>Rien ne presse</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.45, color: 'var(--fg-2)', marginTop: 6 }}>
            Aucun produit n’expire dans les 7 prochains jours.
          </div>
        </div>
      )}

      <h2 style={{ font: '700 20px/1.2 var(--sans)', letterSpacing: '-.01em', padding: '28px 20px 11px', margin: 0 }}>
        Emplacement
      </h2>
      <Card style={{ margin: '0 20px' }}>
        {data.locations.map((l, i, arr) => (
          <button
            key={l.id}
            type="button"
            onClick={() => nav(`/stock?location=${l.id}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 13, width: '100%', padding: '15px 16px',
              border: 'none', background: 'transparent', color: 'inherit',
              borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--line)',
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 3, flex: 'none', background: l.tone }} />
            <span style={{ flex: 1, textAlign: 'left', fontSize: 16.5 }}>{l.name}</span>
            <span className="mono" style={{ fontSize: 14, fontWeight: 500, color: 'rgba(235,235,245,.4)' }}>{l.count}</span>
            <span style={{ color: 'var(--fg-4)', fontSize: 17 }}>›</span>
          </button>
        ))}
      </Card>

      <ZeroSheet item={zero} onClose={() => setZero(null)} />
    </Screen>
  );
}

function IconButton({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        width: 40, height: 40, borderRadius: '50%', background: 'var(--card)', border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
      }}
    >
      {children}
    </button>
  );
}
