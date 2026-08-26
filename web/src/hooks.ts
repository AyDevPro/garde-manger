import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './lib/api';
import { useStore } from './store';
import type { StockItem } from './types';

/**
 * Retour à l'écran d'où l'on vient, pas à un parent supposé : l'historique est
 * atteignable depuis l'accueil comme depuis les réglages. `fallback` ne sert
 * qu'à l'ouverture directe d'une URL, quand il n'y a rien derrière.
 */
export function useGoBack(fallback: string) {
  const nav = useNavigate();
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof idx === 'number' && idx > 0) nav(-1);
    else nav(fallback, { replace: true });
  }, [nav, fallback]);
}

/** Charge une ressource et la recharge à chaque écriture (revision). */
export function useResource<T>(path: string | null, deps: unknown[] = []) {
  const { revision, run, auth } = useStore();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (path === null || auth !== 'in') return;
    const ac = new AbortController();
    let alive = true;
    setLoading(true);
    run(() => api.get<T>(path, ac.signal)).then((d) => {
      if (!alive) return;
      if (d !== undefined) setData(d);
      setLoading(false);
    });
    return () => { alive = false; ac.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, revision, auth, ...deps]);

  return { data, loading, setData };
}

/**
 * Les gestes rapides du stock. Chacun confirme par un bandeau et propose
 * « Annuler » : c'est ce qui rend le −1 consommé sans risque.
 */
export function useStockActions(onDepleted?: (item: StockItem) => void) {
  const { run, touch, showToast } = useStore();

  const consume = useCallback(async (item: StockItem, qty = 1) => {
    const before = item.qty;
    const r = await run(() => api.post<{ item: StockItem; depleted: boolean; productName: string }>(
      `/batches/${item.id}/consume`, { qty },
    ));
    if (!r) return;
    touch();
    if (r.depleted) onDepleted?.(r.item);
    else {
      showToast(`−${qty} ${r.productName} · reste ${r.item.qty} ${r.item.unit}`, async () => {
        await run(() => api.patch(`/batches/${item.id}`, { qty: before }));
        touch();
      });
    }
  }, [run, touch, showToast, onDepleted]);

  const close = useCallback(async (item: StockItem, reason: 'consumed' | 'trashed') => {
    const before = item.qty;
    const r = await run(() => api.post<{ productName: string }>(`/batches/${item.id}/close`, { reason }));
    if (!r) return;
    touch();
    showToast(
      reason === 'trashed' ? `${r.productName} jeté · retiré du stock` : `${r.productName} terminé`,
      async () => {
        await run(() => api.post(`/batches/${item.id}/reopen`, { qty: before }));
        touch();
      },
    );
  }, [run, touch, showToast]);

  const move = useCallback(async (item: StockItem, locationId: string | null) => {
    const from = item.locationId;
    const r = await run(() => api.post<{ destination: string | null }>(`/batches/${item.id}/move`, { locationId }));
    if (!r) return;
    touch();
    showToast(`${item.name} déplacé vers ${r.destination ?? 'aucun emplacement'}`, async () => {
      await run(() => api.post(`/batches/${item.id}/move`, { locationId: from }));
      touch();
    });
  }, [run, touch, showToast]);

  const setOpened = useCallback(async (item: StockItem, openedAt: string | null, daysAfterOpening?: number | null) => {
    const r = await run(() => api.post<StockItem>(`/batches/${item.id}/open`, { openedAt, daysAfterOpening }));
    if (!r) return;
    touch();
    showToast(
      openedAt
        ? r.dateFromOpening
          ? `Ouvert · à consommer avant le ${r.effectiveDate}`
          : `${item.name} marqué comme ouvert`
        : 'Ouverture annulée',
    );
  }, [run, touch, showToast]);

  return { consume, close, move, setOpened };
}
