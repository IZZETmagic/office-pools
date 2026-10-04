import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { resetErrorMessage } from './passwordReset';
import { resetSessionState } from './sessionReset';
import { supabase } from './supabase';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /**
   * Signed in by a reset code, new password not saved yet. The root gate holds
   * a recovering person on `(auth)/new-password` — without it, the session the
   * code creates would carry them straight into the app (or, on a new phone,
   * the notifications screen) with a password they still don't know.
   */
  recovering: boolean;
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
  /** Emails a reset code. Succeeds whether or not the address has an account. */
  requestPasswordReset: (email: string) => Promise<{ error?: string }>;
  /** Signs in with the emailed code and starts `recovering`. */
  verifyResetCode: (email: string, code: string) => Promise<{ error?: string }>;
  /** Saves the new password and ends `recovering`. */
  completePasswordReset: (password: string) => Promise<{ error?: string }>;
  /**
   * Ends `recovering` without a new password. ⚠ STAYS SIGNED IN (Ryan,
   * 2026-10-04): the code already proved the inbox, so "not now" lets them in
   * rather than throwing them back to a sign-in they can't complete.
   */
  skipPasswordReset: () => void;
};

type AuthContextValue = AuthState & AuthActions;

const AuthContext = createContext<AuthContextValue | null>(null);

const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      })
      // ⚠ WITHOUT THIS CATCH THE SPLASH NEVER LIFTS. `loading` is only cleared
      // in the success path, and the splash gate holds on it ahead of every
      // other check — so a rejection left the app on the branded splash for
      // good, with an unhandled rejection as the only trace. It could not
      // happen before because `getSession` had no timeout and simply hung; now
      // that it is bounded, a stalled refresh REJECTS, and the hang would have
      // become permanent. Treated as "not signed in", which routes to sign-in
      // and is somewhere a person can act.
      .catch((err: unknown) => {
        console.warn('[auth] session restore failed — continuing signed out', err);
        setSession(null);
        setLoading(false);
      });

    // ⚠ The member we last saw, so an IDENTITY CHANGE can be told apart from a
    // token refresh (which fires this listener constantly with the same user).
    // `undefined` means "not observed yet": the first event of a launch is
    // INITIAL_SESSION, and treating that as a change would wipe the cold-start
    // cache we had just read, on every single launch.
    let seenUserId: string | null | undefined;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      // A reset can't outlive its session. Left set across a sign-out or a
      // failed refresh, the NEXT sign-in would land on "choose a new password".
      if (!nextSession) setRecovering(false);

      const nextUserId = nextSession?.user.id ?? null;
      // ⚠⚠ THE TEARDOWN IS NOT ONLY IN `signOut()`. A refresh token that fails
      // ends the session without anyone pressing Sign Out — the catch above
      // treats that as signed out and the gate routes to sign-in — so a
      // teardown wired to the button alone leaves the whole of the outgoing
      // member's state in memory for whoever signs in next.
      //
      // ⚠ Only when we were signed in as SOMEONE. A null → member transition
      // is a sign-in, where there is nothing of a previous session left to
      // forget (we cleared on the way out) and clearing would cost the
      // returning member their warm cold-start cache for nothing.
      if (seenUserId != null && seenUserId !== nextUserId) resetSessionState();
      seenUserId = nextUserId;
    });

    return () => subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      recovering,

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

        // The chosen username/full name ride inside the signup call as
        // auth metadata; the handle_new_user trigger creates the profile
        // row with them atomically. (Previously the trigger inserted an
        // email-prefix placeholder that this client patched afterwards —
        // signups exploded whenever the placeholder collided with an
        // existing username, and a failed patch stranded the user on a
        // name they never picked.)
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username,
              full_name: fullName,
            },
          },
        });
        if (authError) return { error: authError.message };
        if (!authData.user) return { error: 'Sign up failed. Please try again.' };

        return {};
      },

      async signOut() {
        await supabase.auth.signOut();
        // ⚠ NOTHING OF THIS SESSION SURVIVES THE BUTTON. Signing out does not
        // restart the bundle, so the disk cache, the query cache and the
        // composed avatar all have to be dropped by hand —
        // `lib/sessionReset.ts` holds the list and says why each is on it.
        //
        // The listener above sees this same transition and calls it again; it
        // is idempotent. Doing it here too means the state is gone by the time
        // `signOut()` resolves, rather than one callback later.
        resetSessionState();
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

      async requestPasswordReset(email) {
        // No `redirectTo`: the email's link is built by the template and goes
        // to /auth/confirm on the web; the app only ever uses the code.
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
        return error ? { error: resetErrorMessage(error) } : {};
      },

      async verifyResetCode(email, code) {
        // ⚠ SET BEFORE THE CALL, NOT AFTER IT. verifyOtp stores the session and
        // fires onAuthStateChange before it resolves, so a flag raised on the
        // way out would leave a render where the gate sees a session without
        // it — and routes onward from there.
        setRecovering(true);
        const { data, error } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: code,
          type: 'recovery',
        });
        if (error || !data.session) {
          setRecovering(false);
          return { error: resetErrorMessage(error ?? { code: 'otp_expired' }) };
        }
        if (data.user) {
          await supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('auth_user_id', data.user.id);
        }
        return {};
      },

      async completePasswordReset(password) {
        const { error } = await supabase.auth.updateUser({ password });
        // `same_password` means they knew it after all — nothing left to do.
        if (error && error.code !== 'same_password') {
          return { error: resetErrorMessage(error) };
        }
        setRecovering(false);
        return {};
      },

      skipPasswordReset() {
        setRecovering(false);
      },
    }),
    [session, loading, recovering],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}
