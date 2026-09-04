import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// The member profile ("Netflix profile") currently active on THIS device. A
// shared store account can have several; the active one auto-fills the ticket
// contact number and stamps the ticket with who raised it. Persisted per
// device so it survives app restarts but is never uploaded anywhere.

export interface ActiveMemberProfile {
  id: string;
  name: string;
  phone: string | null;
  avatarColor: string | null;
  avatarEmoji: string | null;
}

interface MemberProfileStore {
  active: ActiveMemberProfile | null;
  /** Keyed by account id, so switching accounts on the same device doesn't
   *  carry the previous account's chosen profile over. */
  accountId: string | null;
  setActive: (accountId: string, profile: ActiveMemberProfile | null) => void;
  clear: () => void;
}

export const useMemberProfileStore = create<MemberProfileStore>()(
  persist(
    (set) => ({
      active: null,
      accountId: null,
      setActive: (accountId, profile) => set({ accountId, active: profile }),
      clear: () => set({ active: null, accountId: null }),
    }),
    {
      name: 'rita-member-profile',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
