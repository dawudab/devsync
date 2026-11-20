import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { backend } from '@/lib/data';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);

  useEffect(() => backend.onAuthChange(setUser), []);

  const value = useMemo(
    () => ({
      user: user ?? null,
      loading: user === undefined,
      signInWithGoogle: backend.signInWithGoogle,
      signInAsGuest: backend.signInAsGuest,
      signOut: backend.signOut,
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
