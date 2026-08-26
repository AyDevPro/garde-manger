import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Eyebrow, Row, Screen, Spinner, Thumb } from '../components/ui';
import { StockRow } from '../components/StockRow';
import { ConfirmSheet, LocationSheet, ZeroSheet } from './sheets';
import { useGoBack, useResource, useStockActions } from '../hooks';
import { api } from '../lib/api';
import {
  DATE_TYPE_LABEL, HERO, MOVEMENT_LABEL, frDate, qtyLabel, urgencyBadge,
} from '../lib/format';
import { useStore } from '../store';
import type { Movement, StockItem } from '../types';

type Detail = { item: StockItem; otherBatches: StockItem[]; history: Movement[] };

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const goBack = useGoBack('/stock');
  const { setDraft, run, touch, showToast } = useStore();
  const [zero, setZero] = useState<StockItem | null>(null);
  const [sheet, setSheet] = useState<'delete' | 'move' | 'trash' | null>(null);

  const { data, loading } = useResource<Detail>(id ? `/stock/${id}` : null);
  const { consume, close, move, setOpened } = useStockActions(setZero);

  if (loading && !data) {
    return <Screen><div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Spinner /></div></Screen>;
  }
  if (!data) {
    return (
      <Screen>
        <div style={{ paddingTop: 60, textAlign: 'center', color: 'var(--fg-2)' }}>Ce produit n’est plus dans le stock.</div>
        <Button variant="plain" onClick={() => nav('/stock')} style={{ marginTop: 20 }}>Retour au stock</Button>
      </Screen>
    );
  }

  const { item, otherBatches, history } = data;

  const dateRowLabel = item.dateType === 'NONE' ? 'Date' : `Date · ${item.dateType}`;
  const stats = [
    { k: 'Quantité', v: String(item.qty), u: item.unit },
    {
      k: item.daysLeft === null ? 'Expire' : item.daysLeft < 0 ? 'Expiré depuis' : 'Expire dans',
      v: item.daysLeft === null ? '—' : String(Math.abs(item.daysLeft)),
      u: 'jours',
    },
    { k: 'Lots', v: String(otherBatches.length + 1), u: otherBatches.length ? 'au total' : 'seul' },
  ];

  return (
    <Screen pad={false}>
      <div style={{ position: 'relative', padding: '0 20px 22px', background: HERO[item.urgency], borderRadius: '0 0 28px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 }}>
          <button
            type="button"
            onClick={goBack}
            aria-label="Retour"
            style={{
              width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,0,0,.28)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19,
            }}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => run(() => api.patch(`/products/${item.productId}`, { isFavorite: !item.isFavorite }))
              .then((ok) => { if (ok) { touch(); showToast(item.isFavorite ? 'Retiré des favoris' : 'Ajouté aux favoris'); } })}
            aria-label={item.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            style={{
              width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,0,0,.28)', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17,
              color: item.isFavorite ? 'var(--accent)' : '#fff',
            }}
          >
            {item.isFavorite ? '★' : '☆'}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
          <Thumb name={item.name} src={item.imageUrl} size={104} />
        </div>
        <h1 style={{ textAlign: 'center', font: '700 29px/1.12 var(--sans)', letterSpacing: '-.02em', margin: '16px 0 0' }}>
          {item.name}
        </h1>
        <div style={{ textAlign: 'center', fontSize: 13.5, color: 'rgba(255,255,255,.7)', marginTop: 6 }}>
          {[item.brand, item.categoryName, item.packageText].filter(Boolean).join(' · ') || 'Sans marque'}
        </div>

        <div style={{ display: 'flex', gap: 11, marginTop: 20 }}>
          <HeroButton onClick={() => setSheet('trash')}>Jeter</HeroButton>
          <HeroButton onClick={() => consume(item)}>Consommer</HeroButton>
        </div>
      </div>

      <div style={{ display: 'flex', margin: '18px 20px 0', padding: '16px 0', background: 'var(--card)', borderRadius: 22 }}>
        {stats.map((s, i) => (
          <div key={s.k} style={{ flex: 1, textAlign: 'center', borderRight: i === stats.length - 1 ? 'none' : '1px solid rgba(255,255,255,.08)' }}>
            <div style={{ fontSize: 12.5, color: 'var(--fg-2)' }}>{s.k}</div>
            <div className="mono" style={{ font: '700 26px/1 var(--mono)', margin: '7px 0 5px' }}>{s.v}</div>
            <div style={{ fontSize: 12, color: 'rgba(235,235,245,.4)' }}>{s.u}</div>
          </div>
        ))}
      </div>

      <Card style={{ margin: '14px 20px 0' }}>
        <Row label="Emplacement" value={item.locationName} tone={item.locationTone} onClick={() => setSheet('move')} chevron />
        <Row label="Catégorie" value={item.categoryName ?? '—'} />
        <Row label={dateRowLabel} value={frDate(item.bestBefore)} />
        {item.dateType !== 'NONE' && (
          <Row label="Échéance" value={`${urgencyBadge(item.urgency, item.daysLeft)}${item.dateFromOpening ? ' · après ouverture' : ''}`} />
        )}
        <Row label="Type de date" value={DATE_TYPE_LABEL[item.dateType]} />
        {item.barcode && <Row label="Code‑barres" value={<span className="mono">{item.barcode}</span>} />}
        {item.lotCode && <Row label="Lot" value={<span className="mono">{item.lotCode}</span>} />}
        {item.isMedicine && <Row label="Dosage" value={[item.dosage, item.medForm].filter(Boolean).join(' · ') || '—'} />}
        {item.frozenAt && <Row label="Congelé le" value={frDate(item.frozenAt)} />}
        <Row label="Ajouté le" value={frDate(item.createdAt.slice(0, 10))} last />
      </Card>

      <Card style={{ margin: '14px 20px 0' }}>
        <Row label="Ouvert" value={item.openedAt ? frDate(item.openedAt) : 'Non'} last={!item.openedAt}>
          <Switch
            on={Boolean(item.openedAt)}
            onToggle={() => setOpened(item, item.openedAt ? null : new Date().toISOString().slice(0, 10))}
          />
        </Row>
        {item.openedAt && (
          <Row
            label="À consommer sous"
            value={item.daysAfterOpening === null ? 'non précisé' : `${item.daysAfterOpening} j après ouverture`}
            last
            onClick={() => {
              const raw = window.prompt('À consommer combien de jours après ouverture ?', String(item.daysAfterOpening ?? 3));
              if (raw === null) return;
              const n = Number(raw);
              if (!Number.isFinite(n) || n < 0) return;
              setOpened(item, item.openedAt, Math.round(n));
            }}
            chevron
          />
        )}
      </Card>

      <div style={{ display: 'flex', gap: 9, margin: '14px 20px 0' }}>
        <Button
          variant="plain"
          style={{ flex: 1, padding: 14, borderRadius: 16, fontSize: 14.5 }}
          onClick={() => {
            setDraft({
              productId: item.productId, batchId: item.id, name: item.name, brand: item.brand,
              barcode: item.barcode, imageUrl: item.imageUrl, packageText: item.packageText,
              categoryId: item.categoryId, locationId: item.locationId,
              qty: Math.max(1, item.qty), unit: item.unit,
              dateType: item.dateType, bestBefore: item.bestBefore, lotCode: item.lotCode,
              daysAfterOpening: item.daysAfterOpening, isMedicine: item.isMedicine,
              dosage: item.dosage, medForm: item.medForm, notes: item.notes,
            });
            nav('/ajouter');
          }}
        >
          Modifier
        </Button>
        <Button variant="plain" style={{ flex: 1, padding: 14, borderRadius: 16, fontSize: 14.5 }} onClick={() => setSheet('move')}>
          Déplacer
        </Button>
        <Button variant="danger" style={{ flex: 1, padding: 14, borderRadius: 16, fontSize: 14.5 }} onClick={() => setSheet('delete')}>
          Supprimer
        </Button>
      </div>

      {otherBatches.length > 0 && (
        <>
          <Eyebrow style={{ margin: '26px 20px 9px' }}>Autres lots de ce produit</Eyebrow>
          <Card style={{ margin: '0 20px' }}>
            {otherBatches.map((b, i, arr) => (
              <StockRow
                key={b.id}
                item={b}
                subtitle="urgency"
                last={i === arr.length - 1}
                onOpen={() => nav(`/produit/${b.id}`)}
                onConsume={() => consume(b)}
              />
            ))}
          </Card>
        </>
      )}

      <Eyebrow style={{ margin: '26px 20px 9px' }}>Historique</Eyebrow>
      <Card style={{ margin: '0 20px' }}>
        {history.length === 0 && <Row label="Aucun mouvement" value="" last />}
        {history.slice(0, 12).map((h, i, arr) => (
          <Row
            key={h.id}
            label={MOVEMENT_LABEL[h.kind] ?? h.kind}
            value={<span className="mono" style={{ fontSize: 12.5 }}>{frDate(h.at.slice(0, 10), true)}</span>}
            last={i === arr.length - 1}
          />
        ))}
      </Card>

      <ZeroSheet item={zero} onClose={() => setZero(null)} />
      <LocationSheet
        open={sheet === 'move'}
        currentId={item.locationId}
        onClose={() => setSheet(null)}
        onPick={(locationId) => move(item, locationId)}
      />
      <ConfirmSheet
        open={sheet === 'trash'}
        onClose={() => setSheet(null)}
        title={`Jeter ${item.name} ?`}
        text={`Les ${qtyLabel(item.qty, item.unit)} restants sortiront du stock. L’historique garde la trace.`}
        confirmLabel="Jeter"
        onConfirm={() => close(item, 'trashed')}
      />
      <ConfirmSheet
        open={sheet === 'delete'}
        onClose={() => setSheet(null)}
        danger
        title={`Supprimer ${item.name} ?`}
        text="La fiche et tous ses lots seront retirés du stock pour tout le foyer."
        confirmLabel="Supprimer"
        onConfirm={async () => {
          const ok = await run(() => api.del(`/products/${item.productId}`));
          if (ok) { touch(); showToast(`${item.name} retiré du stock`); nav('/stock'); }
        }}
      />
    </Screen>
  );
}

function HeroButton({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, padding: 15, borderRadius: 999, background: 'rgba(255,255,255,.14)',
        border: '1px solid rgba(255,255,255,.28)', color: '#fff', font: '600 16px/1 var(--sans)',
      }}
    >
      {children}
    </button>
  );
}

export function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      style={{
        width: 51, height: 31, borderRadius: 999, border: 'none', padding: 2,
        background: on ? 'var(--green)' : 'rgba(120,120,128,.4)',
        display: 'flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start',
        transition: 'background .18s ease',
      }}
    >
      <span style={{ width: 27, height: 27, borderRadius: '50%', background: '#fff' }} />
    </button>
  );
}
