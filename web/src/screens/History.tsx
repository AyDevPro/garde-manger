import { useNavigate } from 'react-router-dom';
import { BackHeader, Card, Screen, Spinner, Title } from '../components/ui';
import { useGoBack, useResource } from '../hooks';
import { MOVEMENT_LABEL } from '../lib/format';
import type { Movement } from '../types';

const TONE: Record<string, string> = {
  added: 'var(--green)', consumed: 'var(--accent)', trashed: 'var(--red)',
  moved: 'var(--blue)', opened: 'var(--orange)', frozen: '#64D2FF',
  thawed: '#64D2FF', archived: 'var(--red)', edited: 'var(--fg-3)', restored: 'var(--fg-3)',
};

export function History() {
  const nav = useNavigate();
  const goBack = useGoBack('/');
  const { data, loading } = useResource<Movement[]>('/movements?limit=120');

  const days = groupByDay(data ?? []);

  return (
    <Screen>
      <BackHeader onBack={goBack}>Retour</BackHeader>
      <div style={{ marginTop: 16 }}>
        <Title sub="Ajouté, consommé, jeté, déplacé, ouvert, congelé.">Historique</Title>
      </div>

      {loading && !data && <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 50 }}><Spinner /></div>}

      {days.map(([day, items]) => (
        <div key={day} style={{ marginTop: 22 }}>
          <div style={{ fontSize: 13, color: 'var(--fg-3)', marginBottom: 9 }}>{day}</div>
          <Card>
            {items.map((m, i, arr) => (
              <button
                key={m.id}
                type="button"
                onClick={() => m.productId && nav(`/stock?q=${encodeURIComponent(m.productName ?? '')}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '13px 16px',
                  border: 'none', background: 'transparent', color: 'inherit', textAlign: 'left',
                  borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--line)',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: TONE[m.kind] ?? 'var(--fg-4)' }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="ellipsis" style={{ display: 'block', fontSize: 15.5 }}>{m.label}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--fg-4)', marginTop: 3 }}>
                    {MOVEMENT_LABEL[m.kind] ?? m.kind}
                    {m.to ? ` · ${m.to}` : ''}
                  </span>
                </span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--fg-4)', flex: 'none' }}>
                  {new Date(m.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </button>
            ))}
          </Card>
        </div>
      ))}

      {data?.length === 0 && (
        <div style={{ marginTop: 30, textAlign: 'center', color: 'var(--fg-2)', fontSize: 14 }}>
          Aucun mouvement pour l’instant.
        </div>
      )}
    </Screen>
  );
}

function groupByDay(items: Movement[]) {
  const fmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const map = new Map<string, Movement[]>();
  for (const m of items) {
    const d = new Date(m.at);
    const key = d.toDateString() === today ? "Aujourd'hui" : d.toDateString() === yesterday ? 'Hier' : fmt.format(d);
    (map.get(key) ?? map.set(key, []).get(key)!).push(m);
  }
  return [...map.entries()];
}
