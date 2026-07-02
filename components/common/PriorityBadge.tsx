import React from 'react';
import { StyleSheet, View } from 'react-native';
import { TicketPriority } from '../../types';
import { theme } from '../../constants/theme';

interface Props {
  priority: TicketPriority;
}

const URGENT: TicketPriority[] = ['high', 'critical'];

export function PriorityBadge({ priority }: Props) {
  const color = theme.priorityColors[priority];
  const urgent = URGENT.includes(priority);
  return (
    <View style={[styles.ring, urgent && { backgroundColor: color + '26' }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: 14,
    height: 14,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
});
