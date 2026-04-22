// FILE: features/live/components/GiftAnimationOverlay.tsx
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Dimensions } from 'react-native';
import { useLiveStore, LiveGiftAnimation } from '../constants/store/useLiveStore'; 

const { width: W, height: H } = Dimensions.get('window');

function GiftParticle({ anim, onDone }: { anim: LiveGiftAnimation; onDone: () => void }) {
  const translateY = useRef(new Animated.Value(H * 0.7)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0.5)).current;
  const startX = W * 0.05 + Math.random() * (W * 0.6);

  useEffect(() => {
    if (anim.gift.animationType === 'fullscreen') {
      // Big fullscreen flash
      Animated.sequence([
        Animated.parallel([
          Animated.spring(scale, { toValue: 1.5, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]),
        Animated.delay(1500),
        Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start(onDone);
    } else {
      // Float up
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: H * 0.15,
          duration: 2500,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
          Animated.delay(1800),
          Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
      ]).start(onDone);
    }
  }, []);

  if (anim.gift.animationType === 'fullscreen') {
    return (
      <Animated.View
        style={[
          styles.fullscreenGift,
          { opacity, transform: [{ scale }] },
        ]}
        pointerEvents="none"
      >
        <Text style={styles.fullscreenEmoji}>{anim.gift.emoji}</Text>
        <Text style={styles.fullscreenName}>{anim.senderName}</Text>
        <Text style={styles.fullscreenGiftName}>sent {anim.gift.name}!</Text>
        {anim.quantity > 1 && (
          <Text style={styles.fullscreenQty}>×{anim.quantity}</Text>
        )}
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.floatGift,
        { left: startX, transform: [{ translateY }, { scale }], opacity },
      ]}
      pointerEvents="none"
    >
      <Text style={styles.floatEmoji}>{anim.gift.emoji}</Text>
      {anim.quantity > 1 && (
        <Text style={styles.floatQty}>×{anim.quantity}</Text>
      )}
    </Animated.View>
  );
}

export default function GiftAnimationOverlay() {
  const { giftAnimations, removeGiftAnimation } = useLiveStore();

  return (
    <View style={styles.container} pointerEvents="none">
      {giftAnimations.map((anim) => (
        <GiftParticle
          key={anim.id}
          anim={anim}
          onDone={() => removeGiftAnimation(anim.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  floatGift: { position: 'absolute', alignItems: 'center' },
  floatEmoji: { fontSize: 36 },
  floatQty: { color: '#FFD700', fontWeight: '900', fontSize: 12, marginTop: -4 },
  fullscreenGift: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  fullscreenEmoji: { fontSize: 100 },
  fullscreenName: { color: '#E040FB', fontSize: 18, fontWeight: '700', marginTop: 8 },
  fullscreenGiftName: { color: '#fff', fontSize: 22, fontWeight: '800' },
  fullscreenQty: { color: '#FFD700', fontSize: 36, fontWeight: '900', marginTop: 4 },
});
