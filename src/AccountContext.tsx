import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
type Account = { user: { name: string; email: string } | null; officeId: string | null; providers: { github: boolean; gitlab: boolean } };
const empty: Account = { user: null, officeId: null, providers: { github: false, gitlab: false } };
const Context = createContext({ ...empty, loading: true, unavailable: false, local: false, refresh: async () => {} });
export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState(empty), [loading, setLoading] = useState(true), [unavailable, setUnavailable] = useState(false), [local, setLocal] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/account', { signal: AbortSignal.timeout(8000) });
      if (response.status === 404) {
        const health = await fetch('/api/health', { signal: AbortSignal.timeout(8000) }).then(r => r.json());
        if (health.storage === 'local') { setLocal(true); setAccount(empty); return; }
      }
      if (!response.ok) throw Error();
      setAccount(await response.json()); setUnavailable(false);
    } catch { setUnavailable(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return <Context.Provider value={{ ...account, loading, unavailable, local, refresh }}>{children}</Context.Provider>;
}
export const useAccount = () => useContext(Context);
export async function accountRequest(path: string, body?: unknown, method = 'POST') {
  const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({ error: 'The office service is unavailable. Please try again.' }));
  if (!response.ok) throw Error(typeof data.error === 'string' ? data.error : data.message || 'Could not complete sign-in. Try your original provider, then link the other one from your account.');
  return data;
}
