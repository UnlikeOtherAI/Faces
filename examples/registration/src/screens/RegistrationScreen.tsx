import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Image, ScrollView,
} from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FaceID from 'react-native-faces';

const DRAFT_KEY = 'registration_draft';

interface Props { onDone: () => void }

export default function RegistrationScreen({ onDone }: Props) {
  const [name, setName]       = useState('');
  const [photos, setPhotos]   = useState<string[]>([]);
  const [status, setStatus]   = useState('');
  const [modelOk, setModelOk] = useState<boolean | null>(null);

  // Restore draft on mount
  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY).then(raw => {
      if (!raw) return;
      try {
        const { name: n, photos: p } = JSON.parse(raw);
        if (n) setName(n);
        if (Array.isArray(p) && p.length) setPhotos(p);
      } catch {}
    });
    FaceID.isModelLoaded().then(setModelOk).catch(() => setModelOk(false));
  }, []);

  // Persist draft whenever name or photos change
  useEffect(() => {
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ name, photos }));
  }, [name, photos]);

  const capture = async () => {
    const result = await launchCamera({ mediaType: 'photo', cameraType: 'front' });
    const uri = result.assets?.[0]?.uri;
    if (!uri) return;
    // Copy from tmp to persistent storage so it survives app restarts
    const persistedUri = await FaceID.persistPhoto(uri);
    setPhotos(p => [...p, persistedUri]);
  };

  const save = async () => {
    if (!name.trim() || photos.length < 3) return;
    setStatus('Saving...');
    try {
      console.log('[Faces] registerWorker photos:', JSON.stringify(photos));
      await FaceID.registerWorker(Date.now().toString(), name.trim(), photos);
      const workers = await FaceID.getWorkers();
      console.log('[Faces] after register, getWorkers:', JSON.stringify(workers));
      setStatus('Saved!');
      setPhotos([]);
      setName('');
      AsyncStorage.removeItem(DRAFT_KEY);
      FaceID.clearDraftPhotos();
      onDone();
    } catch (e: any) {
      setStatus('Error: ' + e.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text accessibilityLabel="registration.title" style={styles.title}>Register User</Text>

      <TextInput
        accessibilityLabel="registration.name_input"
        style={styles.input}
        placeholder="Full name"
        value={name}
        onChangeText={setName}
      />

      <Text accessibilityLabel="registration.photo_count" style={styles.count}>
        {`Photos: ${photos.length} / 5`}
      </Text>

      {photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbnailRow}>
          {photos.map((uri, i) => (
            <Image key={i} source={{ uri }} style={styles.thumbnail} />
          ))}
        </ScrollView>
      )}

      <TouchableOpacity
        accessibilityLabel="registration.capture_button"
        style={[styles.button, photos.length >= 5 && styles.disabled]}
        onPress={capture}
        disabled={photos.length >= 5}
      >
        <Text style={styles.buttonText}>Take Photo</Text>
      </TouchableOpacity>

      <TouchableOpacity
        accessibilityLabel="registration.save_button"
        style={[styles.button, styles.save, (!name || photos.length < 3) && styles.disabled]}
        onPress={save}
        disabled={!name || photos.length < 3}
      >
        <Text style={styles.buttonText}>Save</Text>
      </TouchableOpacity>

      <Text accessibilityLabel="registration.status" style={styles.status}>{status}</Text>

      <Text style={[styles.modelStatus, modelOk === null && styles.modelUnknown,
                                        modelOk === true  && styles.modelLoaded,
                                        modelOk === false && styles.modelMissing]}>
        {modelOk === null  ? 'Model: checking…'
       : modelOk === true  ? 'Model: loaded ✓'
                           : 'Model: NOT loaded ✗'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16 },
  title:     { fontSize: 24, fontWeight: '700' },
  input:     { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 16 },
  count:     { fontSize: 16, color: '#555' },
  button:    { backgroundColor: '#1a73e8', padding: 14, borderRadius: 8, alignItems: 'center' },
  save:      { backgroundColor: '#34a853' },
  disabled:  { opacity: 0.4 },
  buttonText:    { color: '#fff', fontWeight: '600', fontSize: 16 },
  status:        { fontSize: 14, color: '#555', textAlign: 'center' },
  modelStatus:   { fontSize: 13, textAlign: 'center', marginTop: 8 },
  modelUnknown:  { color: '#999' },
  modelLoaded:   { color: '#34a853' },
  modelMissing:  { color: '#d93025' },
  thumbnailRow:  { flexDirection: 'row' },
  thumbnail:     { width: 72, height: 72, borderRadius: 8, marginRight: 8 },
});
