import { Session } from '@supabase/supabase-js';
import { DbProfile } from './database';

export interface AuthState {
  session: Session | null;
  profile: DbProfile | null;
  isLoading: boolean;
}
