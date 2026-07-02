import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { router } from 'expo-router';
import { DbProfile } from '../../types';

interface Props {
  profile: DbProfile;
}

function getRoute(role: DbProfile['role']): string {
  if (role === 'technician') return '/(technician)/profile';
  if (role === 'admin') return '/(admin)/profile';
  if (role === 'manager') return '/(manager)/profile';
  return '/(user)/profile';
}

export function ProfileIconButton({ profile }: Props) {
  const initials = profile.display_name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <TouchableOpacity
      onPress={() => router.push(getRoute(profile.role) as never)}
      style={styles.btn}
      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
    >
      <View style={styles.avatar}>
        <Text style={styles.initials}>{initials}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    marginRight: 12,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
