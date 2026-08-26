import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BackHeader, Button, Card, Screen, Title } from '../components/ui';
import { ConfirmSheet } from './sheets';
import { api } from '../lib/api';
import { useGoBack } from '../hooks';
import { useDragReorder } from '../lib/useDragReorder';
import { useStore } from '../store';
import type { Category, Location } from '../types';

const TONES = ['#0A84FF', '#64D2FF', '#FF9F0A', '#BF5AF2', '#30D158', '#AC8E68', '#FF453A', '#5E5CE6'];

/** Écran partagé par « Emplacements » et « Catégories » : mêmes gestes, même forme. */
export function Manage() {
  const { kind } = useParams<{ kind: string }>();
  const isCat = kind === 'categories';
  const nav = useNavigate();
  const goBack = useGoBack('/reglages');
  const { locations, categories, refreshTaxonomy, run, touch, showToast } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [tone, setTone] = useState(TONES[0]);
  const [removing, setRemoving] = useState<Location | Category | null>(null);

  const rows = isCat ? categories : locations;
  const base = isCat ? '/categories' : '/locations';

  const reset = () => { setEditing(null); setName(''); setTone(TONES[0]); };

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const ok = editing === 'new'
      ? await run(() => api.post(base, { name: trimmed, tone }))
      : await run(() => api.patch(`${base}/${editing}`, { name: trimmed, tone }));
    if (!ok) return;
    await refreshTaxonomy();
    touch();
    showToast(editing === 'new' ? `${trimmed} créé` : `${trimmed} mis à jour`);
    reset();
  }

  const commitOrder = useCallback(async (ids: string[]) => {
    const ok = await run(() => api.post(`${base}/reorder`, { ids }));
    if (ok) { await refreshTaxonomy(); touch(); }
  }, [base, run, refreshTaxonomy, touch]);

  const { order, draggingId, registerRow, rowHandlers, rowStyle, moveBy } =
    useDragReorder(rows.map((r) => r.id), commitOrder);

  // La liste suit l'ordre affiché par le glissement, pas celui du serveur.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = order.map((id) => byId.get(id)).filter(Boolean) as typeof rows;

  return (
    <Screen>
      <BackHeader onBack={goBack}>Retour</BackHeader>
      <div style={{ marginTop: 16 }}>
        <Title sub={isCat
          ? 'Regroupez les produits pour filtrer le stock plus vite.'
          : 'L’ordre est repris dans le formulaire d’ajout : mettez en tête ce que vous rangez le plus.'}>
          {isCat ? 'Catégories' : 'Emplacements'}
        </Title>
      </div>

      <Card style={{ marginTop: 18, overflow: draggingId ? 'visible' : 'hidden' }}>
        {ordered.map((r, i, arr) => {
          const dragging = draggingId === r.id;
          return (
            <div
              key={r.id}
              ref={registerRow(r.id)}
              {...rowHandlers(r.id, i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px',
                borderBottom: i === arr.length - 1 || dragging ? 'none' : '1px solid var(--line)',
                // pan-y laisse défiler la liste ; l'appui long, lui, ne bouge pas.
                touchAction: 'pan-y',
                WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none',
                ...rowStyle(r.id, i),
              }}
            >
              <button
                type="button"
                aria-label={`Réordonner ${r.name} — appui long pour glisser, flèches haut et bas au clavier`}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp') { e.preventDefault(); moveBy(r.id, -1); }
                  if (e.key === 'ArrowDown') { e.preventDefault(); moveBy(r.id, 1); }
                }}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 3.5, flex: 'none',
                  background: 'none', border: 'none', padding: '8px 4px',
                  opacity: dragging ? 1 : .35, cursor: 'grab', touchAction: 'none',
                }}
              >
                {[0, 1, 2].map((k) => (
                  <span key={k} style={{ width: 15, height: 1.5, background: '#fff', display: 'block' }} />
                ))}
              </button>
              <span style={{ width: 10, height: 10, borderRadius: 3, flex: 'none', background: r.tone }} />
              <span className="ellipsis" style={{ flex: 1, fontSize: 16.5 }}>{r.name}</span>
              <span className="mono" style={{ fontSize: 14, fontWeight: 500, color: 'rgba(235,235,245,.4)' }}>{r.count}</span>
              <button
                type="button"
                onClick={() => { setEditing(r.id); setName(r.name); setTone(r.tone); }}
                style={{ background: 'none', border: 'none', font: '600 13px/1 var(--sans)', color: 'var(--accent)', padding: '6px 6px' }}
              >
                Modifier
              </button>
              <button
                type="button"
                onClick={() => setRemoving(r)}
                aria-label={`Supprimer ${r.name}`}
                style={{ background: 'none', border: 'none', color: 'var(--fg-4)', fontSize: 17, padding: '6px 4px' }}
              >
                ×
              </button>
            </div>
          );
        })}
      </Card>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--fg-4)', margin: '10px 2px 0' }}>
        Appui long sur une ligne pour la déplacer.
      </div>

      {editing ? (
        <Card style={{ marginTop: 12, padding: 16 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isCat ? 'Nom de la catégorie' : 'Nom de l’emplacement'}
            autoFocus
            style={{
              width: '100%', background: 'var(--card-2)', border: 'none', borderRadius: 12,
              padding: '13px 15px', fontSize: 16, color: 'var(--fg)',
            }}
          />
          <div style={{ display: 'flex', gap: 9, marginTop: 14, flexWrap: 'wrap' }}>
            {TONES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                aria-label={`Couleur ${t}`}
                style={{
                  width: 28, height: 28, borderRadius: 9, background: t,
                  border: tone === t ? '2px solid #fff' : '2px solid transparent',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <Button variant="ghost" onClick={reset} style={{ flex: 1, padding: 13, fontSize: 15 }}>Annuler</Button>
            <Button variant="primary" onClick={submit} disabled={!name.trim()} style={{ flex: 1, padding: 13, fontSize: 15 }}>
              Enregistrer
            </Button>
          </div>
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => { setEditing('new'); setName(''); }}
          style={{
            display: 'block', width: '100%', marginTop: 12, padding: 16, borderRadius: 18, border: 'none',
            background: 'rgba(245,166,35,.14)', color: 'var(--accent)', font: '600 15px/1 var(--sans)',
          }}
        >
          + {isCat ? 'Nouvelle catégorie' : 'Nouvel emplacement'}
        </button>
      )}

      <ConfirmSheet
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        danger
        title={`Supprimer ${removing?.name} ?`}
        text={removing && removing.count > 0
          ? `${removing.count} produit(s) s'y trouvent encore. Déplacez-les d'abord.`
          : 'Les produits passés y resteront rattachés dans l’historique.'}
        confirmLabel="Supprimer"
        onConfirm={async () => {
          const target = removing!;
          const ok = await run(() => api.del(`${base}/${target.id}`));
          if (!ok) return;
          await refreshTaxonomy();
          touch();
          showToast(`${target.name} supprimé`);
        }}
      />
    </Screen>
  );
}
