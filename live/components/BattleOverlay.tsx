// FILE: features/live/components/BattleOverlay.tsx

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { useLiveStore } from '../constants/store/useLiveStore';

export default function BattleOverlay() {
  const battle = useLiveStore((s) => s.battle);
  const flashAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [flashAnim]);

  if (!battle) return null;

  const totalCoins = battle.coinsA + battle.coinsB;
  const percentA = totalCoins === 0 ? 50 : (battle.coinsA / totalCoins) * 100;
  const percentB = 100 - percentA;
  const minutes = Math.floor(battle.timeRemainingSeconds / 60);
  const seconds = battle.timeRemainingSeconds % 60;

  return (
    <View style={styles.container} pointerEvents="none">
      {/* VS label */}
      <Animated.View style={[styles.vsBadge, { opacity: flashAnim }]}>
        <Text style={styles.vsText}>⚔️ BATTLE</Text>
      </Animated.View>

      {/* Countdown timer */}
      <Text style={styles.timer}>
        {minutes}:{seconds.toString().padStart(2, '0')}
      </Text>

      {/* Score bar */}
      <View style={styles.scoreBar}>
        <View style={[styles.scoreA, { flex: Math.max(percentA, 5) }]}>
          <Text style={styles.scoreText}>🪙 {battle.coinsA.toLocaleString()}</Text>
        </View>
        <View style={[styles.scoreB, { flex: Math.max(percentB, 5) }]}>
          <Text style={[styles.scoreText, { textAlign: 'right' }]}>
            {battle.coinsB.toLocaleString()} 🪙
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 130,
    left: 12,
    right: 12,
  },
  vsBadge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,0,64,0.8)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 6,
  },
  vsText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 1,
  },
  timer: {
    alignSelf: 'center',
    color: '#FFD700',
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 8,
  },
  scoreBar: {
    flexDirection: 'row',
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  scoreA: {
    backgroundColor: '#E040FB',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  scoreB: {
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  scoreText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
}); 
