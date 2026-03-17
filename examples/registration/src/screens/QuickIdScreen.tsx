import React, { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import FaceID, { MatchResult } from 'react-native-faces';

export default function QuickIdScreen() {
  const [preload, setPreload] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [result, setResult] = useState<{ name: string; score: number; timeMs: number } | null>(null);
  const startTimeRef = useRef<number>(0);
  const unsubRef = useRef<(() => void) | null>(null);
  const cameraActiveRef = useRef(false);

  // Manage preloaded camera
  useEffect(() => {
    if (preload && !cameraActiveRef.current) {
      FaceID.startRecognition();
      cameraActiveRef.current = true;
    }
    if (!preload && !identifying && cameraActiveRef.current) {
      FaceID.stopRecognition();
      cameraActiveRef.current = false;
    }
    return () => {
      if (cameraActiveRef.current) {
        FaceID.stopRecognition();
        cameraActiveRef.current = false;
      }
    };
  }, [preload, identifying]);

  const handleIdentify = useCallback(() => {
    setIdentifying(true);
    setResult(null);
    startTimeRef.current = performance.now();

    if (!cameraActiveRef.current) {
      FaceID.startRecognition();
      cameraActiveRef.current = true;
    }

    unsubRef.current = FaceID.onFaceRecognized((match: MatchResult) => {
      const elapsed = performance.now() - startTimeRef.current;
      setResult({ name: match.workerName, score: match.score, timeMs: elapsed });
      setIdentifying(false);
      unsubRef.current?.();
      unsubRef.current = null;

      if (!preload) {
        FaceID.stopRecognition();
        cameraActiveRef.current = false;
      }
    });
  }, [preload]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quick ID</Text>

      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Preload camera</Text>
        <Switch
          value={preload}
          onValueChange={setPreload}
          disabled={identifying}
        />
      </View>
      <Text style={styles.toggleHint}>
        {preload ? 'Camera is always active — faster identification' : 'Camera starts on tap — measures full startup time'}
      </Text>

      <View style={styles.center}>
        <TouchableOpacity
          accessibilityLabel="quickid.identify_button"
          style={[styles.identifyButton, identifying && styles.identifyButtonActive]}
          onPress={handleIdentify}
          disabled={identifying}
        >
          <Text style={styles.identifyButtonText}>
            {identifying ? 'Identifying...' : 'Identify'}
          </Text>
        </TouchableOpacity>
      </View>

      {result && (
        <View style={styles.resultCard}>
          <Text style={styles.resultName}>{result.name}</Text>
          <Text style={styles.resultScore}>
            {Math.round(result.score * 100)}% match
          </Text>
          <Text style={styles.resultTime}>
            {result.timeMs.toFixed(0)} ms
          </Text>
        </View>
      )}

      {!result && !identifying && (
        <Text style={styles.hint}>Tap Identify and look at the camera</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:            { flex: 1, padding: 24 },
  title:                { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  toggleRow:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  toggleLabel:          { fontSize: 16 },
  toggleHint:           { fontSize: 12, color: '#999', marginBottom: 32 },
  center:               { alignItems: 'center', marginVertical: 32 },
  identifyButton:       { width: 140, height: 140, borderRadius: 70, backgroundColor: '#1a73e8', justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
  identifyButtonActive: { backgroundColor: '#fbbc04' },
  identifyButtonText:   { color: '#fff', fontSize: 18, fontWeight: '700' },
  resultCard:           { backgroundColor: '#f8f9fa', borderRadius: 12, padding: 24, alignItems: 'center', gap: 8 },
  resultName:           { fontSize: 28, fontWeight: '700', color: '#34a853' },
  resultScore:          { fontSize: 16, color: '#666' },
  resultTime:           { fontSize: 36, fontWeight: '700', color: '#1a73e8' },
  hint:                 { textAlign: 'center', color: '#999', marginTop: 24 },
});
