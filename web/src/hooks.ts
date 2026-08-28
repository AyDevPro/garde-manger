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
 * Les gestes rapides du stock. Chacun est calculé localement puis envoyé : si
 * le réseau manque, l'écriture part en file et l'écran affiche déjà le résultat.
 * « Annuler » empile l'action inverse, qui suivra le même chemin.
 */
export function useStockActions(onDepleted?: (item: StockItem) => void) {
  const { run, touch, showToast, refreshPending, locations } = useStore();

  const after = useCallback(async () => {
    touch();
    await refreshPending();
  }, [touch, refreshPending]);

  const consume = useCallback(async (item: StockItem, qty = 1) => {
    const rest = Math.max(0, Number((item.qty - qty).toFixed(2)));
    const ok = await run(() => api.queued(
      'POST', `/batches/${item.id}/consume`, { qty },
      { kind: 'consume', batchId: item.id, qty },
    ));
    if (!ok) return;
    await after();
    if (rest === 0) { onDepleted?.({ ...item, qty: 0 }); return; }
    showToast(`−${qty} ${item.name} · reste ${rest} ${item.unit}`, async () => {
      await run(() => api.queued(
        'PATCH', `/batches/${item.id}`, { qty: item.qty },
        { kind: 'patchBatch', batchId: item.id, fields: { qty: item.qty } },
      ));
      await after();
    });
  }, [run, after, showToast, onDepleted]);

  const close = useCallback(async (item: StockItem, reason: 'consumed' | 'trashed') => {
    const ok = await run(() => api.queued(
      'POST', `/batches/${item.id}/close`, { reason },
      { kind: 'close', batchId: item.id, reason },
    ));
    if (!ok) return;
    await after();
    showToast(
      reason === 'trashed' ? `${item.name} jeté · retiré du stock` : `${item.name} terminé`,
      async () => {
        await run(() => api.queued(
          'POST', `/batches/${item.id}/reopen`, { qty: item.qty },
          { kind: 'reopen', item },
        ));
        await after();
      },
    );
  }, [run, after, showToast]);

  const move = useCallback(async (item: StockItem, locationId: string | null) => {
    const destination = locations.find((l) => l.id === locationId);
    const ok = await run(() => api.queued(
      'POST', `/batches/${item.id}/move`, { locationId },
      { kind: 'move', batchId: item.id, locationId, locationName: destination?.name ?? 'Sans emplacement' },
    ));
    if (!ok) return;
    await after();
    showToast(`${item.name} déplacé vers ${destination?.name ?? 'aucun emplacement'}`, async () => {
      await run(() => api.queued(
        'POST', `/batches/${item.id}/move`, { locationId: item.locationId },
        { kind: 'move', batchId: item.id, locationId: item.locationId, locationName: item.locationName },
      ));
      await after();
    });
  }, [run, after, showToast, locations]);

  const setOpened = useCallback(async (
    item: StockItem, openedAt: string | null, daysAfterOpening?: number | null,
  ) => {
    const ok = await run(() => api.queued(
      'POST', `/batches/${item.id}/open`, { openedAt, daysAfterOpening },
      { kind: 'open', batchId: item.id, openedAt },
    ));
    if (!ok) return;
    await after();
    showToast(openedAt ? `${item.name} marqué comme ouvert` : 'Ouverture annulée');
  }, [run, after, showToast]);

  return { consume, close, move, setOpened };
}
