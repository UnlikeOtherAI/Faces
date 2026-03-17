import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import FaceID, { MatchResult } from 'react-native-faces';

export default function QuickIdScreen() {
  const [preload, setPreload] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [result, setResult] = useState<{ name: string; score: number; timeMs: number } | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const startTime = useRef(0);

  // Start/stop camera based on preload toggle
  useEffect(() => {
    if (preload) {
      FaceID.startRecognition().then(() => setCameraOn(true));
    } else if (cameraOn && !identifying) {
      FaceID.stopRecognition().then(() => setCameraOn(false));
    }
  }, [preload]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { FaceID.stopRecognition(); };
  }, []);

  const handleIdentify = () => {
    setIdentifying(true);
    setResult(null);
    startTime.current = Date.now();

    const startCamera = cameraOn
      ? Promise.resolve()
      : FaceID.startRecognition().then(() => setCameraOn(true));

    startCamera.then(() => {
      const unsub = FaceID.onFaceRecognized((match: MatchResult) => {
        const elapsed = Date.now() - startTime.current;
        setResult({ name: match.workerName, score: match.score, timeMs: elapsed });
        setIdentifying(false);
        unsub();
        if (!preload) {
          FaceID.stopRecognition().then(() => setCameraOn(false));
        }
      });
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quick ID</Text>

      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Preload camera</Text>
        <Switch
          value={preload}
          onValueChange={v => { if (!identifying) setPreload(v); }}
        />
      </View>
      <Text style={styles.toggleHint}>
        {preload ? 'Camera always active — faster ID' : 'Camera starts on tap — measures full startup'}
      </Text>

      <View style={styles.center}>
        <TouchableOpacity
          accessibilityLabel="quickid.identify_button"
          style={[styles.identifyButton, identifying && styles.identifyButtonActive]}
          onPress={handleIdentify}
          disabled={identifying}
          activeOpacity={0.7}
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
            {result.timeMs} ms
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
