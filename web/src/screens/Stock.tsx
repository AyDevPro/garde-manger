import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { StockRow } from '../components/StockRow';
import { Button, Card, Chip, Empty, Screen, Spinner } from '../components/ui';
import { ZeroSheet } from './sheets';
import { useResource, useStockActions } from '../hooks';
import { URGENCY_LABEL } from '../lib/format';
import { useStore } from '../store';
import type { StockItem, Urgency } from '../types';

const SORTS = [
  { key: 'date', label: 'Péremption' },
  { key: 'name', label: 'Nom' },
  { key: 'location', label: 'Emplacement' },
  { key: 'recent', label: 'Ajout récent' },
] as const;

export function Stock() {
  const nav = useNavigate();
  const { locations, categories } = useStore();
  const [params, setParams] = useSearchParams();
  const [zero, setZero] = useState<StockItem | null>(null);
  const [sortOpen, setSortOpen] = useState(false);

  const bucket = params.get('bucket') ?? '';
  const locationId = params.get('location') ?? '';
  const categoryId = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'date';
  const flag = params.get('flag') ?? '';

  // La frappe ne doit pas déclencher une requête par caractère.
  const [text, setText] = useState(params.get('q') ?? '');
  const [query, setQuery] = useState(text);
  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 220);
    return () => clearTimeout(t);
  }, [text]);

  const path = useMemo(() => {
    const sp = new URLSearchParams();
    if (query) sp.set('q', query);
    if (bucket) sp.set('bucket', bucket);
    if (locationId) sp.set('location', locationId);
    if (categoryId) sp.set('category', categoryId);
    if (flag) sp.set(flag, '1');
    sp.set('sort', sort);
    return `/stock?${sp}`;
  }, [query, bucket, locationId, categoryId, flag, sort]);

  const { data, loading } = useResource<StockItem[]>(path);
  const { consume } = useStockActions(setZero);

  const patch = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '') sp.delete(k);
      else sp.set(k, v);
    }
    setParams(sp, { replace: true });
  };

  const title = bucket
    ? URGENCY_LABEL[bucket as Urgency] ?? 'Urgent'
    : locationId
      ? locations.find((l) => l.id === locationId)?.name ?? 'Stock'
      : categoryId
        ? categories.find((c) => c.id === categoryId)?.name ?? 'Stock'
        : flag === 'opened' ? 'Produits ouverts'
        : flag === 'favorite' ? 'Favoris'
        : 'Tout le stock';

  const items = data ?? [];
  const hasFilter = Boolean(bucket || locationId || categoryId || flag || query);

  return (
    <Screen pad={false}>
      <div style={{ padding: '0 20px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={() => nav('/')}
            aria-label="Retour"
            style={{
              width: 38, height: 38, borderRadius: '50%', background: 'var(--card)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
            }}
          >
            ‹
          </button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: 700 }}>{title}</div>
          <button
            type="button"
            onClick={() => setSortOpen((v) => !v)}
            aria-label="Trier"
            style={{
              width: 38, height: 38, borderRadius: '50%', border: 'none',
              background: sortOpen ? 'var(--accent)' : 'var(--card)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2.5,
            }}
          >
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: 3.5, height: 3.5, borderRadius: '50%', background: sortOpen ? 'var(--on-accent)' : '#fff' }} />
            ))}
          </button>
        </div>

        <label
          style={{
            display: 'flex', alignItems: 'center', gap: 10, marginTop: 14,
            padding: '11px 15px', background: 'var(--card)', borderRadius: 14,
          }}
        >
          <span style={{ width: 14, height: 14, border: '2px solid rgba(235,235,245,.4)', borderRadius: '50%', flex: 'none' }} />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            type="search"
            inputMode="search"
            placeholder="Rechercher un produit, une marque…"
            style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', fontSize: 15, color: 'var(--fg)' }}
          />
          {text && (
            <button
              type="button"
              onClick={() => setText('')}
              aria-label="Effacer"
              style={{ background: 'none', border: 'none', color: 'var(--fg-3)', fontSize: 16, padding: 0 }}
            >
              ×
            </button>
          )}
        </label>

        {sortOpen && (
          <div className="hscroll" style={{ display: 'flex', gap: 7, marginTop: 10 }}>
            {SORTS.map((s) => (
              <Chip key={s.key} label={s.label} active={sort === s.key} onClick={() => patch({ sort: s.key })} />
            ))}
          </div>
        )}

        <div className="hscroll" style={{ display: 'flex', gap: 7, marginTop: 12, paddingBottom: 2 }}>
          <Chip label="Tous" active={!hasFilter} onClick={() => setParams({}, { replace: true })} />
          <Chip
            label="Urgent"
            active={bucket === 'urgent'}
            onClick={() => patch({ bucket: bucket === 'urgent' ? null : 'urgent', location: null, category: null, flag: null })}
          />
          <Chip
            label="Ouverts"
            active={flag === 'opened'}
            onClick={() => patch({ flag: flag === 'opened' ? null : 'opened' })}
          />
          {locations.map((l) => (
            <Chip
              key={l.id}
              label={l.name}
              active={locationId === l.id}
              onClick={() => patch({ location: locationId === l.id ? null : l.id, bucket: null, category: null })}
            />
          ))}
          {categories.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              active={categoryId === c.id}
              onClick={() => patch({ category: categoryId === c.id ? null : c.id, bucket: null, location: null })}
            />
          ))}
        </div>
      </div>

      <div style={{ padding: '8px 20px 0' }}>
        {loading && !data ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 50 }}><Spinner /></div>
        ) : items.length ? (
          <>
            <Card>
              {items.map((item, i, arr) => (
                <StockRow
                  key={item.id}
                  item={item}
                  last={i === arr.length - 1}
                  onOpen={() => nav(`/produit/${item.id}`)}
                  onConsume={() => consume(item)}
                />
              ))}
            </Card>
            <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--fg-4)', marginTop: 14 }}>
              {items.length} lot{items.length > 1 ? 's' : ''} affiché{items.length > 1 ? 's' : ''}
            </div>
          </>
        ) : (
          <Empty
            title="Aucun produit ici"
            hint={query ? `Aucun résultat pour « ${query} ».` : `Rien de rangé dans ${title.toLowerCase()} pour le moment.`}
            action={
              <Button variant="primary" onClick={() => nav('/scanner')} style={{ width: 'auto', display: 'inline-block', padding: '12px 20px', fontSize: 14 }}>
                Scanner un produit
              </Button>
            }
          />
        )}
      </div>

      <ZeroSheet item={zero} onClose={() => setZero(null)} />
    </Screen>
  );
}
