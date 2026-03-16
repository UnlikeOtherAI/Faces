import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import FaceID, { MatchResult } from 'react-native-faces';

export default function RecognitionScreen() {
  const [match, setMatch]   = useState<MatchResult | null>(null);
  const [time, setTime]     = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    FaceID.startRecognition();
    const unsub = FaceID.onFaceRecognized(setMatch);
    return () => {
      clearInterval(timer);
      FaceID.stopRecognition();
      unsub();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text accessibilityLabel="recognition.timestamp" style={styles.time}>{time}</Text>

      <Text
        accessibilityLabel="recognition.matched_user"
        style={[styles.name, match ? styles.matched : styles.noMatch]}
      >
        {match ? match.workerName : 'No match'}
      </Text>

      <Text accessibilityLabel="recognition.score" style={styles.score}>
        {match ? `Score: ${match.score.toFixed(3)}` : '—'}
      </Text>

      <Text accessibilityLabel="recognition.status" style={styles.status}>● Live</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', gap: 16 },
  time:      { fontSize: 18, color: '#aaa', fontVariant: ['tabular-nums'] },
  name:      { fontSize: 48, fontWeight: '700', textAlign: 'center' },
  matched:   { color: '#34a853' },
  noMatch:   { color: '#555' },
  score:     { fontSize: 16, color: '#888' },
  status:    { fontSize: 14, color: '#1a73e8', marginTop: 24 },
});
