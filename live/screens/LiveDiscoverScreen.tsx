// FILE: features/live/screens/LiveDiscoverScreen.tsx
// Kinsta Live — Browse all live rooms by category/mood

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
// @ts-ignore
import { useRouter } from 'expo-router';
import { getLiveRooms } from '../constants/services/liveService'; 
import { Ionicons } from '@expo/vector-icons';

const CATEGORIES = [
  { id: 'all', label: 'All', emoji: '🌐' },
  { id: 'music', label: 'Music', emoji: '🎵' },
  { id: 'talk', label: 'Talk', emoji: '💬' },
  { id: 'gaming', label: 'Gaming', emoji: '🎮' },
  { id: 'cooking', label: 'Food', emoji: '🍳' },
  { id: 'fashion', label: 'Fashion', emoji: '👗' },
  { id: 'education', label: 'Learn', emoji: '📚' },
  { id: 'general', label: 'General', emoji: '✨' },
];

const MOODS = [
  { id: 'all', label: 'Any Vibe' },
  { id: 'chill', label: '😌 Chill' },
  { id: 'hype', label: '🔥 Hype' },
  { id: 'emotional', label: '💙 Emotional' },
  { id: 'educational', label: '🧠 Educational' },
];

export default function LiveDiscoverScreen() {
  const router = useRouter();
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedMood, setSelectedMood] = useState('all');

  const fetchRooms = useCallback(async () => {
    try {
      const data = await getLiveRooms({
        category: selectedCategory === 'all' ? undefined : selectedCategory,
        mood: selectedMood === 'all' ? undefined : selectedMood,
      });
      setRooms(data ?? []);
    } catch (err) {
      console.error('fetchRooms error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory, selectedMood]);

  useEffect(() => {
    setLoading(true);
    fetchRooms();
  }, [fetchRooms]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRooms();
  };

  const navigateToRoom = (roomId: string) => {
    // Using push with string to avoid typed route issues
    router.push(`/(live)/room/${roomId}` as any);
  };

  const navigateToCreate = () => {
    router.push('/(live)/create' as any);
  };

  const renderRoomCard = ({ item }: { item: any }) => {
    const isLive = item.status === 'live';
    const isScheduled = item.status === 'scheduled';

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigateToRoom(item.id)}
        activeOpacity={0.85}
      >
        {/* Thumbnail */}
        <View style={styles.thumbnailContainer}>
          {item.thumbnail_url ? (
            <Image source={{ uri: item.thumbnail_url }} style={styles.thumbnail} />
          ) : (
            <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
              <Text style={styles.thumbnailEmoji}>
                {CATEGORIES.find((c) => c.id === item.category)?.emoji ?? '🎥'}
              </Text>
            </View>
          )}

          {/* Live badge */}
          {isLive && (
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
          {isScheduled && (
            <View style={styles.scheduledBadge}>
              <Text style={styles.scheduledText}>📅 Scheduled</Text>
            </View>
          )}

          {/* Viewer count */}
          {isLive && (
            <View style={styles.viewerBadge}>
              <Ionicons name="eye" size={11} color="#fff" />
              <Text style={styles.viewerCount}>{item.viewer_count ?? 0}</Text>
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.cardInfo}>
          <View style={styles.hostRow}>
            {item.profiles?.avatar_url ? (
              <Image
                source={{ uri: item.profiles.avatar_url }}
                style={styles.hostAvatar}
              />
            ) : (
              <View style={[styles.hostAvatar, styles.avatarPlaceholder]}>
                <Text style={{ fontSize: 10 }}>
                  {item.profiles?.display_name?.[0] ?? '?'}
                </Text>
              </View>
            )}
            <Text style={styles.hostName} numberOfLines={1}>
              {item.profiles?.display_name ?? 'Unknown'}
            </Text>
          </View>

          <Text style={styles.roomTitle} numberOfLines={2}>
            {item.title}
          </Text>

          <View style={styles.tagRow}>
            <Text style={styles.tag}>
              {CATEGORIES.find((c) => c.id === item.category)?.emoji}{' '}
              {item.category}
            </Text>
            {item.mood && item.mood !== 'chill' && (
              <Text style={[styles.tag, styles.moodTag]}>{item.mood}</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Category Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[
              styles.filterChip,
              selectedCategory === cat.id && styles.filterChipActive,
            ]}
            onPress={() => setSelectedCategory(cat.id)}
          >
            <Text
              style={[
                styles.filterChipText,
                selectedCategory === cat.id && styles.filterChipTextActive,
              ]}
            >
              {cat.emoji} {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Mood Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.moodRow}
      >
        {MOODS.map((mood) => (
          <TouchableOpacity
            key={mood.id}
            style={[
              styles.moodChip,
              selectedMood === mood.id && styles.moodChipActive,
            ]}
            onPress={() => setSelectedMood(mood.id)}
          >
            <Text
              style={[
                styles.moodChipText,
                selectedMood === mood.id && styles.moodChipTextActive,
              ]}
            >
              {mood.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Rooms Grid */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#E040FB" size="large" />
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(item) => item.id}
          renderItem={renderRoomCard}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#E040FB"
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📺</Text>
              <Text style={styles.emptyText}>No lives right now</Text>
              <Text style={styles.emptySubtext}>Check back soon or start your own!</Text>
            </View>
          }
        />
      )}

      {/* Go Live FAB */}
      <TouchableOpacity style={styles.goLiveFab} onPress={navigateToCreate}>
        <Ionicons name="videocam" size={22} color="#fff" />
        <Text style={styles.goLiveText}>Go Live</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  filterRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  filterChipActive: { backgroundColor: '#E040FB', borderColor: '#E040FB' },
  filterChipText: { color: '#888', fontSize: 13 },
  filterChipTextActive: { color: '#fff', fontWeight: '700' },
  moodRow: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  moodChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
  },
  moodChipActive: { backgroundColor: '#2A1A35' },
  moodChipText: { color: '#666', fontSize: 12 },
  moodChipTextActive: { color: '#E040FB', fontWeight: '600' },
  row: { justifyContent: 'space-between', paddingHorizontal: 12 },
  listContent: { paddingBottom: 100 },
  card: {
    width: '48%',
    backgroundColor: '#151515',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  thumbnailContainer: { position: 'relative' },
  thumbnail: { width: '100%', height: 120, backgroundColor: '#222' },
  thumbnailPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A2E',
  },
  thumbnailEmoji: { fontSize: 36 },
  liveBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF0040',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    gap: 4,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  scheduledBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  scheduledText: { color: '#fff', fontSize: 10 },
  viewerBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 3,
  },
  viewerCount: { color: '#fff', fontSize: 10, fontWeight: '600' },
  cardInfo: { padding: 10 },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  hostAvatar: { width: 22, height: 22, borderRadius: 11 },
  avatarPlaceholder: {
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostName: { color: '#aaa', fontSize: 11, flex: 1 },
  roomTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    lineHeight: 17,
  },
  tagRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tag: {
    color: '#888',
    fontSize: 10,
    backgroundColor: '#222',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  moodTag: { color: '#E040FB', backgroundColor: '#2A1A35' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 10,
  },
  emptyEmoji: { fontSize: 48 },
  emptyText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptySubtext: { color: '#666', fontSize: 14 },
  goLiveFab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E040FB',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 30,
    shadowColor: '#E040FB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  goLiveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
}); 
