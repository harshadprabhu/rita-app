import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

interface State { error: Error | null; info: string }

/**
 * Catches render/lifecycle errors anywhere below it and shows the message on
 * screen instead of the app dying silently. In a release APK there's no redbox,
 * so without this a thrown error is just a crash with no way to see the cause.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, info: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    this.setState({ info: info?.componentStack ?? '' });
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    return (
      <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Something broke</Text>
        <Text style={styles.msg}>{error.message || String(error)}</Text>
        {!!error.stack && <Text style={styles.stack}>{error.stack.slice(0, 1500)}</Text>}
        {!!info && <Text style={styles.stack}>{info.slice(0, 1200)}</Text>}
      </ScrollView>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#1A2D5C' },
  content: { padding: 20, paddingTop: 60 },
  title: { color: '#E0B55A', fontSize: 20, fontWeight: '800', marginBottom: 10 },
  msg: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 14 },
  stack: { color: 'rgba(255,255,255,0.65)', fontSize: 10, lineHeight: 14, marginBottom: 12 },
});
