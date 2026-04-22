// FILE: features/live/components/LiveTopBar.tsx
import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useLiveStore } from '../constants/store/useLiveStore'; 
import { Ionicons } from '@expo/vector-icons';

interface TopBarProps { onLeave: () => void; }

export function LiveTopBar({ onLeave }: TopBarProps) {
  const currentRoom = useLiveStore((s) => s.currentRoom);
  const isHost = useLiveStore((s) => s.isHost);

  if (!currentRoom) return null;

  return (
    <View style={topStyles.container}>
      {/* Host info */}
      <View style={topStyles.hostRow}>
        {currentRoom.hostAvatarUrl ? (
          <Image source={{ uri: currentRoom.hostAvatarUrl }} style={topStyles.avatar} />
        ) : (
          <View style={[topStyles.avatar, topStyles.avatarFallback]}>
            <Text style={{ color: '#fff', fontSize: 12 }}>
              {currentRoom.hostName[0]}
            </Text>
          </View>
        )}
        <View>
          <Text style={topStyles.hostName} numberOfLines={1}>
            {currentRoom.hostName}
          </Text>
          <View style={topStyles.viewerRow}>
            <View style={topStyles.livePill}>
              <View style={topStyles.liveDot} />
              <Text style={topStyles.liveText}>LIVE</Text>
            </View>
            <Ionicons name="eye" size={12} color="#aaa" />
            <Text style={topStyles.viewerCount}>{currentRoom.viewerCount}</Text>
          </View>
        </View>
      </View>

      {/* Leave / End button */}
      <TouchableOpacity style={topStyles.closeBtn} onPress={onLeave}>
        <Ionicons name="close" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const topStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  avatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#E040FB' },
  avatarFallback: { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' },
  hostName: { color: '#fff', fontWeight: '700', fontSize: 14, maxWidth: 140 },
  viewerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FF0040',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  liveDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  viewerCount: { color: '#aaa', fontSize: 12 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default LiveTopBar;
