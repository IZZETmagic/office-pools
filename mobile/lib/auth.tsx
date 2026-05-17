import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
};

type AuthActions = {
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (params: {
    email: string;
    password: string;
    username: string;
    fullName: string;
  }) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  checkUsernameAvailable: (username: string) => Promise<boolean>;
};

type AuthContextValue = AuthState & AuthActions;

const AuthContext = createContext<AuthContextValue | null>(null);

const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,

      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return { error: error.message };

        const { data } = await supabase.auth.getUser();
        if (data.user) {
          await supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('auth_user_id', data.user.id);
        }
        return {};
      },

      async signUp({ email, password, username, fullName }) {
        if (username.length < 3 || username.length > 20) {
          return { error: 'Username must be 3–20 characters.' };
        }
        if (!USERNAME_PATTERN.test(username)) {
          return { error: 'Username can only contain letters, numbers, and underscores.' };
        }

        const { data: existing } = await supabase
          .from('users')
          .select('user_id')
          .eq('username', username)
          .maybeSingle();
        if (existing) {
          return { error: 'That username is already taken.' };
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (authError) return { error: authError.message };
        if (!authData.user) return { error: 'Sign up failed. Please try again.' };

        const { error: profileError } = await supabase
          .from('users')
          .update({ username, full_name: fullName })
          .eq('auth_user_id', authData.user.id);

        if (profileError) {
          if (profileError.code === '23505' && profileError.message?.includes('username')) {
            return { error: 'That username was just taken. Please choose another.' };
          }
          return { error: 'Profile setup failed. Please contact support.' };
        }

        return {};
      },

      async signOut() {
        await supabase.auth.signOut();
      },

      async checkUsernameAvailable(username) {
        if (username.length < 3 || !USERNAME_PATTERN.test(username)) return false;
        const { data } = await supabase
          .from('users')
          .select('user_id')
          .eq('username', username)
          .maybeSingle();
        return !data;
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}
