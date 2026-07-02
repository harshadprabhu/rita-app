import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { fetchProfile } from '../lib/auth/session';
import { useAuthStore } from '../stores/authStore';

export function useAuth() {
  const { setSession, setProfile, setLoading, reset } = useAuthStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id).then((profile) => {
          setProfile(profile);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
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
