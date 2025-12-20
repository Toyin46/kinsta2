// components/SubscriptionBadge.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface SubscriptionBadgeProps {
  tier: number;
  creatorName?: string;
  size?: 'small' | 'medium' | 'large';
}

const TIER_CONFIG = {
  1: { name: 'Bronze', color: '#CD7F32', emoji: '🥉' },
  2: { name: 'Silver', color: '#C0C0C0', emoji: '🥈' },
  3: { name: 'Gold', color: '#FFD700', emoji: '🥇' },
};

export default function SubscriptionBadge({ tier, creatorName, size = 'small' }: SubscriptionBadgeProps) {
  const config = TIER_CONFIG[tier as keyof typeof TIER_CONFIG];
  if (!config) return null;

  const sizes = {
    small: { fontSize: 10, padding: 4 },
    medium: { fontSize: 12, padding: 6 },
    large: { fontSize: 14, padding: 8 },
  };

  return (
    <View style={[styles.badge, { backgroundColor: config.color + '20', borderColor: config.color }]}>
      <Text style={[styles.badgeText, { fontSize: sizes[size].fontSize, color: config.color }]}>
        {config.emoji} {config.name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgeText: {
    fontWeight: 'bold',
  },
});