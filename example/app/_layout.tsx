import Ionicons from '@expo/vector-icons/Ionicons'
import { Tabs } from 'expo-router'
import type { ComponentProps } from 'react'
import type { ColorValue } from 'react-native'

const BG = '#fafafa'
const ACCENT = '#6366f1'
const MUTED = '#a1a1aa'

type IconName = ComponentProps<typeof Ionicons>['name']
type TabBarIconProps = { focused: boolean; color: ColorValue; size: number }

function makeTabBarIcon(name: IconName) {
  return function TabBarIcon({ color, size }: TabBarIconProps) {
    return <Ionicons name={name} size={size} color={color as string} />
  }
}

const BasicsIcon = makeTabBarIcon('cube-outline')
const SimilarityIcon = makeTabBarIcon('search-outline')
const Bm25Icon = makeTabBarIcon('layers-outline')
const FacetIcon = makeTabBarIcon('stats-chart-outline')
const MmrIcon = makeTabBarIcon('apps-outline')
const BenchmarkIcon = makeTabBarIcon('speedometer-outline')

export default function Layout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: BG,
          shadowColor: 'transparent',
          elevation: 0,
        },
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 18,
          color: '#18181b',
        },
        tabBarStyle: {
          backgroundColor: BG,
          borderTopWidth: 0,
          elevation: 0,
        },
        tabBarActiveTintColor: ACCENT,
        tabBarInactiveTintColor: MUTED,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Basics',
          tabBarIcon: BasicsIcon,
        }}
      />
      <Tabs.Screen
        name="emoji"
        options={{
          title: 'Similarity',
          tabBarIcon: SimilarityIcon,
        }}
      />
      <Tabs.Screen
        name="hybrid"
        options={{
          title: 'BM25',
          tabBarIcon: Bm25Icon,
        }}
      />
      <Tabs.Screen
        name="facet"
        options={{
          title: 'Facet',
          tabBarIcon: FacetIcon,
        }}
      />
      <Tabs.Screen
        name="mmr"
        options={{
          title: 'MMR',
          tabBarIcon: MmrIcon,
        }}
      />
      <Tabs.Screen
        name="benchmark"
        options={{
          title: 'Benchmark',
          tabBarIcon: BenchmarkIcon,
        }}
      />
    </Tabs>
  )
}
