import React, { useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import RegistrationScreen from './screens/RegistrationScreen';
import WorkerListScreen from './screens/WorkerListScreen';

export default function App() {
  const [screen, setScreen] = useState<'register' | 'list'>('register');
  return (
    <SafeAreaView style={styles.root}>
      {screen === 'register'
        ? <RegistrationScreen onDone={() => setScreen('list')} />
        : <WorkerListScreen onBack={() => setScreen('register')} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#fff' } });
