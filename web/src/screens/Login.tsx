import { useState, type FormEvent } from 'react';
import { ApiError } from '../lib/api';
import { useStore } from '../store';
import { Button, Spinner } from '../components/ui';

export function Login() {
  const { signIn, householdName } = useStore();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connexion impossible — vérifiez le réseau.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: `var(--safe-top) 26px calc(var(--safe-bottom) + 50px)`, maxWidth: 480, margin: '0 auto',
      }}
    >
      <div
        style={{
          width: 60, height: 60, borderRadius: 18, background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 26,
        }}
      >
        <span style={{ width: 24, height: 24, border: '3px solid #111', borderRadius: 6 }} />
      </div>

      <h1 style={{ font: '700 36px/1.06 var(--sans)', letterSpacing: '-.03em', margin: 0 }}>Garde‑Manger</h1>
      <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--fg-2)', margin: '12px 0 32px', maxWidth: 280 }}>
        Le stock de la maison, les dates de péremption, et rien de plus.
      </p>

      <div style={{ background: 'var(--card)', borderRadius: 18, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '15px 17px', borderBottom: '1px solid rgba(255,255,255,.07)',
          }}
        >
          <span style={{ fontSize: 16, color: 'var(--fg-2)' }}>Maison</span>
          <span style={{ fontSize: 16, textAlign: 'right' }}>{householdName}</span>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '15px 17px' }}>
          <span style={{ fontSize: 16, color: 'var(--fg-2)' }}>Mot de passe</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            placeholder="••••••••"
            style={{
              flex: 1, minWidth: 0, background: 'none', border: 'none', textAlign: 'right',
              fontSize: 16, letterSpacing: password ? '.2em' : undefined, color: 'var(--fg)',
            }}
          />
        </label>
      </div>

      {error && (
        <div role="alert" style={{ marginTop: 12, fontSize: 13.5, lineHeight: 1.4, color: 'var(--red)' }}>{error}</div>
      )}

      <Button type="submit" variant="primary" disabled={busy || !password} style={{ marginTop: 16, padding: 17, fontSize: 17 }}>
        {busy ? <Spinner size={18} /> : 'Se connecter'}
      </Button>

      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'rgba(235,235,245,.35)' }}>
        Accès réservé au foyer · pas d’inscription
      </div>
    </form>
  );
}
