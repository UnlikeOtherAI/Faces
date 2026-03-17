import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import FaceID, { MatchResult, Worker, FacesCameraView } from 'react-native-faces';

interface WorkerScore {
  id: string;
  name: string;
  photoUri?: string;
  score: number;
}

export default function IdentifyAllScreen() {
  const [scores, setScores] = useState<WorkerScore[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);

  useEffect(() => {
    FaceID.getWorkers().then(setWorkers);
  }, []);

  useEffect(() => {
    console.log('[IdentifyAll] Starting recognition, workers:', workers.length);
    FaceID.startRecognition()
      .then(() => console.log('[IdentifyAll] startRecognition resolved'))
      .catch((e: any) => console.log('[IdentifyAll] startRecognition error:', e?.message));

    // Also listen for single matches to verify pipeline works
    const unsubMatch = FaceID.onFaceRecognized((m: MatchResult) => {
      console.log('[IdentifyAll] Got single match:', m.workerName, m.score);
    });

    const THRESHOLD = 0.5;
    const unsub = FaceID.onAllScores((results: MatchResult[]) => {
      setScores(
        results
          .filter(r => r.score >= THRESHOLD)
          .map(r => ({
            id: r.workerId,
            name: r.workerName,
            photoUri: workers.find(w => w.id === r.workerId)?.photoUri,
            score: r.score,
          }))
          .sort((a, b) => b.score - a.score),
      );
    });
    return () => {
      unsub();
      unsubMatch();
      FaceID.stopRecognition();
    };
  }, [workers]);

  return (
    <View style={styles.container}>
      <FacesCameraView style={styles.camera} />

      <Text style={styles.title}>Identify All</Text>

      {scores.length === 0 && workers.length === 0 && (
        <Text style={styles.empty}>No registered users. Register someone first.</Text>
      )}
      {scores.length === 0 && workers.length > 0 && (
        <Text style={styles.empty}>Scanning...</Text>
      )}

      <FlatList
        data={scores}
        keyExtractor={s => s.id}
        renderItem={({ item }) => {
          const pct = Math.round(Math.max(0, item.score) * 100);
          return (
            <View style={styles.row}>
              <View style={styles.info}>
                <Text style={styles.name}>{item.name}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct}%` }, pct > 70 ? styles.barHigh : pct > 40 ? styles.barMed : styles.barLow]} />
                </View>
              </View>
              <Text style={[styles.pct, pct > 70 && styles.pctHigh]}>{pct}%</Text>
            </View>
          );
        }}
      />

      <Text style={styles.status}>Camera active</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24 },
  camera:    { height: 120, borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
  title:     { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  empty:     { textAlign: 'center', color: '#999', marginTop: 40 },
  row:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee' },
  info:      { flex: 1 },
  name:      { fontSize: 16, fontWeight: '500', marginBottom: 4 },
  barTrack:  { height: 6, backgroundColor: '#eee', borderRadius: 3, overflow: 'hidden' },
  barFill:   { height: 6, borderRadius: 3 },
  barHigh:   { backgroundColor: '#34a853' },
  barMed:    { backgroundColor: '#fbbc04' },
  barLow:    { backgroundColor: '#ea4335' },
  pct:       { fontSize: 20, fontWeight: '700', color: '#666', width: 60, textAlign: 'right' },
  pctHigh:   { color: '#34a853' },
  status:    { textAlign: 'center', color: '#1a73e8', marginTop: 12, fontSize: 14 },
});
