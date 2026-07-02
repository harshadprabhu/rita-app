import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { fetchProfile } from '../lib/auth/session';
import { useAuthStore } from '../stores/authStore';

export function useAuth() {
  const { setSession, setProfile, setLoading, reset } = useAuthStore();

  useEffect(() => {
    // Without a .catch() here, a rejected getSession() (flaky network, a stale/
    // invalid cached session token, a momentary Supabase blip) leaves isLoading
    // stuck true forever -- the app never gets past the startup loading screen.
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        if (session?.user) {
          fetchProfile(session.user.id).then((profile) => {
            setProfile(profile);
            setLoading(false);
          });
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id).then((profile) => {
          setProfile(profile);
          setLoading(false);
        });
      } else {
        reset();
      }
    });

    return () => subscription.unsubscribe();
  }, []);
}
