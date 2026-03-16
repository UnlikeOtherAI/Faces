import React, { useState, useEffect } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import FaceID from 'react-native-faces';
import RegistrationScreen from './screens/RegistrationScreen';
import WorkerListScreen from './screens/WorkerListScreen';

export default function App() {
  const [screen, setScreen] = useState<'register' | 'list' | 'loading'>('loading');

  useEffect(() => {
    FaceID.getWorkers().then(workers => {
      setScreen(workers.length > 0 ? 'list' : 'register');
    }).catch(() => {
      setScreen('register');
    });
  }, []);

  if (screen === 'loading') return <SafeAreaView style={styles.root} />;

  return (
    <SafeAreaView style={styles.root}>
      {screen === 'register'
        ? <RegistrationScreen onDone={() => setScreen('list')} />
        : <WorkerListScreen onBack={() => setScreen('register')} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#fff' } });
