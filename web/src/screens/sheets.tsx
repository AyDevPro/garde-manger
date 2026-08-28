import { Sheet, SheetActions, SheetKicker, SheetText, SheetTitle } from '../components/Sheet';
import { Button } from '../components/ui';
import { useStockActions } from '../hooks';
import { api } from '../lib/api';
import { useStore } from '../store';
import type { StockItem } from '../types';

/**
 * Quantité tombée à zéro : le lot reste ou sort, et peut partir vers la liste
 * de courses. C'est le seul moment où l'app pose une question après un « −1 ».
 */
export function ZeroSheet({ item, onClose }: { item: StockItem | null; onClose: () => void }) {
  const { run, touch, showToast, refreshPending } = useStore();
  const { close } = useStockActions();
  if (!item) return null;

  return (
    <Sheet open onClose={onClose}>
      <SheetKicker tone="rgba(235,235,245,.45)">Quantité zéro</SheetKicker>
      <SheetTitle>{item.name} est épuisé</SheetTitle>
      <SheetText>Le retirer du stock, ou le garder à zéro pour la liste de courses ?</SheetText>
      <SheetActions>
        <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>Garder à 0</Button>
        <Button
          variant="primary"
          style={{ flex: 1 }}
          onClick={async () => { onClose(); await close(item, 'consumed'); }}
        >
          Retirer du stock
        </Button>
      </SheetActions>
      <Button
        variant="plain"
        style={{ marginTop: 10, fontSize: 15 }}
        onClick={async () => {
          onClose();
          const entry = { id: crypto.randomUUID(), label: item.name, productId: item.productId, qty: 1 };
          const ok = await run(() => api.queued('POST', '/shopping', entry,
            { kind: 'shoppingAdd', item: { ...entry, checked: false } }));
          if (!ok) return;
          touch();
          await refreshPending();
          showToast(`${item.name} ajouté à la liste de courses`);
        }}
      >
        Ajouter à la liste de courses
      </Button>
    </Sheet>
  );
}

export function ConfirmSheet({
  open, onClose, title, text, confirmLabel, onConfirm, danger, kicker,
}: {
  open: boolean; onClose: () => void; title: string; text?: string;
  confirmLabel: string; onConfirm: () => void | Promise<void>; danger?: boolean; kicker?: string;
}) {
  return (
    <Sheet open={open} onClose={onClose}>
      {kicker && <SheetKicker tone="var(--orange)">{kicker}</SheetKicker>}
      <SheetTitle>{title}</SheetTitle>
      {text && <SheetText>{text}</SheetText>}
      <SheetActions>
        <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>Annuler</Button>
        <Button
          variant={danger ? 'plain' : 'primary'}
          onClick={async () => { onClose(); await onConfirm(); }}
          style={danger ? { flex: 1, background: 'var(--red)', color: '#fff' } : { flex: 1 }}
        >
          {confirmLabel}
        </Button>
      </SheetActions>
    </Sheet>
  );
}

/** Choix d'emplacement — sert au déplacement depuis la fiche produit. */
export function LocationSheet({
  open, onClose, currentId, onPick, title = 'Déplacer vers',
}: {
  open: boolean; onClose: () => void; currentId: string | null;
  onPick: (id: string) => void; title?: string;
}) {
  const { locations } = useStore();
  return (
    <Sheet open={open} onClose={onClose}>
      <SheetTitle>{title}</SheetTitle>
      <div style={{ marginTop: 18, background: 'var(--card-2)', borderRadius: 18, overflow: 'hidden' }}>
        {locations.map((l, i, arr) => (
          <button
            key={l.id}
            type="button"
            disabled={l.id === currentId}
            onClick={() => { onClose(); onPick(l.id); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 13, width: '100%', padding: '15px 16px',
              border: 'none', background: 'transparent', color: 'inherit',
              opacity: l.id === currentId ? .4 : 1,
              borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--line)',
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 3, background: l.tone, flex: 'none' }} />
            <span style={{ flex: 1, textAlign: 'left', fontSize: 16.5 }}>{l.name}</span>
            {l.id === currentId && <span style={{ fontSize: 13, color: 'var(--fg-3)' }}>ici</span>}
          </button>
        ))}
      </div>
      <Button variant="ghost" onClick={onClose} style={{ marginTop: 12 }}>Annuler</Button>
    </Sheet>
  );
}
