import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import DebugScreen from './screens/DebugScreen';

export default function App() {
  return (
    <SafeAreaView style={styles.root}>
      <DebugScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#0d0d0d' } });
