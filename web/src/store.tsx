import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { ApiError, OfflineError, api } from './lib/api';
import type { Category, Draft, Location } from './types';

type Toast = { text: string; undo?: () => Promise<void> | void };

type Store = {
  auth: 'unknown' | 'in' | 'out';
  householdName: string;
  locations: Location[];
  categories: Category[];
  /** Incrémenté à chaque écriture : les écrans s'y abonnent pour se recharger. */
  revision: number;
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
  const toastTimer = useRef<number | undefined>(undefined);

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

  const run = useCallback(async <T,>(fn: () => Promise<T>) => {
    try {
      const out = await fn();
      setNetError(null);
      return out;
    } catch (err) {
      // Une requête annulée (démontage, filtre changé) n'est pas une erreur.
      if ((err as Error)?.name === 'AbortError') return undefined;
      if (err instanceof OfflineError) setNetError(err.message);
      else if (err instanceof ApiError && err.status === 401) setAuth('out');
      else if (err instanceof ApiError) showToast(err.message);
      else showToast('Une erreur est survenue');
      return undefined;
    }
  }, [showToast]);

  const signIn = useCallback(async (password: string) => {
    const r = await api.post<{ authenticated: boolean; householdName: string }>('/auth/login', { password });
    setHouseholdName(r.householdName);
    setAuth('in');
    await refreshTaxonomy();
    touch();
  }, [refreshTaxonomy, touch]);

  const signOut = useCallback(async (allDevices = false) => {
    await run(() => api.post(allDevices ? '/auth/logout-all' : '/auth/logout'));
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
      try {
        const me = await api.get<{ authenticated: boolean; householdName: string }>('/auth/me');
        if (!alive) return;
        setHouseholdName(me.householdName);
        setAuth(me.authenticated ? 'in' : 'out');
        if (me.authenticated) await refreshTaxonomy();
      } catch (err) {
        if (!alive) return;
        // Hors ligne au lancement : on laisse l'app tenter d'afficher son cache.
        if (err instanceof OfflineError) setNetError(err.message);
        setAuth('out');
      }
    })();
    return () => { alive = false; };
  }, [refreshTaxonomy]);

  // Le retour du réseau efface le bandeau tout seul.
  useEffect(() => {
    const online = () => setNetError(null);
    const offline = () => setNetError('Hors ligne — les modifications seront à refaire une fois reconnecté.');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  const value = useMemo<Store>(() => ({
    auth, householdName, locations, categories, revision, draft, toast, netError,
    signIn, signOut, refreshTaxonomy, touch, setDraft, showToast, dismissToast, setNetError, run,
  }), [auth, householdName, locations, categories, revision, draft, toast, netError,
      signIn, signOut, refreshTaxonomy, touch, setDraft, showToast, dismissToast, run]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
