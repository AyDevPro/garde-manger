import { useNavigate } from 'react-router-dom';
import { Card, Eyebrow, Row, Screen, Title } from '../components/ui';
import { useStore } from '../store';

export function Settings() {
  const nav = useNavigate();
  const { householdName, locations, categories, showToast } = useStore();

  const groups = [
    {
      title: 'Le foyer',
      rows: [
        { k: 'Emplacements', v: String(locations.length), go: () => nav('/gerer/emplacements') },
        { k: 'Catégories', v: String(categories.length), go: () => nav('/gerer/categories') },
        { k: 'Liste de courses', v: '', go: () => nav('/courses') },
      ],
    },
    {
      title: 'Données',
      rows: [
        { k: 'Historique des mouvements', v: '', go: () => nav('/historique') },
        {
          k: 'Export CSV',
          v: 'Télécharger',
          go: () => {
            // Le téléchargement passe par la même session que le reste de l'API.
            window.location.href = '/api/export.csv';
            showToast('Export en cours…');
          },
        },
      ],
    },
    {
      title: 'Accès',
      rows: [
        { k: 'Sécurité', v: 'Mot de passe', go: () => nav('/securite') },
        { k: 'À propos', v: 'v1.0', go: () => showToast('Garde‑Manger 1.0 · foyer privé') },
      ],
    },
  ];

  const initial = householdName.trim().slice(0, 1).toUpperCase() || 'M';

  return (
    <Screen>
      <Title>Réglages</Title>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 18, padding: 16, background: 'var(--card)', borderRadius: 22 }}>
        <div
          style={{
            width: 48, height: 48, borderRadius: 14, background: 'var(--accent)', color: 'var(--on-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 18px/1 var(--sans)',
          }}
        >
          {initial}
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{householdName}</div>
          <div style={{ fontSize: 13, color: 'var(--fg-2)', marginTop: 4 }}>Compte partagé du foyer</div>
        </div>
      </div>

      {groups.map((g) => (
        <div key={g.title} style={{ marginTop: 24 }}>
          <Eyebrow style={{ marginBottom: 9 }}>{g.title}</Eyebrow>
          <Card>
            {g.rows.map((r, i, arr) => (
              <Row key={r.k} label={r.k} value={r.v} onClick={r.go} chevron last={i === arr.length - 1} />
            ))}
          </Card>
        </div>
      ))}

      <div
        className="mono"
        style={{ textAlign: 'center', fontSize: 11.5, lineHeight: 1.6, color: 'rgba(235,235,245,.3)', marginTop: 26 }}
      >
        Garde‑Manger 1.0 · foyer privé
        <br />
        aucune donnée partagée
      </div>
    </Screen>
  );
}
