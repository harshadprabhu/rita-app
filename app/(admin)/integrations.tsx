import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Switch,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '../../components/common/Screen';
import { AppHeader } from '../../components/common/AppHeader';
import { LoadingOverlay } from '../../components/common/LoadingOverlay';
import {
  getIntegrationSettings, saveIntegrationSettings, applySsoConfig,
  IntegrationSettingsInput,
} from '../../lib/api/integrationSettings';
import { useUiStore } from '../../stores/uiStore';
import { QUERY_KEYS } from '../../constants/queryKeys';
import { extractErrorMessage } from '../../lib/utils/error';
import { theme, webNoOutline } from '../../constants/theme';

// ─── Reusable labeled input ──────────────────────────────────────────────────
interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  autoCapitalize?: 'none' | 'sentences';
}
function Field({ label, value, onChangeText, placeholder, secure, autoCapitalize = 'none' }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputWrap, focused && styles.inputWrapFocused]}>
        <TextInput
          style={[styles.input, webNoOutline]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textTertiary}
          secureTextEntry={secure && !reveal}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {secure ? (
          <TouchableOpacity onPress={() => setReveal((r) => !r)} hitSlop={8}>
            <MaterialCommunityIcons
              name={reveal ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={theme.colors.textTertiary}
            />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

// ─── Section card ────────────────────────────────────────────────────────────
function Card({ icon, title, subtitle, children }: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <View style={[styles.card, theme.shadows.sm]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIcon}>
          <MaterialCommunityIcons name={icon} size={20} color={theme.colors.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

export default function AdminIntegrations() {
  const { t } = useTranslation();
  const showToast = useUiStore((s) => s.showToast);

  const { data, isLoading, refetch } = useQuery({
    queryKey: QUERY_KEYS.integrationSettings(),
    queryFn: getIntegrationSettings,
  });

  // Gold Rate form state
  const [d365ClientId, setD365ClientId] = useState('');
  const [d365Secret, setD365Secret] = useState('');
  const [d365TenantId, setD365TenantId] = useState('');
  const [d365Resource, setD365Resource] = useState('');
  const [d365Warehouse, setD365Warehouse] = useState('');
  const [savingGold, setSavingGold] = useState(false);

  // SSO form state
  const [azureClientId, setAzureClientId] = useState('');
  const [azureSecret, setAzureSecret] = useState('');
  const [azureTenantUrl, setAzureTenantUrl] = useState('');
  const [azureEnabled, setAzureEnabled] = useState(true);
  const [savingSso, setSavingSso] = useState(false);

  // Populate non-secret fields once settings load.
  useEffect(() => {
    if (!data) return;
    setD365ClientId(data.d365_client_id ?? '');
    setD365TenantId(data.d365_tenant_id ?? '');
    setD365Resource(data.d365_resource_url ?? '');
    setD365Warehouse(data.d365_warehouse ?? '');
    setAzureClientId(data.azure_client_id ?? '');
    setAzureTenantUrl(data.azure_tenant_url ?? '');
    setAzureEnabled(data.azure_enabled);
  }, [data]);

  const secretPlaceholder = (isSet: boolean) =>
    isSet ? t('integrations.secretStored') : t('integrations.secretEmpty');

  const saveGold = async () => {
    setSavingGold(true);
    try {
      const payload: IntegrationSettingsInput = {
        d365_client_id: d365ClientId.trim(),
        d365_tenant_id: d365TenantId.trim(),
        d365_resource_url: d365Resource.trim(),
        d365_warehouse: d365Warehouse.trim(),
      };
      if (d365Secret.trim()) payload.d365_client_secret = d365Secret.trim();
      await saveIntegrationSettings(payload);
      setD365Secret('');
      await refetch();
      showToast(t('integrations.goldSaved'), 'success');
    } catch (e) {
      showToast(extractErrorMessage(e), 'error');
    } finally {
      setSavingGold(false);
    }
  };

  const saveSso = async () => {
    setSavingSso(true);
    try {
      const payload: IntegrationSettingsInput = {
        azure_client_id: azureClientId.trim(),
        azure_tenant_url: azureTenantUrl.trim(),
        azure_enabled: azureEnabled,
      };
      if (azureSecret.trim()) payload.azure_client_secret = azureSecret.trim();
      await saveIntegrationSettings(payload);
      setAzureSecret('');
      await refetch();
      // Push into Supabase Auth. Non-fatal if the apply step isn't configured.
      try {
        const res = await applySsoConfig();
        showToast(
          res.applied ? t('integrations.ssoApplied') : (res.message ?? t('integrations.ssoSavedNotApplied')),
          res.applied ? 'success' : 'info',
        );
      } catch {
        showToast(t('integrations.ssoSavedNotApplied'), 'info');
      }
    } catch (e) {
      showToast(extractErrorMessage(e), 'error');
    } finally {
      setSavingSso(false);
    }
  };

  if (isLoading) return <LoadingOverlay />;

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader title={t('integrations.title')} showBack />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Gold Rate API */}
        <Card
          icon="gold"
          title={t('integrations.goldTitle')}
          subtitle={t('integrations.goldSubtitle')}
        >
          <Field label={t('integrations.clientId')} value={d365ClientId} onChangeText={setD365ClientId} placeholder="00000000-0000-0000-0000-000000000000" />
          <Field label={t('integrations.clientSecret')} value={d365Secret} onChangeText={setD365Secret} placeholder={secretPlaceholder(!!data?.d365_client_secret_set)} secure />
          <Field label={t('integrations.tenantId')} value={d365TenantId} onChangeText={setD365TenantId} placeholder="00000000-0000-0000-0000-000000000000" />
          <Field label={t('integrations.resourceUrl')} value={d365Resource} onChangeText={setD365Resource} placeholder="https://novel.operations.dynamics.com" />
          <Field label={t('integrations.warehouse')} value={d365Warehouse} onChangeText={setD365Warehouse} placeholder="NS0001" />
          <TouchableOpacity onPress={saveGold} disabled={savingGold} style={[styles.saveBtn, theme.shadows.brand]} activeOpacity={0.85}>
            {savingGold ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{t('integrations.save')}</Text>}
          </TouchableOpacity>
          <Text style={styles.hint}>{t('integrations.goldHint')}</Text>
        </Card>

        {/* Microsoft SSO */}
        <Card
          icon="microsoft"
          title={t('integrations.ssoTitle')}
          subtitle={t('integrations.ssoSubtitle')}
        >
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t('integrations.ssoEnabled')}</Text>
            <Switch
              value={azureEnabled}
              onValueChange={setAzureEnabled}
              trackColor={{ true: theme.colors.brand, false: theme.colors.border }}
              thumbColor="#fff"
            />
          </View>
          <Field label={t('integrations.clientId')} value={azureClientId} onChangeText={setAzureClientId} placeholder="00000000-0000-0000-0000-000000000000" />
          <Field label={t('integrations.clientSecret')} value={azureSecret} onChangeText={setAzureSecret} placeholder={secretPlaceholder(!!data?.azure_client_secret_set)} secure />
          <Field label={t('integrations.tenantUrl')} value={azureTenantUrl} onChangeText={setAzureTenantUrl} placeholder="https://login.microsoftonline.com/<tenant-id>/v2.0" />
          <TouchableOpacity onPress={saveSso} disabled={savingSso} style={[styles.saveBtn, theme.shadows.brand]} activeOpacity={0.85}>
            {savingSso ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{t('integrations.saveApply')}</Text>}
          </TouchableOpacity>
          <Text style={styles.hint}>{t('integrations.ssoHint')}</Text>
        </Card>

      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl * 2, gap: theme.spacing.lg },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.lg },
  cardIcon: {
    width: 40, height: 40, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.brand + '1A',
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontWeight: '700', color: theme.colors.textPrimary, fontSize: 16 },
  cardSubtitle: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 },
  field: { marginBottom: theme.spacing.md },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary, letterSpacing: 0.6, marginBottom: theme.spacing.xs },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md, height: 48,
  },
  inputWrapFocused: { borderColor: theme.colors.brand, backgroundColor: theme.colors.surface },
  input: { flex: 1, color: theme.colors.textPrimary, fontSize: 14, paddingVertical: 0 },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: theme.spacing.md, paddingVertical: theme.spacing.xs,
  },
  switchLabel: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  saveBtn: {
    backgroundColor: theme.colors.brand, borderRadius: theme.radius.md, height: 50,
    alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.sm,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  hint: { color: theme.colors.textTertiary, fontSize: 11, marginTop: theme.spacing.md, lineHeight: 16 },
});
