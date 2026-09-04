import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Modal, Pressable, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/common/Screen';
import { getMemberProfiles, createMemberProfile, deleteMemberProfile, MemberProfile } from '../lib/api/memberProfiles';
import { useMemberProfileStore } from '../stores/memberProfileStore';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';
import { showAlert } from '../lib/utils/alert';
import { theme, webNoOutline } from '../constants/theme';

const AVATAR_COLORS = ['#1E3A8A', '#B45309', '#0F766E', '#9333EA', '#BE123C', '#15803D', '#0369A1', '#C2410C'];
const AVATAR_EMOJIS = ['🧑‍💼', '👩‍💼', '🧑‍🔧', '👨‍💻', '👩‍💻', '🧑‍🎓', '💎', '🛍️'];

export default function SelectProfile() {
  const account = useAuthStore((s) => s.profile);
  const setActive = useMemberProfileStore((s) => s.setActive);
  const showToast = useUiStore((s) => s.showToast);
  const qc = useQueryClient();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [creating, setCreating] = useState(false);

  // After choosing/creating a profile: continue to the screen that sent us
  // here (e.g. the ticket composer), else just pop back.
  const proceed = () => {
    if (next) router.replace(`/${next}` as never);
    else router.back();
  };

  const { data: profiles, isLoading } = useQuery({
    queryKey: ['member-profiles', account?.id],
    queryFn: () => getMemberProfiles(account!.id),
    enabled: !!account?.id,
  });

  const pick = (p: MemberProfile) => {
    setActive(account!.id, { id: p.id, name: p.name, phone: p.phone, avatarColor: p.avatar_color, avatarEmoji: p.avatar_emoji });
    proceed();
  };

  const del = useMutation({
    mutationFn: (id: string) => deleteMemberProfile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['member-profiles', account?.id] }),
    onError: (e) => showToast(e instanceof Error ? e.message : 'Could not delete', 'error'),
  });

  const confirmDelete = (p: MemberProfile) =>
    showAlert('Remove profile?', `Remove ${p.name}? Their tickets stay, but the profile is gone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => del.mutate(p.id) },
    ]);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}><Ionicons name="chevron-back" size={26} color="#fff" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Who's raising this?</Text>
        <View style={{ width: 26 }} />
      </View>

      {isLoading ? (
        <View style={styles.loading}><ActivityIndicator color={theme.colors.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          <Text style={styles.subtitle}>Pick your profile so tickets carry your name and phone number.</Text>
          <View style={styles.tiles}>
            {(profiles ?? []).map((p) => (
              <TouchableOpacity key={p.id} style={styles.tile} activeOpacity={0.8} onPress={() => pick(p)} onLongPress={() => confirmDelete(p)}>
                <View style={[styles.avatar, { backgroundColor: p.avatar_color ?? theme.colors.brand }]}>
                  <Text style={styles.avatarEmoji}>{p.avatar_emoji ?? p.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <Text style={styles.tileName} numberOfLines={1}>{p.name}</Text>
                {p.phone ? <Text style={styles.tilePhone}>{p.phone}</Text> : null}
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.tile} activeOpacity={0.8} onPress={() => setCreating(true)}>
              <View style={[styles.avatar, styles.avatarAdd]}><Ionicons name="add" size={34} color={theme.colors.textTertiary} /></View>
              <Text style={styles.tileName}>Add profile</Text>
            </TouchableOpacity>
          </View>
          {(profiles ?? []).length > 0 && <Text style={styles.hint}>Long-press a profile to remove it.</Text>}
        </ScrollView>
      )}

      <CreateProfileModal
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={(p) => {
          setCreating(false);
          qc.invalidateQueries({ queryKey: ['member-profiles', account?.id] });
          pick(p);
        }}
        accountId={account?.id ?? ''}
      />
    </Screen>
  );
}

function CreateProfileModal({ visible, onClose, onCreated, accountId }: {
  visible: boolean; onClose: () => void; onCreated: (p: MemberProfile) => void; accountId: string;
}) {
  const showToast = useUiStore((s) => s.showToast);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [emoji, setEmoji] = useState<string | null>(AVATAR_EMOJIS[0]);

  const reset = () => { setName(''); setPhone(''); setColor(AVATAR_COLORS[0]); setEmoji(AVATAR_EMOJIS[0]); };
  const phoneOk = phone.length === 10;

  const create = useMutation({
    mutationFn: () => createMemberProfile({ accountId, name, phone, avatarColor: color, avatarEmoji: emoji }),
    onSuccess: (p) => { reset(); onCreated(p); },
    onError: (e) => showToast(e instanceof Error ? e.message : 'Could not create profile', 'error'),
  });

  const submit = () => {
    if (!name.trim()) { showToast('Enter a name', 'error'); return; }
    if (!phoneOk) { showToast('Enter a valid 10-digit phone number', 'error'); return; }
    create.mutate();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.sheetTitle}>New profile</Text>

          <View style={[styles.avatar, styles.avatarPreview, { backgroundColor: color }]}>
            <Text style={styles.avatarEmoji}>{emoji ?? (name.slice(0, 1).toUpperCase() || '?')}</Text>
          </View>

          <Text style={styles.label}>NAME</Text>
          <TextInput style={[styles.input, webNoOutline]} value={name} onChangeText={setName} placeholder="e.g. Priya (Counter 2)" placeholderTextColor={theme.colors.textTertiary} maxLength={60} />

          <Text style={styles.label}>PHONE (10 digits)</Text>
          <TextInput style={[styles.input, webNoOutline]} value={phone} onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit phone" placeholderTextColor={theme.colors.textTertiary} keyboardType="number-pad" maxLength={10} />

          <Text style={styles.label}>COLOUR</Text>
          <View style={styles.swatchRow}>
            {AVATAR_COLORS.map((c) => (
              <TouchableOpacity key={c} onPress={() => setColor(c)} style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]} />
            ))}
          </View>

          <Text style={styles.label}>ICON</Text>
          <View style={styles.swatchRow}>
            {AVATAR_EMOJIS.map((e) => (
              <TouchableOpacity key={e} onPress={() => setEmoji(e)} style={[styles.emojiPick, emoji === e && styles.emojiPickActive]}>
                <Text style={{ fontSize: 20 }}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={[styles.createBtn, (!name.trim() || !phoneOk) && { opacity: 0.5 }]} onPress={submit} disabled={create.isPending}>
            {create.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>Create profile</Text>}
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.brand, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.md },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grid: { padding: theme.spacing.lg },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: theme.spacing.lg, lineHeight: 20 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg, justifyContent: 'center' },
  tile: { width: 96, alignItems: 'center', gap: 8 },
  avatar: { width: 84, height: 84, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarAdd: { backgroundColor: theme.colors.surface2, borderWidth: 2, borderColor: theme.colors.border, borderStyle: 'dashed' },
  avatarEmoji: { fontSize: 34, color: '#fff', fontWeight: '800' },
  avatarPreview: { alignSelf: 'center', marginBottom: theme.spacing.md },
  tileName: { fontSize: 14, fontWeight: '700', color: theme.colors.textPrimary, textAlign: 'center' },
  tilePhone: { fontSize: 11, color: theme.colors.textTertiary },
  hint: { fontSize: 12, color: theme.colors.textTertiary, textAlign: 'center', marginTop: theme.spacing.xl },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.textPrimary, textAlign: 'center', marginBottom: theme.spacing.md },
  label: { fontSize: 11, fontWeight: '800', color: theme.colors.textTertiary, letterSpacing: 0.8, marginTop: theme.spacing.md, marginBottom: 6 },
  input: { backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, paddingHorizontal: theme.spacing.md, height: 46, color: theme.colors.textPrimary, fontSize: 15 },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: 'transparent' },
  swatchActive: { borderColor: theme.colors.textPrimary },
  emojiPick: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface2, borderWidth: 2, borderColor: 'transparent' },
  emojiPickActive: { borderColor: theme.colors.brand },
  createBtn: { backgroundColor: theme.colors.brand, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: theme.spacing.lg },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
