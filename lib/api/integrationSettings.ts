import { supabase } from '../supabase';

/** Masked settings as returned by the admin_get_integration_settings RPC. */
export interface IntegrationSettings {
  d365_client_id: string | null;
  d365_tenant_id: string | null;
  d365_resource_url: string | null;
  d365_warehouse: string | null;
  d365_client_secret_set: boolean;
  azure_client_id: string | null;
  azure_tenant_url: string | null;
  azure_enabled: boolean;
  azure_client_secret_set: boolean;
  updated_at: string | null;
}

/**
 * Payload for saving. Non-secret fields overwrite whenever present; secret
 * fields (the two `*_secret`) are only written when a non-empty value is sent,
 * so leaving them blank preserves the stored secret.
 */
export interface IntegrationSettingsInput {
  d365_client_id?: string;
  d365_tenant_id?: string;
  d365_resource_url?: string;
  d365_warehouse?: string;
  d365_client_secret?: string;
  azure_client_id?: string;
  azure_tenant_url?: string;
  azure_enabled?: boolean;
  azure_client_secret?: string;
}

export async function getIntegrationSettings(): Promise<IntegrationSettings> {
  const { data, error } = await supabase.rpc('admin_get_integration_settings');
  if (error) throw error;
  return data as IntegrationSettings;
}

export async function saveIntegrationSettings(
  input: IntegrationSettingsInput,
): Promise<IntegrationSettings> {
  const { data, error } = await supabase.rpc('admin_save_integration_settings', { p: input });
  if (error) throw error;
  return data as IntegrationSettings;
}

export interface ApplySsoResult {
  applied: boolean;
  message?: string;
  reason?: string;
}

/** Push the saved SSO config into Supabase Auth (via the apply-sso-config fn). */
export async function applySsoConfig(): Promise<ApplySsoResult> {
  const { data, error } = await supabase.functions.invoke('apply-sso-config', { body: {} });
  if (error) throw error;
  return data as ApplySsoResult;
}
