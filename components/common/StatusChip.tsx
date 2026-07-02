import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { TicketStatus, TicketLifecycle } from '../../types';
import { theme } from '../../constants/theme';

interface StatusProps {
  status: TicketStatus;
  small?: boolean;
}

export function StatusChip({ status, small = false }: StatusProps) {
  const { t } = useTranslation();
  const colors = theme.statusColors[status];
  return (
    <View style={[styles.chip, { backgroundColor: colors.bg }, small && styles.small]}>
      <Text style={[styles.label, { color: colors.text }, small && styles.smallText]}>
        {t(`status.${status}`)}
      </Text>
    </View>
  );
}

interface LifecycleProps {
  lifecycle: TicketLifecycle;
  small?: boolean;
}

export function LifecycleChip({ lifecycle, small = false }: LifecycleProps) {
  const { t } = useTranslation();
  const colors = theme.lifecycleColors[lifecycle];
  return (
    <View style={[styles.chip, { backgroundColor: colors.bg }, small && styles.small]}>
      <Text style={[styles.label, { color: colors.text }, small && styles.smallText]}>
        {t(`lifecycle.${lifecycle}`)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    alignSelf: 'flex-start',
  },
  small: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
  },
  smallText: {
    fontSize: 10,
  },
});
