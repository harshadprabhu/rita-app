import { supabase } from '../supabase';
import {
  DbChecklistTemplate, DbChecklistQuestion, DbChecklistSubmission, DbChecklistAnswer,
  ChecklistTemplateKey,
} from '../../types';
import { ChecklistSubmissionWithRelations } from '../../types/checklist';
import { getMimeType, readFileAsBytes, compressIfImage } from '../utils/fileUpload';

export async function getTemplates(): Promise<DbChecklistTemplate[]> {
  const { data, error } = await supabase
    .from('checklist_templates')
    .select('*')
    .eq('is_active', true)
    .order('key');
  if (error) throw error;
  return (data ?? []) as DbChecklistTemplate[];
}

export async function getTemplateByKey(key: ChecklistTemplateKey): Promise<DbChecklistTemplate> {
  const { data, error } = await supabase
    .from('checklist_templates')
    .select('*')
    .eq('key', key)
    .single();
  if (error) throw error;
  return data as DbChecklistTemplate;
}

export async function getQuestions(templateId: string): Promise<DbChecklistQuestion[]> {
  const { data, error } = await supabase
    .from('checklist_questions')
    .select('*')
    .eq('template_id', templateId)
    .order('seq');
  if (error) throw error;
  return (data ?? []) as DbChecklistQuestion[];
}

/** Fetches today's submission for this template+store, creating an empty
 *  (in_progress) one if it doesn't exist yet. Safe to call repeatedly —
 *  subsequent calls just return the existing row untouched. */
export async function getOrCreateTodaySubmission(
  templateId: string,
  storeId: string,
  submittedBy: string,
): Promise<DbChecklistSubmission> {
  const { data, error } = await supabase
    .from('checklist_submissions')
    .upsert(
      { template_id: templateId, store_id: storeId, submitted_by: submittedBy },
      { onConflict: 'template_id,store_id,submission_date', ignoreDuplicates: false },
    )
    .select()
    .single();
  if (error) throw error;
  return data as DbChecklistSubmission;
}

export async function getAnswers(submissionId: string): Promise<DbChecklistAnswer[]> {
  const { data, error } = await supabase
    .from('checklist_answers')
    .select('*')
    .eq('submission_id', submissionId);
  if (error) throw error;
  return (data ?? []) as DbChecklistAnswer[];
}

export async function saveAnswer(
  submissionId: string,
  questionId: string,
  answerValue: string,
): Promise<DbChecklistAnswer> {
  const { data, error } = await supabase
    .from('checklist_answers')
    .upsert(
      { submission_id: submissionId, question_id: questionId, answer_value: answerValue, updated_at: new Date().toISOString() },
      { onConflict: 'submission_id,question_id' },
    )
    .select()
    .single();
  if (error) throw error;
  return data as DbChecklistAnswer;
}

/** Uploads a photo for one answer and stores its storage path on that answer
 *  row. Mirrors lib/api/tickets.ts's uploadAttachment, but checklist photos
 *  are one-per-answer, so the path is stored directly rather than via a
 *  separate join table. */
export async function uploadChecklistPhoto(
  submissionId: string,
  questionId: string,
  uri: string,
  fileName: string,
): Promise<string> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${submissionId}/${questionId}_${Date.now()}_${safeName}`;
  const contentType = getMimeType(fileName, 'image');

  const compressedUri = await compressIfImage(uri, 'image');
  const bytes = await readFileAsBytes(compressedUri);

  const { error: uploadError } = await supabase.storage
    .from('checklist-attachments')
    .upload(path, bytes, { contentType, upsert: true });
  if (uploadError) throw uploadError;

  const { error } = await supabase
    .from('checklist_answers')
    .update({ photo_path: path })
    .eq('submission_id', submissionId)
    .eq('question_id', questionId);
  if (error) throw error;

  return path;
}

export function getChecklistPhotoUrl(path: string): string {
  const { data } = supabase.storage.from('checklist-attachments').getPublicUrl(path);
  return data.publicUrl;
}

/** Resolves and locks in the final score server-side (submit_checklist RPC in
 *  checklists-setup.sql) — never computed client-side, see that file's
 *  comment for why. */
export async function submitChecklist(submissionId: string): Promise<{ total_score: number | null; passed: boolean | null }> {
  const { data, error } = await supabase.rpc('submit_checklist', { p_submission_id: submissionId });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { total_score: number | null; passed: boolean | null } | null;
  return { total_score: row?.total_score ?? null, passed: row?.passed ?? null };
}

const SUBMISSION_SELECT = `
  *,
  store:stores(id, name),
  template:checklist_templates(id, key, name),
  submitted_by_profile:profiles!checklist_submissions_submitted_by_fkey(id, display_name)
`;

/** Ops Manager review: submissions for a given date, optionally filtered by
 *  store/template. RLS already restricts this to ops_manager/admin. */
export async function getSubmissionsForDate(params: {
  date: string;
  storeId?: string;
  templateId?: string;
}): Promise<ChecklistSubmissionWithRelations[]> {
  let query = supabase
    .from('checklist_submissions')
    .select(SUBMISSION_SELECT)
    .eq('submission_date', params.date)
    .order('created_at', { ascending: false });
  if (params.storeId) query = query.eq('store_id', params.storeId);
  if (params.templateId) query = query.eq('template_id', params.templateId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as ChecklistSubmissionWithRelations[];
}

export async function getSubmissionDetail(submissionId: string): Promise<{
  submission: ChecklistSubmissionWithRelations;
  questions: DbChecklistQuestion[];
  answers: DbChecklistAnswer[];
}> {
  const { data: submission, error: subErr } = await supabase
    .from('checklist_submissions')
    .select(SUBMISSION_SELECT)
    .eq('id', submissionId)
    .single();
  if (subErr) throw subErr;

  const [questions, answers] = await Promise.all([
    getQuestions((submission as unknown as ChecklistSubmissionWithRelations).template_id),
    getAnswers(submissionId),
  ]);

  return { submission: submission as unknown as ChecklistSubmissionWithRelations, questions, answers };
}

/** 'YYYY-MM-DD' in Asia/Kolkata — matches checklist_submissions.submission_date's
 *  server-side default, so client-side "today" queries land on the same row
 *  the DB would create, even near the UTC day boundary. */
export function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** For the in-store-manager's "today" list — status of all 4 templates for
 *  their store, without needing 4 separate round trips. */
export async function getTodaySubmissionsForStore(storeId: string): Promise<DbChecklistSubmission[]> {
  const { data, error } = await supabase
    .from('checklist_submissions')
    .select('*')
    .eq('store_id', storeId)
    .eq('submission_date', todayIST());
  if (error) throw error;
  return (data ?? []) as DbChecklistSubmission[];
}

export const TEMPLATE_LABELS: Record<ChecklistTemplateKey, string> = {
  store_opening: 'Store Opening Checklist',
  store_closing: 'Store Closing Checklist',
  sm_checklist: 'SM Checklist',
  scm_checklist: 'SCM Checklist',
};
