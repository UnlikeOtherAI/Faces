import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import RecognitionScreen from './screens/RecognitionScreen';

export default function App() {
  return (
    <SafeAreaView style={styles.root}>
      <RecognitionScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#000' } });
