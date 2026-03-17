import React, { useState, useEffect } from 'react';
import { SafeAreaView, View, TouchableOpacity, Text, Image, StyleSheet } from 'react-native';
import FaceID from 'react-native-faces';
try {
  const { AppReveal } = require('react-native-appreveal');
  if (__DEV__) AppReveal.start();
} catch (e) {
  console.warn('[AppReveal] Failed to start:', e);
}

const tabIcons = {
  users: require('./assets/tab-users.png'),
  'identify-all': require('./assets/tab-identify-all.png'),
  'quick-id': require('./assets/tab-quick-id.png'),
};
import RegistrationScreen from './screens/RegistrationScreen';
import WorkerListScreen from './screens/WorkerListScreen';
import IdentifyAllScreen from './screens/IdentifyAllScreen';
import QuickIdScreen from './screens/QuickIdScreen';

type Tab = 'users' | 'identify-all' | 'quick-id';

export default function App() {
  const [tab, setTab] = useState<Tab>('users');
  const [hasWorkers, setHasWorkers] = useState<boolean | null>(null);

  useEffect(() => {
    FaceID.getWorkers().then(w => setHasWorkers(w.length > 0)).catch(() => setHasWorkers(false));
  }, []);

  if (hasWorkers === null) return <SafeAreaView style={styles.root} />;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.content}>
        {tab === 'users' && (
          hasWorkers
            ? <WorkerListScreen onBack={() => setHasWorkers(false)} />
            : <RegistrationScreen onDone={() => setHasWorkers(true)} />
        )}
        {tab === 'identify-all' && <IdentifyAllScreen />}
        {tab === 'quick-id' && <QuickIdScreen />}
      </View>

      <View style={styles.tabBar}>
        <TabButton label="Users" icon={tabIcons.users} active={tab === 'users'} onPress={() => setTab('users')} />
        <TabButton label="Identify All" icon={tabIcons['identify-all']} active={tab === 'identify-all'} onPress={() => setTab('identify-all')} />
        <TabButton label="Quick ID" icon={tabIcons['quick-id']} active={tab === 'quick-id'} onPress={() => setTab('quick-id')} />
      </View>
    </SafeAreaView>
  );
}

function TabButton({ label, icon, active, onPress }: {
  label: string; icon: any; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityLabel={`tab.${label.toLowerCase().replace(' ', '_')}`}
      style={styles.tab}
      onPress={onPress}
    >
      <Image source={icon} style={[styles.tabIcon, !active && styles.tabIconInactive]} />
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: '#fff' },
  content:        { flex: 1 },
  tabBar:         { flexDirection: 'row', borderTopWidth: 1, borderColor: '#e0e0e0', paddingBottom: 4 },
  tab:            { flex: 1, alignItems: 'center', paddingVertical: 8 },
  tabIcon:         { width: 28, height: 28, borderRadius: 6, marginBottom: 4 },
  tabIconInactive: { opacity: 0.3 },
  tabLabel:        { fontSize: 13, color: '#999' },
  tabLabelActive:  { color: '#000', fontWeight: '600' },
});
