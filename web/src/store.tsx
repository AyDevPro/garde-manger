import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { ApiError, NoDataError, OfflineError, api, syncOutbox } from './lib/api';
import { clearCache, forgetSession, listPending, recalledSession, rememberSession } from './lib/offline';
import type { Category, Draft, Location } from './types';

type Toast = { text: string; undo?: () => Promise<void> | void };

type Store = {
  auth: 'unknown' | 'in' | 'out';
  householdName: string;
  locations: Location[];
  categories: Category[];
  /** Incrémenté à chaque écriture : les écrans s'y abonnent pour se recharger. */
  revision: number;
  /** Écritures faites hors ligne, en attente d'être renvoyées. */
  pendingCount: number;
  syncing: boolean;
  draft: Draft | null;
  toast: Toast | null;
  netError: string | null;

  signIn: (password: string) => Promise<void>;
  signOut: (allDevices?: boolean) => Promise<void>;
  refreshTaxonomy: () => Promise<void>;
  touch: () => void;
  setDraft: (d: Draft | null | ((prev: Draft | null) => Draft | null)) => void;
  showToast: (text: string, undo?: Toast['undo']) => void;
  dismissToast: () => void;
  setNetError: (msg: string | null) => void;
  /** Recompte la file — à appeler après chaque écriture différable. */
  refreshPending: () => Promise<void>;
  /** Renvoie la file maintenant (retour du réseau, bouton « Réessayer »). */
  sync: () => Promise<void>;
  /** Exécute une écriture en affichant proprement les erreurs réseau. */
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
};

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore doit être utilisé dans <StoreProvider>');
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<Store['auth']>('unknown');
  const [householdName, setHouseholdName] = useState('Maison');
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [revision, setRevision] = useState(0);
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [netError, setNetError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);
  const syncLock = useRef(false);

  const touch = useCallback(() => setRevision((r) => r + 1), []);

  const showToast = useCallback((text: string, undo?: Toast['undo']) => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  const dismissToast = useCallback(() => {
    window.clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  const refreshTaxonomy = useCallback(async () => {
    const [locs, cats] = await Promise.all([
      api.get<Location[]>('/locations'),
      api.get<Category[]>('/categories'),
    ]);
    setLocations(locs);
    setCategories(cats);
  }, []);

  const refreshPending = useCallback(async () => {
    setPendingCount((await listPending()).length);
  }, []);

  const run = useCallback(async <T,>(fn: () => Promise<T>) => {
    try {
      const out = await fn();
      return out;
    } catch (err) {
      // Une requête annulée (démontage, filtre changé) n'est pas une erreur.
      if ((err as Error)?.name === 'AbortError') return undefined;
      if (err instanceof NoDataError) setNetError(err.message);
      else if (err instanceof OfflineError) setNetError('Hors ligne — les modifications partiront au retour du réseau.');
      else if (err instanceof ApiError && err.status === 401) { forgetSession(); setAuth('out'); }
      else if (err instanceof ApiError) showToast(err.message);
      else showToast('Une erreur est survenue');
      return undefined;
    }
  }, [showToast]);

  const sync = useCallback(async () => {
    if (syncLock.current) return;
    syncLock.current = true;
    setSyncing(true);
    try {
      const before = (await listPending()).length;
      if (!before) { setNetError(null); return; }
      const { sent, dropped, remaining } = await syncOutbox();
      await refreshPending();
      if (sent || dropped) {
        touch();
        const parts = [];
        if (sent) parts.push(`${sent} modification${sent > 1 ? 's' : ''} synchronisée${sent > 1 ? 's' : ''}`);
        if (dropped) parts.push(`${dropped} abandonnée${dropped > 1 ? 's' : ''} (refusée${dropped > 1 ? 's' : ''} par le serveur)`);
        showToast(parts.join(' · '));
      }
      if (!remaining) setNetError(null);
    } finally {
      setSyncing(false);
      syncLock.current = false;
    }
  }, [refreshPending, showToast, touch]);

  const signIn = useCallback(async (password: string) => {
    const r = await api.post<{ authenticated: boolean; householdName: string }>('/auth/login', { password });
    setHouseholdName(r.householdName);
    rememberSession(r.householdName);
    setAuth('in');
    await refreshTaxonomy();
    await sync();
    touch();
  }, [refreshTaxonomy, sync, touch]);

  const signOut = useCallback(async (allDevices = false) => {
    await run(() => api.post(allDevices ? '/auth/logout-all' : '/auth/logout'));
    forgetSession();
    // Le stock ne reste pas lisible sur un appareil déconnecté. La file, elle,
    // est conservée : elle repartira à la prochaine connexion.
    await clearCache();
    setAuth('out');
    setDraftState(null);
    setLocations([]);
    setCategories([]);
  }, [run]);

  const setDraft = useCallback((d: Draft | null | ((prev: Draft | null) => Draft | null)) => {
    setDraftState((prev) => (typeof d === 'function' ? (d as (p: Draft | null) => Draft | null)(prev) : d));
  }, []);

  // Session au démarrage : elle dure longtemps, on la retrouve presque toujours.
  useEffect(() => {
    let alive = true;
    (async () => {
      await refreshPending();
      try {
        const me = await api.get<{ authenticated: boolean; householdName: string }>('/auth/me');
        if (!alive) return;
        setHouseholdName(me.householdName);
        if (me.authenticated) {
          rememberSession(me.householdName);
          setAuth('in');
          await refreshTaxonomy();
          await sync();
        } else {
          forgetSession();
          setAuth('out');
        }
      } catch (err) {
        if (!alive) return;
        // Hors ligne au lancement : si l'appareil était connecté, on ouvre l'app
        // sur son cache plutôt que d'afficher un écran de connexion inutilisable.
        const remembered = recalledSession();
        if (err instanceof OfflineError && remembered) {
          setHouseholdName(remembered);
          setAuth('in');
          setNetError('Hors ligne — les modifications partiront au retour du réseau.');
          refreshTaxonomy().catch(() => {});
        } else {
          setAuth('out');
          if (err instanceof OfflineError) setNetError('Hors ligne — impossible de se connecter.');
        }
      }
    })();
    return () => { alive = false; };
  }, [refreshTaxonomy, refreshPending, sync]);

  // Le retour du réseau vide la file tout seul.
  useEffect(() => {
    const online = () => { sync().then(() => setNetError(null)); };
    const offline = () => setNetError('Hors ligne — les modifications partiront au retour du réseau.');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    // Revenir sur l'app après l'avoir mise de côté est aussi un bon moment.
    const onVisible = () => { if (document.visibilityState === 'visible' && navigator.onLine) sync(); };
    document.addEventListener('visibilitychange', onVisible);
    // `navigator.onLine` ment souvent (wifi capté mais serveur injoignable) :
    // c'est le résultat des lectures qui fait foi.
    const stale = () => setNetError('Hors ligne — les modifications partiront au retour du réseau.');
    const fresh = () => setNetError(null);
    window.addEventListener('gm:stale', stale);
    window.addEventListener('gm:fresh', fresh);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('gm:stale', stale);
      window.removeEventListener('gm:fresh', fresh);
    };
  }, [sync]);

  const value = useMemo<Store>(() => ({
    auth, householdName, locations, categories, revision, draft, toast, netError,
    pendingCount, syncing,
    signIn, signOut, refreshTaxonomy, touch, setDraft, showToast, dismissToast, setNetError, run,
    refreshPending, sync,
  }), [auth, householdName, locations, categories, revision, draft, toast, netError,
      pendingCount, syncing,
      signIn, signOut, refreshTaxonomy, touch, setDraft, showToast, dismissToast, run,
      refreshPending, sync]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
