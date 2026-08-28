import { useState } from 'react';
import { Button, Card, Screen, Title } from '../components/ui';
import { useResource } from '../hooks';
import { api } from '../lib/api';
import { useStore } from '../store';

type Item = { id: string; label: string; qty: number; productId: string | null; checked: boolean };

/** Ce qui est tombé à zéro atterrit ici, et tout ajout manuel aussi. */
export function Shopping() {
  const { run, touch, refreshPending } = useStore();
  const { data } = useResource<Item[]>('/shopping');
  const [label, setLabel] = useState('');

  const items = data ?? [];
  const todo = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);

  const done_ = async () => { touch(); await refreshPending(); };

  const add = async () => {
    const l = label.trim();
    if (!l) return;
    const entry = { id: crypto.randomUUID(), label: l, qty: 1 };
    const ok = await run(() => api.queued('POST', '/shopping', entry,
      { kind: 'shoppingAdd', item: { ...entry, productId: null, checked: false } }));
    if (!ok) return;
    setLabel('');
    await done_();
  };

  const toggle = async (item: Item) => {
    const ok = await run(() => api.queued('PATCH', `/shopping/${item.id}`, { checked: !item.checked },
      { kind: 'shoppingCheck', id: item.id, checked: !item.checked }));
    if (ok) await done_();
  };

  const remove = async (item: Item) => {
    const ok = await run(() => api.queued('DELETE', `/shopping/${item.id}`, undefined,
      { kind: 'shoppingRemove', id: item.id }));
    if (ok) await done_();
  };

  return (
    <Screen>
      <Title sub="Un produit épuisé peut être envoyé ici depuis le stock.">Liste de courses</Title>

      <div style={{ display: 'flex', gap: 9, marginTop: 18 }}>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          placeholder="Ajouter un article"
          style={{
            flex: 1, minWidth: 0, background: 'var(--card)', border: 'none', borderRadius: 14,
            padding: '13px 15px', fontSize: 15, color: 'var(--fg)',
          }}
        />
        <Button variant="primary" onClick={add} disabled={!label.trim()} style={{ width: 'auto', padding: '13px 20px', fontSize: 15 }}>
          Ajouter
        </Button>
      </div>

      {todo.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          {todo.map((i, idx, arr) => (
            <ShoppingRow key={i.id} item={i} last={idx === arr.length - 1} onToggle={() => toggle(i)} onRemove={() => remove(i)} />
          ))}
        </Card>
      )}

      {done.length > 0 && (
        <>
          <div style={{ fontSize: 13, color: 'var(--fg-3)', margin: '22px 2px 9px' }}>Pris</div>
          <Card style={{ opacity: .55 }}>
            {done.map((i, idx, arr) => (
              <ShoppingRow key={i.id} item={i} last={idx === arr.length - 1} onToggle={() => toggle(i)} onRemove={() => remove(i)} />
            ))}
          </Card>
        </>
      )}

      {items.length === 0 && (
        <div style={{ marginTop: 30, textAlign: 'center', color: 'var(--fg-2)', fontSize: 14 }}>
          La liste est vide.
        </div>
      )}
    </Screen>
  );
}

function ShoppingRow({
  item, last, onToggle, onRemove,
}: { item: Item; last: boolean; onToggle: () => void; onRemove: () => void }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
        borderBottom: last ? 'none' : '1px solid var(--line)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.checked ? 'Remettre dans la liste' : 'Marquer comme pris'}
        style={{
          width: 22, height: 22, borderRadius: '50%', flex: 'none', padding: 0,
          border: `2px solid ${item.checked ? 'var(--green)' : 'rgba(235,235,245,.35)'}`,
          background: item.checked ? 'var(--green)' : 'transparent',
          color: 'var(--on-accent)', fontSize: 12, lineHeight: 1,
        }}
      >
        {item.checked ? '✓' : ''}
      </button>
      <span
        className="ellipsis"
        style={{ flex: 1, fontSize: 16, textDecoration: item.checked ? 'line-through' : undefined }}
      >
        {item.label}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Retirer"
        style={{ background: 'none', border: 'none', color: 'var(--fg-4)', fontSize: 17, padding: '4px 6px' }}
      >
        ×
      </button>
    </div>
  );
}
