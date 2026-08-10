import { useEffect, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { listAgents, liveCalls } from '../lib/api';

/**
 * Home screen (Day 65 scaffold): the signed-in operator's agents + a live-call count. Auth,
 * Agent Desk transfers, and push notifications build on the same API contract. This is a
 * scaffold — the full RN app is developed + released from this standalone Expo project.
 */
export default function Home() {
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    listAgents().then(setAgents).catch(() => setAgents([]));
    liveCalls().then((s) => setActive(s.activeCalls)).catch(() => setActive(0));
  }, []);

  return (
    <View style={{ flex: 1, padding: 24, gap: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '600' }}>VocalIQ</Text>
      <Text>{active} live calls</Text>
      <FlatList
        data={agents}
        keyExtractor={(a) => a.id}
        renderItem={({ item }) => <Text style={{ paddingVertical: 8 }}>{item.name}</Text>}
      />
    </View>
  );
}
