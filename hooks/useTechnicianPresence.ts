import { useEffect, useState, useRef } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';

// A single shared Supabase Realtime Presence channel names every technician
// who currently has the RITA app open. Technicians `track` themselves on it;
// everyone (users included) reads its state to know who is online right now.
//
// Availability shown to users = "is a technician in the RITA roster" (the
// caller supplies that list) AND "is present on this channel" (online now).
const PRESENCE_CHANNEL = 'tech-presence';

/**
 * For a TECHNICIAN's app: announce presence while the app is foregrounded.
 * Call once high in the technician layout. No-op for non-technicians.
 */
export function useBroadcastPresence(me: { id: string; display_name: string; role: string } | null | undefined) {
  const isTech = !!me && ['technician', 'admin', 'manager', 'ops_manager'].includes(me.role);
  useEffect(() => {
    if (!isTech || !me) return;
    const channel = supabase.channel(PRESENCE_CHANNEL, { config: { presence: { key: me.id } } });
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ id: me.id, name: me.display_name, at: Date.now() });
      }
    });
    // Re-track on foreground so a backgrounded app that dropped presence
    // re-announces when the technician returns.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') channel.track({ id: me.id, name: me.display_name, at: Date.now() }).catch(() => {});
    });
    return () => { sub.remove(); supabase.removeChannel(channel); };
  }, [isTech, me?.id, me?.display_name]);
}

/**
 * For ANY app: read the set of technician ids currently online. Updates live
 * as technicians come and go.
 */
export function useOnlineTechnicians(): Set<string> {
  const [online, setOnline] = useState<Set<string>>(new Set());
  const chRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    const channel = supabase.channel(PRESENCE_CHANNEL, { config: { presence: { key: `viewer-${Math.random().toString(36).slice(2, 8)}` } } });
    chRef.current = channel;
    const sync = () => {
      const state = channel.presenceState() as Record<string, { id?: string }[]>;
      const ids = new Set<string>();
      for (const key of Object.keys(state)) {
        // presence key is the technician's id; also read the tracked payload.
        for (const meta of state[key]) ids.add(meta.id ?? key);
      }
      setOnline(ids);
    };
    channel
      .on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);
  return online;
}
