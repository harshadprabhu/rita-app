import { DbChecklistSubmission, DbStore, DbChecklistTemplate, DbProfile } from './database';

export interface ChecklistSubmissionWithRelations extends DbChecklistSubmission {
  store: Pick<DbStore, 'id' | 'name'> | null;
  template: Pick<DbChecklistTemplate, 'id' | 'key' | 'name'> | null;
  submitted_by_profile: Pick<DbProfile, 'id' | 'display_name'> | null;
}
