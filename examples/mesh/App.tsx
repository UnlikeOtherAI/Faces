import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { MeshCaptureCard, type MeshCapture, type MeshCompletePayload } from './components/MeshCaptureCard';

type Props = { meshHtml?: string };

export default function App({ meshHtml }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ index: number; total: number } | null>(null);
  const [done, setDone] = useState(false);

  if (!meshHtml) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.fallback}>
          <Text style={styles.fallbackText}>No mesh HTML provided.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleCapture = (c: MeshCapture) => {
    setProgress({ index: c.index + 1, total: c.total });
    // eslint-disable-next-line no-console
    console.log('[capture]', c.id, c.name, `${c.index + 1}/${c.total}`);
  };

  const handleComplete = (p: MeshCompletePayload) => {
    setDone(true);
    // eslint-disable-next-line no-console
    console.log('[complete]', p.captures.length, 'photos');
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#f7f8fa" />
      <MeshCaptureCard
        meshHtml={meshHtml}
        onCapture={handleCapture}
        onComplete={handleComplete}
        onError={setError}
      />
      {progress && !done && (
        <View style={styles.bar}>
          <Text style={styles.barText}>{progress.index} / {progress.total} captured</Text>
        </View>
      )}
      {done && (
        <View style={[styles.bar, styles.barDone]}>
          <Text style={styles.barText}>All captures complete</Text>
        </View>
      )}
      {error && (
        <View style={styles.errorBar}>
          <Text style={styles.errorText} numberOfLines={3}>{error}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f7f8fa' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fallbackText: { color: '#172033', fontSize: 16 },
  bar: { padding: 8, backgroundColor: '#172033' },
  barDone: { backgroundColor: '#39ff14' },
  barText: { color: '#fff', fontSize: 13, textAlign: 'center', fontWeight: '600' },
  errorBar: { padding: 8, backgroundColor: '#ff6680' },
  errorText: { color: '#fff', fontSize: 12 },
});
