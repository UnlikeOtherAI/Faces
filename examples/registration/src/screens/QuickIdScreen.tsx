import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import FaceID, { MatchResult } from 'react-native-faces';

export default function QuickIdScreen() {
  const [preload, setPreload] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [result, setResult] = useState<{ name: string; score: number; timeMs: number } | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const startTime = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);

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
    return () => {
      cleanupRef.current?.();
      FaceID.stopRecognition();
    };
  }, []);

  const handleIdentify = () => {
    setIdentifying(true);
    setResult(null);
    startTime.current = Date.now();

    const startCamera = cameraOn
      ? Promise.resolve()
      : FaceID.startRecognition().then(() => setCameraOn(true));

    startCamera.then(() => {
      let bestMatch: MatchResult | null = null;
      let settled = false;

      const settle = (match: MatchResult | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubScores();
        unsubMatch();
        cleanupRef.current = null;

        const elapsed = Date.now() - startTime.current;
        if (match && match.score > 0.3) {
          setResult({ name: match.workerName, score: match.score, timeMs: elapsed });
        } else {
          setResult({ name: 'No match', score: 0, timeMs: elapsed });
        }
        setIdentifying(false);
        if (!preload) {
          FaceID.stopRecognition().then(() => setCameraOn(false));
        }
      };

      // Listen for high-confidence match (instant resolve)
      const unsubMatch = FaceID.onFaceRecognized((match: MatchResult) => {
        settle(match);
      });

      // Track best score from all-scores stream as fallback
      const unsubScores = FaceID.onAllScores((scores: MatchResult[]) => {
        const top = scores.reduce((best, s) => s.score > best.score ? s : best, scores[0]);
        if (top && (!bestMatch || top.score > bestMatch.score)) {
          bestMatch = top;
        }
      });

      // After 4 seconds, use whatever best match we have
      const timer = setTimeout(() => {
        settle(bestMatch);
      }, 4000);

      cleanupRef.current = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          unsubScores();
          unsubMatch();
        }
      };
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
          <Text style={[styles.resultName, result.score === 0 && { color: '#ea4335' }]}>
            {result.name}
          </Text>
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
