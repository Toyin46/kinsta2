// FILE: features/live/components/GiftGoalBar.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useLiveStore } from '../constants/store/useLiveStore'; 

export default function GiftGoalBar() {
  const currentRoom = useLiveStore((s) => s.currentRoom);
  const progress = useLiveStore((s) => s.giftGoalProgress);

  if (!currentRoom?.giftGoalAmount) return null;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          🎯 {currentRoom.giftGoalLabel ?? 'Gift Goal'}
        </Text>
        <Text style={styles.progress}>
          🪙 {currentRoom.totalGiftsReceived.toLocaleString()} /{' '}
          {currentRoom.giftGoalAmount.toLocaleString()}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(progress, 100)}%` as any }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 70,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    padding: 8,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  label: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  progress: {
    color: '#FFD700',
    fontSize: 11,
  },
  track: {
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
  },
  fill: {
    height: 6,
    backgroundColor: '#E040FB',
    borderRadius: 3,
    minWidth: 4,
  },
}); 
