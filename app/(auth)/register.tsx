import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Screen } from '../../components/common/Screen';
import { AppHeader } from '../../components/common/AppHeader';
import { supabase } from '../../lib/supabase';
import { getStoreByCode } from '../../lib/api/stores';
import { isValidEmail, isValidPhone, isStrongPassword } from '../../lib/utils/validation';
import { extractErrorMessage } from '../../lib/utils/error';
import { theme } from '../../constants/theme';

export default function Register() {
  const { t } = useTranslation();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [storeId, setStoreId] = useState('');
  const [storeName, setStoreName] = useState('');
  const [storeLocation, setStoreLocation] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setError('');
    if (!firstName.trim() || !lastName.trim()) { setError('First and last name are required'); return; }
    if (!isValidEmail(email)) { setError(t('auth.invalidEmail')); return; }
    if (!isStrongPassword(password)) { setError('Password must be at least 8 characters'); return; }
    if (phone && !isValidPhone(phone)) { setError('Enter a valid 10-digit mobile number'); return; }
    if (!storeId.trim()) { setError('Store ID is required'); return; }

    setLoading(true);

    // Look up the store first — catching an unknown Store ID here (before creating
    // the auth account) avoids leaving behind a signed-up user with no profile.
    const store = await getStoreByCode(storeId.trim());
    if (!store) {
      setLoading(false);
      setError(`Store ID "${storeId.trim().toUpperCase()}" was not found. Check with your admin, or ask them to add it in Supabase.`);
      return;
    }

    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError || !data.user) {
      setLoading(false);
      setError(extractErrorMessage(signUpError));
      return;
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim() || null,
      store_id: store.id,
      store_name: storeName.trim() || store.name,
      store_location: storeLocation.trim() || store.city,
      role: 'user',
      approval_status: 'approved',
    });
    setLoading(false);
    if (profileError) { setError(extractErrorMessage(profileError)); return; }
    router.replace('/(auth)/login');
  };

  return (
    <Screen>
      <AppHeader title={t('register.title')} showBack />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="always">
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Field label={t('register.firstName')} value={firstName} onChangeText={setFirstName} />
        <Field label={t('register.lastName')} value={lastName} onChangeText={setLastName} />
        <Field label={t('register.mobile')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Field
          label={t('register.storeId')}
          value={storeId}
          onChangeText={(v) => setStoreId(v.toUpperCase())}
          autoCapitalize="characters"
        />
        <Field label={t('register.storeName')} value={storeName} onChangeText={setStoreName} />
        <Field label={t('register.storeLocation')} value={storeLocation} onChangeText={setStoreLocation} />
        <Field label={t('register.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <Field label={t('register.password')} value={password} onChangeText={setPassword} secureTextEntry />

        <TouchableOpacity onPress={handleRegister} disabled={loading} style={[styles.submitBtn, theme.shadows.md]} activeOpacity={0.85}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>{t('register.submit')}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
}

function Field(props: {
  label: string; value: string; onChangeText: (v: string) => void;
  keyboardType?: 'default' | 'phone-pad' | 'email-address'; autoCapitalize?: 'none' | 'characters'; secureTextEntry?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        style={styles.textInput}
        value={props.value}
        onChangeText={props.onChangeText}
        keyboardType={props.keyboardType}
        autoCapitalize={props.autoCapitalize ?? 'words'}
        secureTextEntry={props.secureTextEntry}
        placeholderTextColor={theme.colors.textTertiary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl * 2 },
  error: {
    color: '#EF4444', backgroundColor: '#FEE2E2', padding: theme.spacing.md,
    borderRadius: theme.radius.sm, marginBottom: theme.spacing.md, fontSize: 14,
  },
  fieldWrap: { marginBottom: theme.spacing.lg },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary, letterSpacing: 0.8, marginBottom: theme.spacing.xs },
  textInput: {
    backgroundColor: theme.colors.surface2, borderWidth: 1.5, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, height: 50,
    color: theme.colors.textPrimary, fontSize: 15,
  },
  submitBtn: {
    backgroundColor: theme.colors.brand, borderRadius: theme.radius.md, height: 52,
    alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.md,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
