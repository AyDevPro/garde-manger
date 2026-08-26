import { URGENCY_COLOR, URGENCY_TINT, qtyLabel, urgencyBadge } from '../lib/format';
import type { StockItem } from '../types';
import { Pill, Thumb } from './ui';

/** Une ligne de la liste de stock. `onConsume` affiche le geste rapide « −1 ». */
export function StockRow({
  item, onOpen, onConsume, last, subtitle,
}: {
  item: StockItem; onOpen: () => void; onConsume?: () => void; last?: boolean; subtitle?: 'brand' | 'urgency';
}) {
  const meta = subtitle === 'urgency'
    ? `${qtyLabel(item.qty, item.unit)} · ${item.locationName}`
    : [item.brand, qtyLabel(item.qty, item.unit), item.locationName].filter(Boolean).join(' · ');

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
        borderBottom: last ? 'none' : '1px solid var(--line)',
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0,
          background: 'none', border: 'none', padding: 0, color: 'inherit',
        }}
      >
        <Thumb name={item.name} src={item.imageUrl} />
        <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <span className="ellipsis" style={{ display: 'block', fontSize: 16, fontWeight: 600, lineHeight: 1.25 }}>
            {item.name}
          </span>
          <span
            className="ellipsis"
            style={{ display: 'block', fontSize: 12.5, lineHeight: 1.35, color: 'var(--fg-3)', marginTop: 3 }}
          >
            {meta}
          </span>
          {(item.openedAt || item.frozenAt) && (
            <span style={{ display: 'flex', gap: 6, marginTop: 5 }}>
              {item.openedAt && <Tag tone="var(--accent)">Ouvert</Tag>}
              {item.frozenAt && <Tag tone="#64D2FF">Congelé</Tag>}
            </span>
          )}
        </span>
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flex: 'none' }}>
        <Pill color={URGENCY_COLOR[item.urgency]} tint={URGENCY_TINT[item.urgency]}>
          {urgencyBadge(item.urgency, item.daysLeft)}
        </Pill>
        {onConsume && (
          <button
            type="button"
            onClick={onConsume}
            style={{
              padding: '7px 13px', borderRadius: 999, border: 'none',
              background: 'rgba(255,255,255,.1)', color: 'var(--fg)', font: '600 12.5px/1 var(--sans)',
              whiteSpace: 'nowrap',
            }}
          >
            −1 consommé
          </button>
        )}
      </div>
    </div>
  );
}

function Tag({ tone, children }: { tone: string; children: string }) {
  return (
    <span
      className="mono"
      style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: '.06em', textTransform: 'uppercase', color: tone }}
    >
      {children}
    </span>
  );
}
