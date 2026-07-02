import React from 'react';
import { StyleSheet, View } from 'react-native';
import { TicketPriority } from '../../types';
import { theme } from '../../constants/theme';

interface Props {
  priority: TicketPriority;
}

export function PriorityBadge({ priority }: Props) {
  return (
    <View style={[styles.dot, { backgroundColor: theme.priorityColors[priority] }]} />
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
});
