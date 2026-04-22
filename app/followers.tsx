// app/followers.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../config/supabase';

interface Follower {
  id: string;
  username: string;
  display_name: string;
  photo_url: string;
  bio: string;
  isFollowing: boolean;
}

export default function FollowersScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFollowers();
  }, []);

  const loadFollowers = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Get followers
      const { data: followData, error: followError } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('following_id', user.id);

      if (followError) throw followError;

      const followerIds = followData.map((f) => f.follower_id);

      if (followerIds.length === 0) {
        setFollowers([]);
        setLoading(false);
        return;
      }

      // Get user details
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, username, display_name, photo_url, bio')
        .in('id', followerIds);

      if (usersError) throw usersError;

      // Check if current user follows them back
      const { data: followingData } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)
        .in('following_id', followerIds);

      const followingIds = new Set(followingData?.map((f) => f.following_id) || []);

      const formattedFollowers = (usersData || []).map((u) => ({
        ...u,
        isFollowing: followingIds.has(u.id),
      }));

      setFollowers(formattedFollowers);
    } catch (error) {
      console.error('Error loading followers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFollow = async (userId: string, currentlyFollowing: boolean) => {
    if (!user) return;

    try {
      if (currentlyFollowing) {
        // Unfollow
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', userId);
      } else {
        // Follow
        await supabase.from('follows').insert({
          follower_id: user.id,
          following_id: userId,
        });
      }

      // Update local state
      setFollowers((prev) =>
        prev.map((f) =>
          f.id === userId ? { ...f, isFollowing: !currentlyFollowing } : f
        )
      );
    } catch (error) {
      console.error('Error toggling follow:', error);
    }
  };

  const renderFollower = ({ item }: { item: Follower }) => (
    <View style={styles.followerItem}>
      <TouchableOpacity
        style={styles.followerInfo}
        onPress={() => router.push(`/user/${item.id}`)}
      >
        {item.photo_url ? (
          <Image source={{ uri: item.photo_url }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Ionicons name="person" size={24} color="#00ff88" />
          </View>
        )}

        <View style={styles.userDetails}>
          <Text style={styles.displayName}>{item.display_name}</Text>
          <Text style={styles.username}>@{item.username}</Text>
          {item.bio && <Text style={styles.bio} numberOfLines={1}>{item.bio}</Text>}
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.followButton,
          item.isFollowing && styles.followingButton,
        ]}
        onPress={() => handleFollow(item.id, item.isFollowing)}
      >
        <Text
          style={[
            styles.followButtonText,
            item.isFollowing && styles.followingButtonText,
          ]}
        >
          {item.isFollowing ? 'Following' : 'Follow'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Followers</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#00ff88" />
        </View>
      ) : followers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={60} color="#333" />
          <Text style={styles.emptyText}>No followers yet</Text>
          <Text style={styles.emptySubtext}>
            Share your profile to get followers
          </Text>
        </View>
      ) : (
        <FlatList
          data={followers}
          renderItem={renderFollower}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#666', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#444', marginTop: 8, textAlign: 'center' },
  listContainer: { padding: 20 },
  followerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  followerInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#00ff88',
  },
  avatarPlaceholder: {
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userDetails: { flex: 1 },
  displayName: { fontSize: 16, fontWeight: '600', color: '#fff' },
  username: { fontSize: 14, color: '#888', marginTop: 2 },
  bio: { fontSize: 13, color: '#666', marginTop: 4 },
  followButton: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#00ff88',
  },
  followingButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  followButtonText: { fontSize: 14, fontWeight: '600', color: '#000' },
  followingButtonText: { color: '#fff' },
});