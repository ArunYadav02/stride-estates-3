import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setToken, getToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState({ status: 'loading', user: null, agency: null });

  useEffect(() => {
    const load = async () => {
      if (!getToken()) return setSession({ status: 'signed-out', user: null, agency: null });
      try {
        const { user, agency } = await api.me();
        setSession({ status: 'signed-in', user, agency });
      } catch (error) {
        setSession({ status: 'signed-out', user: null, agency: null });
      }
    };
    load();

    const onSignedOut = () => setSession({ status: 'signed-out', user: null, agency: null });
    window.addEventListener('stride:signed-out', onSignedOut);
    return () => window.removeEventListener('stride:signed-out', onSignedOut);
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { token, user, agency } = await api.login(email, password);
    setToken(token);
    setSession({ status: 'signed-in', user, agency });
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setSession({ status: 'signed-out', user: null, agency: null });
  }, []);

  const value = useMemo(() => ({ ...session, signIn, signOut }), [session, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
