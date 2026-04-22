// FILE: features/live/components/LateJoinerSummary.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet as RNStyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '@/config/supabase'; 
import { getTopGifters } from '../constants/services/liveService'; 

interface Props { roomId: string; onDismiss: () => void; }

export function LateJoinerSummary({ roomId, onDismiss }: Props) {
  const [summary, setSummary] = useState<string | null>(null);
  const [topGifter, setTopGifter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSummary();
  }, []);

  const loadSummary = async () => {
    try {
      const [{ data: room }, gifters] = await Promise.all([
        supabase.from('live_rooms').select('title, viewer_count, total_gifts_received').eq('id', roomId).single(),
        getTopGifters(roomId, 1),
      ]);

      if (room) {
        setSummary(
          `"${room.title}" — ${room.viewer_count ?? 0} watching, 🪙 ${(room.total_gifts_received ?? 0).toLocaleString()} coins sent`
        );
      }
      if (gifters.length > 0) {
        setTopGifter(`Top gifter: ${gifters[0].displayName} (🪙 ${gifters[0].totalCoins.toLocaleString()})`);
      }
    } catch (err) {
      console.error('LateJoinerSummary error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={ljStyles.container}>
      <Text style={ljStyles.title}>📺 Just joined? Here's what you missed:</Text>
      {loading ? (
        <ActivityIndicator color="#E040FB" size="small" />
      ) : (
        <>
          {summary && <Text style={ljStyles.text}>{summary}</Text>}
          {topGifter && <Text style={ljStyles.text}>{topGifter}</Text>}
        </>
      )}
      <TouchableOpacity style={ljStyles.dismiss} onPress={onDismiss}>
        <Text style={ljStyles.dismissText}>Got it ✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const ljStyles = RNStyleSheet.create({
  container: {
    position: 'absolute',
    top: 70,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(20,20,30,0.92)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E040FB44',
    zIndex: 20,
  },
  title: { color: '#E040FB', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  text: { color: '#ddd', fontSize: 12, marginBottom: 4 },
  dismiss: { alignSelf: 'flex-end', marginTop: 8 },
  dismissText: { color: '#888', fontSize: 12 },
});

export default LateJoinerSummary; 
