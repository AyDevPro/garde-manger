import { useCallback, useEffect, useRef, useState } from 'react';

/** Durée d'appui avant que la ligne se « décolle », comme les icônes d'iOS. */
const HOLD_MS = 380;
/** Au-delà, le geste est un défilement, pas un appui long. */
const MOVE_TOLERANCE = 8;

type Drag = { id: string; from: number; height: number; startY: number; dy: number };

/**
 * Réordonnancement par appui long puis glissement, au doigt comme à la souris.
 * L'ordre est appliqué localement pendant le geste et confirmé au relâchement.
 */
export function useDragReorder(ids: string[], onCommit: (ids: string[]) => void) {
  const [order, setOrder] = useState<string[]>(ids);
  const [drag, setDrag] = useState<Drag | null>(null);

  const rows = useRef(new Map<string, HTMLElement>());
  const holdTimer = useRef<number | undefined>(undefined);
  const pending = useRef<{ id: string; x: number; y: number; pointerId: number; el: HTMLElement } | null>(null);
  // La position vit aussi dans une ref : les gestionnaires de pointeur en ont
  // besoin sans attendre un rendu.
  const dragRef = useRef<Drag | null>(null);
  const orderRef = useRef<string[]>(ids);
  orderRef.current = order;

  // Hors glissement, on suit la liste du parent.
  const signature = ids.join('|');
  useEffect(() => {
    if (!dragRef.current) setOrder(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const registerRow = useCallback((id: string) => (el: HTMLElement | null) => {
    if (el) rows.current.set(id, el);
    else rows.current.delete(id);
  }, []);

  /** Index de dépôt : combien de hauteurs de ligne le doigt a parcourues. */
  const overIndex = (d: Drag) =>
    Math.min(orderRef.current.length - 1, Math.max(0, d.from + Math.round(d.dy / d.height)));

  const cancelHold = () => {
    window.clearTimeout(holdTimer.current);
    pending.current = null;
  };

  const stopDrag = useCallback((commit: boolean) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    document.body.style.removeProperty('user-select');
    if (!d) return;

    const to = overIndex(d);
    if (!commit || to === d.from) return;
    const next = orderRef.current.slice();
    next.splice(to, 0, next.splice(d.from, 1)[0]);
    setOrder(next);
    onCommit(next);
  }, [onCommit]);

  // Pendant le glissement, la page ne doit pas défiler sous le doigt.
  useEffect(() => {
    if (!drag) return;
    const block = (e: TouchEvent) => e.preventDefault();
    document.addEventListener('touchmove', block, { passive: false });
    return () => document.removeEventListener('touchmove', block);
  }, [drag]);

  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  const rowHandlers = (id: string, index: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      const el = e.currentTarget;
      pending.current = { id, x: e.clientX, y: e.clientY, pointerId: e.pointerId, el };
      window.clearTimeout(holdTimer.current);
      holdTimer.current = window.setTimeout(() => {
        const p = pending.current;
        if (!p) return;
        pending.current = null;
        const height = p.el.getBoundingClientRect().height;
        const started: Drag = { id, from: index, height, startY: p.y, dy: 0 };
        dragRef.current = started;
        setDrag(started);
        document.body.style.setProperty('user-select', 'none');
        navigator.vibrate?.(18);
        try { p.el.setPointerCapture(p.pointerId); } catch { /* capture facultative */ }
      }, HOLD_MS);
    },

    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const p = pending.current;
      if (p) {
        // Le doigt bouge avant la fin de l'appui : c'est un défilement.
        if (Math.abs(e.clientY - p.y) > MOVE_TOLERANCE || Math.abs(e.clientX - p.x) > MOVE_TOLERANCE) cancelHold();
        return;
      }
      const d = dragRef.current;
      if (!d || d.id !== id) return;
      e.preventDefault();
      const next = { ...d, dy: e.clientY - d.startY };
      dragRef.current = next;
      setDrag(next);
    },

    onPointerUp: () => { cancelHold(); stopDrag(true); },
    onPointerCancel: () => { cancelHold(); stopDrag(false); },
    onContextMenu: (e: React.MouseEvent) => { if (dragRef.current) e.preventDefault(); },
  });

  /** Déplacement au clavier, pour qui n'utilise pas le tactile. */
  const moveBy = useCallback((id: string, delta: number) => {
    const from = orderRef.current.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= orderRef.current.length) return;
    const next = orderRef.current.slice();
    next.splice(to, 0, next.splice(from, 1)[0]);
    setOrder(next);
    onCommit(next);
  }, [onCommit]);

  /** Décalage visuel d'une ligne pendant le glissement. */
  const rowStyle = (id: string, index: number): React.CSSProperties => {
    if (!drag) return { transition: 'transform .18s ease' };
    if (drag.id === id) {
      return {
        transform: `translateY(${drag.dy}px) scale(1.02)`,
        zIndex: 2,
        position: 'relative',
        boxShadow: '0 14px 30px rgba(0,0,0,.55)',
        background: 'var(--card-hi)',
        borderRadius: 14,
      };
    }
    const to = overIndex(drag);
    let shift = 0;
    if (drag.from < to && index > drag.from && index <= to) shift = -drag.height;
    else if (drag.from > to && index >= to && index < drag.from) shift = drag.height;
    return { transform: `translateY(${shift}px)`, transition: 'transform .18s ease' };
  };

  return { order, draggingId: drag?.id ?? null, registerRow, rowHandlers, rowStyle, moveBy };
}
