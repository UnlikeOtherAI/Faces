import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image } from 'react-native';
import FaceID, { Worker } from 'react-native-faces';

interface Props { onBack: () => void }

export default function WorkerListScreen({ onBack }: Props) {
  const [workers, setWorkers] = useState<Worker[]>([]);

  const refresh = useCallback(() => {
    FaceID.getWorkers().then(setWorkers);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <View style={styles.container}>
      <Text accessibilityLabel="workerlist.title" style={styles.title}>Registered Users</Text>

      <FlatList
        accessibilityLabel="workerlist.list"
        data={workers}
        keyExtractor={w => w.id}
        ListEmptyComponent={
          <Text accessibilityLabel="workerlist.empty" style={styles.empty}>No users registered yet.</Text>
        }
        renderItem={({ item, index }) => (
          <View accessibilityLabel={`workerlist.item_${index}`} style={styles.row}>
            {item.photoUri
              ? <Image source={{ uri: item.photoUri }} style={styles.avatar} />
              : <View style={[styles.avatar, styles.avatarPlaceholder]} />}
            <Text style={styles.name}>{item.name}</Text>
            <TouchableOpacity
              accessibilityLabel={`workerlist.delete_${index}`}
              onPress={() => FaceID.deleteWorker(item.id).then(refresh)}
            >
              <Text style={styles.delete}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      />

      <TouchableOpacity
        accessibilityLabel="workerlist.back_button"
        style={styles.button}
        onPress={onBack}
      >
        <Text style={styles.buttonText}>Register Another</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, padding: 24 },
  title:             { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  row:               { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' },
  avatar:            { width: 48, height: 48, borderRadius: 24 },
  avatarPlaceholder: { backgroundColor: '#e0e0e0' },
  name:              { flex: 1, fontSize: 16 },
  delete:            { color: '#d93025', fontWeight: '600' },
  empty:             { textAlign: 'center', color: '#999', marginTop: 40 },
  button:            { backgroundColor: '#1a73e8', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 16 },
  buttonText:        { color: '#fff', fontWeight: '600', fontSize: 16 },
});
