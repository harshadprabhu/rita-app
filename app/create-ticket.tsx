import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Screen } from '../components/common/Screen';
import { AppHeader } from '../components/common/AppHeader';
import { createTicket, uploadAttachment } from '../lib/api/tickets';
import { classifyTicket } from '../lib/utils/categoryClassifier';
import { useAuthStore } from '../stores/authStore';
import { QUERY_KEYS } from '../constants/queryKeys';
import { ALL_PRIORITIES } from '../constants/ticket';
import { TicketPriority } from '../types';
import { theme } from '../constants/theme';

const MAX_ATTACHMENTS = 5;

export default function CreateTicket() {
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [images, setImages] = useState<{ uri: string; name: string }[]>([]);

  const submit = useMutation({
    mutationFn: async () => {
      if (!profile?.store_id) throw new Error('No store assigned to your account');
      const { category, subcategory } = classifyTicket(description);
      const ticket = await createTicket({
        requester_id: profile.id,
        store_id: profile.store_id,
        description,
        priority,
        category,
        subcategory,
        source: 'form',
      });
      for (const img of images) {
        await uploadAttachment(ticket.id, img.uri, img.name, 'image');
      }
      return ticket;
    },
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tickets() });
      router.replace(`/tickets/${ticket.id}`);
    },
  });

  const pickImage = async () => {
    if (images.length >= MAX_ATTACHMENTS) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setImages((prev) => [...prev, { uri: asset.uri, name: asset.fileName ?? `photo_${Date.now()}.jpg` }]);
    }
  };

  return (
    <Screen>
      <AppHeader title="Report an Issue" showBack />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="always">
        <Text style={styles.label}>Describe the issue</Text>
        <TextInput
          style={styles.textArea}
          value={description}
          onChangeText={setDescription}
          placeholder="What happened? Be as specific as possible…"
          placeholderTextColor={theme.colors.textTertiary}
          multiline
          numberOfLines={5}
        />

        <Text style={[styles.label, styles.spaced]}>Priority</Text>
        <View style={styles.pillRow}>
          {ALL_PRIORITIES.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.pill, priority === p && { backgroundColor: theme.priorityColors[p] + '22', borderColor: theme.priorityColors[p] }]}
              onPress={() => setPriority(p)}
            >
              <Text style={[styles.pillText, priority === p && { color: theme.priorityColors[p] }]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.label, styles.spaced]}>Photos ({images.length}/{MAX_ATTACHMENTS})</Text>
        <View style={styles.imagesRow}>
          {images.map((img, i) => (
            <Image key={i} source={{ uri: img.uri }} style={styles.thumb} />
          ))}
          {images.length < MAX_ATTACHMENTS && (
            <TouchableOpacity style={styles.addThumb} onPress={pickImage}>
              <Ionicons name="camera-outline" size={22} color={theme.colors.brand} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, theme.shadows.md, (!description.trim() || submit.isPending) && styles.submitBtnDisabled]}
          onPress={() => submit.mutate()}
          disabled={!description.trim() || submit.isPending}
        >
          {submit.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit Ticket</Text>}
        </TouchableOpacity>
        {submit.isError && <Text style={styles.error}>{String(submit.error)}</Text>}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl * 2 },
  label: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary, letterSpacing: 0.8, marginBottom: theme.spacing.xs },
  spaced: { marginTop: theme.spacing.lg },
  textArea: {
    backgroundColor: theme.colors.surface2, borderWidth: 1.5, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, padding: theme.spacing.md, color: theme.colors.textPrimary,
    fontSize: 14, minHeight: 110, textAlignVertical: 'top',
  },
  pillRow: { flexDirection: 'row', gap: theme.spacing.sm },
  pill: {
    flex: 1, alignItems: 'center', paddingVertical: theme.spacing.sm, borderRadius: theme.radius.sm,
    borderWidth: 1.5, backgroundColor: theme.colors.surface2, borderColor: theme.colors.border,
  },
  pillText: { fontSize: 12, fontWeight: '700', color: theme.colors.textTertiary, textTransform: 'capitalize' },
  imagesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  thumb: { width: 72, height: 72, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.colors.border },
  addThumb: {
    width: 72, height: 72, borderRadius: theme.radius.sm, borderWidth: 1.5, borderColor: theme.colors.border,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surface2,
  },
  submitBtn: {
    backgroundColor: theme.colors.brand, borderRadius: theme.radius.md, height: 52,
    alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.xl,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  error: { color: theme.colors.error, fontSize: 13, marginTop: theme.spacing.md, textAlign: 'center' },
});
