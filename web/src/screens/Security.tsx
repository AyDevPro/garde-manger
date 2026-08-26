import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackHeader, Button, Card, Eyebrow, Screen, Title } from '../components/ui';
import { ConfirmSheet } from './sheets';
import { useGoBack, useResource } from '../hooks';
import { ApiError, api } from '../lib/api';
import { useStore } from '../store';
import type { DeviceSession } from '../types';

export function Security() {
  const nav = useNavigate();
  const goBack = useGoBack('/reglages');
  const { signOut, run, touch, showToast } = useStore();
  const { data: sessions } = useResource<DeviceSession[]>('/auth/sessions');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) { setError('8 caractères minimum'); return; }
    setBusy(true);
    try {
      await api.post('/auth/password', { current, next, logoutOthers: true });
      setCurrent('');
      setNext('');
      showToast('Mot de passe mis à jour · autres appareils déconnectés');
      touch();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Modification impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <BackHeader onBack={goBack}>Retour</BackHeader>
      <div style={{ marginTop: 16 }}><Title>Sécurité</Title></div>

      <form onSubmit={changePassword}>
        <Eyebrow style={{ margin: '24px 0 9px' }}>Mot de passe du foyer</Eyebrow>
        <Card>
          <PasswordField label="Actuel" value={current} onChange={setCurrent} autoComplete="current-password" />
          <PasswordField label="Nouveau" value={next} onChange={setNext} placeholder="8 caractères minimum" autoComplete="new-password" last />
        </Card>
        {error && <div role="alert" style={{ marginTop: 10, fontSize: 13.5, color: 'var(--red)' }}>{error}</div>}
        <Button type="submit" variant="primary" disabled={busy || !current || !next} style={{ marginTop: 11, padding: 15, fontSize: 15 }}>
          Mettre à jour
        </Button>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--fg-4)', margin: '10px 2px 0' }}>
          Les autres appareils seront déconnectés, cet appareil reste connecté.
        </div>
      </form>

      <Eyebrow style={{ margin: '26px 0 9px' }}>Appareils connectés</Eyebrow>
      <Card>
        {(sessions ?? []).map((s, i, arr) => (
          <div
            key={s.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '15px 17px',
              borderBottom: i === arr.length - 1 ? 'none' : '1px solid var(--line)',
            }}
          >
            <span
              style={{
                width: 8, height: 8, borderRadius: '50%', flex: 'none',
                background: s.current ? 'var(--green)' : 'rgba(235,235,245,.3)',
              }}
            />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="ellipsis" style={{ display: 'block', fontSize: 16, fontWeight: 500 }}>{s.name}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--fg-3)', marginTop: 4 }}>
                {relative(s.lastSeenAt)}
              </span>
            </span>
            {s.current ? (
              <span className="mono" style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(235,235,245,.4)' }}>cet appareil</span>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  const ok = await run(() => api.del(`/auth/sessions/${s.id}`));
                  if (ok) { touch(); showToast(`${s.name} déconnecté`); }
                }}
                style={{ background: 'none', border: 'none', font: '600 13px/1 var(--sans)', color: 'var(--accent)', padding: '6px 8px' }}
              >
                Déconnecter
              </button>
            )}
          </div>
        ))}
        {sessions?.length === 0 && <div style={{ padding: 17, color: 'var(--fg-3)', fontSize: 14 }}>Aucune session active.</div>}
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
        <Button variant="plain" onClick={() => signOut(false)} style={{ padding: 16, fontSize: 15.5 }}>Se déconnecter</Button>
        <Button variant="danger" onClick={() => setConfirmAll(true)} style={{ padding: 16, fontSize: 15.5 }}>
          Déconnecter tous les appareils
        </Button>
      </div>

      <ConfirmSheet
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        danger
        title="Déconnecter tous les appareils ?"
        text="Chaque membre du foyer devra ressaisir le mot de passe."
        confirmLabel="Déconnecter"
        onConfirm={() => signOut(true)}
      />
    </Screen>
  );
}

function PasswordField({
  label, value, onChange, placeholder, last, autoComplete,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; last?: boolean; autoComplete?: string;
}) {
  return (
    <label
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '15px 17px', borderBottom: last ? 'none' : '1px solid rgba(255,255,255,.07)',
      }}
    >
      <span style={{ fontSize: 16, color: 'rgba(235,235,245,.75)' }}>{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={{
          flex: 1, minWidth: 0, background: 'none', border: 'none', textAlign: 'right',
          fontSize: 16, letterSpacing: value ? '.2em' : undefined, color: 'var(--fg)',
        }}
      />
    </label>
  );
}

function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 2) return "Actif à l'instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Hier' : `Il y a ${days} jours`;
}
