import { useNavigate } from 'react-router-dom';
import { Screen, Spinner, Title } from '../components/ui';
import { useResource } from '../hooks';
import { URGENCY_LABEL } from '../lib/format';
import type { Dashboard, Urgency } from '../types';

const SECTIONS: { key: Urgency; color: string; bg: string; border: string }[] = [
  { key: 'expired', color: 'var(--red)', bg: 'rgba(255,69,58,.12)', border: 'rgba(255,69,58,.3)' },
  { key: 'today', color: 'var(--red)', bg: 'rgba(255,69,58,.12)', border: 'rgba(255,69,58,.3)' },
  { key: 'next3', color: 'var(--orange)', bg: 'rgba(255,159,10,.12)', border: 'rgba(255,159,10,.3)' },
  { key: 'week', color: 'var(--yellow)', bg: 'rgba(255,214,10,.1)', border: 'rgba(255,214,10,.26)' },
  { key: 'later', color: 'var(--green)', bg: 'rgba(48,209,88,.1)', border: 'rgba(48,209,88,.26)' },
  { key: 'nodate', color: 'rgba(235,235,245,.6)', bg: 'var(--card)', border: 'rgba(255,255,255,.08)' },
];

export function Dates() {
  const nav = useNavigate();
  const { data, loading } = useResource<Dashboard>('/dashboard');

  if (loading && !data) {
    return <Screen><div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spinner /></div></Screen>;
  }

  return (
    <Screen>
      <Title sub="Classé par urgence, du plus pressé au plus lointain.">Dates</Title>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
        {SECTIONS.map((s) => {
          const count = data?.counts[s.key] ?? 0;
          const sample = data?.samples[s.key];
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => nav(`/stock?bucket=${s.key}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: 17, borderRadius: 22,
                background: s.bg, border: `1px solid ${s.border}`, color: 'inherit',
                opacity: count === 0 ? .55 : 1,
              }}
            >
              <span style={{ width: 4, height: 40, borderRadius: 3, flex: 'none', background: s.color }} />
              <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 17, fontWeight: 600, color: s.color }}>
                  {URGENCY_LABEL[s.key]}
                </span>
                <span
                  className="ellipsis"
                  style={{ display: 'block', fontSize: 12.5, lineHeight: 1.35, color: 'var(--fg-3)', marginTop: 4 }}
                >
                  {sample || 'Rien pour l’instant'}
                </span>
              </span>
              <span className="mono" style={{ font: '700 22px/1 var(--mono)', color: s.color }}>{count}</span>
              <span style={{ color: 'var(--fg-4)', fontSize: 18 }}>›</span>
            </button>
          );
        })}
      </div>
    </Screen>
  );
}
