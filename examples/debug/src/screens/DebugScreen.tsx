import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import FaceID, { MatchResult } from 'react-native-faces';

function Row({ label, value, id }: { label: string; value: string; id: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text accessibilityLabel={id} style={styles.value}>{value}</Text>
    </View>
  );
}

export default function DebugScreen() {
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [fps, setFps]     = useState(0);
  const [time, setTime]   = useState(new Date().toLocaleTimeString());
  const frameTimes        = useRef<number[]>([]);

  useEffect(() => {
    const clock = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    FaceID.startRecognition();

    const unsub = FaceID.onFaceRecognized(m => {
      setMatch(m);
      const now = Date.now();
      frameTimes.current = frameTimes.current.filter(t => now - t < 1000);
      frameTimes.current.push(now);
      setFps(frameTimes.current.length);
    });

    return () => {
      clearInterval(clock);
      FaceID.stopRecognition();
      unsub();
    };
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Debug Panel</Text>

      <Row label="Time"    value={time}                                      id="debug.timestamp" />
      <Row label="FPS"     value={String(fps)}                               id="debug.fps" />
      <Row label="Latency" value={match ? `${match.latencyMs}ms` : '—'}      id="debug.latency_ms" />
      <Row label="Score"   value={match ? match.score.toFixed(4) : '—'}      id="debug.similarity_score" />
      <Row label="Match"   value={match?.workerName ?? '—'}                  id="debug.matched_user" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12 },
  heading:   { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 8 },
  row:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderColor: '#222' },
  label:     { fontSize: 14, color: '#888', flex: 1 },
  value:     { fontSize: 14, color: '#00ff88', fontVariant: ['tabular-nums'], flex: 1, textAlign: 'right' },
});
