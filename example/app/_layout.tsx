// @ts-expect-error - nested in expo
import Ionicons from '@expo/vector-icons/Ionicons'
import { Tabs } from 'expo-router'

const BG = '#fafafa'
const ACCENT = '#6366f1'
const MUTED = '#a1a1aa'

export default function Layout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: BG, shadowColor: 'transparent', elevation: 0 },
        headerTitleStyle: { fontWeight: '700', fontSize: 18, color: '#18181b' },
        tabBarStyle: { backgroundColor: BG, borderTopWidth: 0, elevation: 0 },
        tabBarActiveTintColor: ACCENT,
        tabBarInactiveTintColor: MUTED,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Basics',
          tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="emoji"
        options={{
          title: 'Similarity',
          tabBarIcon: ({ color, size }) => <Ionicons name="search-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="hybrid"
        options={{
          title: 'BM25',
          tabBarIcon: ({ color, size }) => <Ionicons name="layers-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="facet"
        options={{
          title: 'Facet',
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="mmr"
        options={{
          title: 'MMR',
          tabBarIcon: ({ color, size }) => <Ionicons name="apps-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="benchmark"
        options={{
          title: 'Benchmark',
          tabBarIcon: ({ color, size }) => <Ionicons name="speedometer-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  )
}
