// FILE: features/live/components/HostControls.tsx
import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet as RNStyleSheet } from 'react-native';

interface HostControlsProps {
  audioMuted: boolean;
  videoMuted: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onSwitchCamera: () => void;
  onEndLive: () => void;
}

export function HostControls({
  audioMuted, videoMuted,
  onToggleAudio, onToggleVideo, onSwitchCamera, onEndLive,
}: HostControlsProps) {
  return (
    <View style={hcStyles.container}>
      <TouchableOpacity style={hcStyles.btn} onPress={onToggleAudio}>
        <Text style={hcStyles.btnEmoji}>{audioMuted ? '🔇' : '🎤'}</Text>
        <Text style={hcStyles.btnLabel}>{audioMuted ? 'Unmute' : 'Mute'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={hcStyles.btn} onPress={onToggleVideo}>
        <Text style={hcStyles.btnEmoji}>{videoMuted ? '📵' : '📹'}</Text>
        <Text style={hcStyles.btnLabel}>{videoMuted ? 'Camera On' : 'Camera Off'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={hcStyles.btn} onPress={onSwitchCamera}>
        <Text style={hcStyles.btnEmoji}>🔄</Text>
        <Text style={hcStyles.btnLabel}>Flip</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[hcStyles.btn, hcStyles.endBtn]} onPress={onEndLive}>
        <Text style={hcStyles.btnEmoji}>⏹</Text>
        <Text style={[hcStyles.btnLabel, { color: '#FF4F6D' }]}>End</Text>
      </TouchableOpacity>
    </View>
  );
}

const hcStyles = RNStyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  btn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: 10,
    minWidth: 60,
  },
  endBtn: { backgroundColor: 'rgba(255,79,109,0.15)' },
  btnEmoji: { fontSize: 22 },
  btnLabel: { color: '#ddd', fontSize: 10, marginTop: 3, fontWeight: '600' },
});

export default HostControls;