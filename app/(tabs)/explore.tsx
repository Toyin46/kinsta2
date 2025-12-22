// app/(tabs)/explore.tsx - FIXED VERSION
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/config/supabase';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');
const GRID_ITEM_SIZE = (width - 32) / 3;

type TabType = 'discover' | 'trending' | 'users';

interface Post {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  user_photo_url?: string;
  media_url?: string;
  media_type?: string;
  caption: string;
  likes_count: number;
  comments_count: number;
  coins_received: number;
  created_at: string;
}

interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  followers: number;
  following: number;
  bio?: string;
  posts_count: number;
  isFollowing?: boolean;
}

export default function ExploreScreen() {
  const { user, userProfile } = useAuthStore();
  const userId = user?.id || (user as any)?.id;
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('discover');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [allPosts, setAllPosts] = useState<Post[]>([]);
  const [searchResults, setSearchResults] = useState<Post[]>([]);
  const [trendingPosts, setTrendingPosts] = useState<Post[]>([]);
  const [suggestedUsers, setSuggestedUsers] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [followingUsers, setFollowingUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadInitialData();
    if (userId) {
      loadFollowingStatus();
    }
  }, [userId]);

  useEffect(() => {
    if (searchQuery.length > 0) {
      const delaySearch = setTimeout(() => {
        performSearch();
      }, 500);
      return () => clearTimeout(delaySearch);
    } else {
      setSearchResults([]);
      setSearching(false);
    }
  }, [searchQuery]);

  const loadFollowingStatus = async () => {
    if (!userId) return;
  
    try {
      const { data, error } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', userId);

      if (error) throw error;

      const followingSet = new Set(data.map(f => f.following_id));
      setFollowingUsers(followingSet);
    } catch (error) {
      console.error('Error loading following status:', error);
    }
  };

  const loadInitialData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadAllPosts(),
        loadTrendingPosts(),
        loadSuggestedUsers(),
      ]);
    } catch (error) {
      console.error('Error loading explore data:', error);
      Alert.alert('Error', 'Failed to load explore content');
    } finally {
      setLoading(false);
    }
  };

  const loadAllPosts = async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id,
          user_id,
          caption,
          media_url,
          media_type,
          likes_count,
          comments_count,
          coins_received,
          created_at,
          is_published,
          users!posts_user_id_fkey (
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('is_published', true)
        .not('media_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const formattedPosts = (data || []).map((post: any) => ({
        id: post.id,
        user_id: post.user_id,
        username: post.users?.username || 'unknown',
        display_name: post.users?.display_name || 'Unknown User',
        user_photo_url: post.users?.avatar_url,
        media_url: post.media_url,
        media_type: post.media_type || 'image',
        caption: post.caption || '',
        likes_count: post.likes_count || 0,
        comments_count: post.comments_count || 0,
        coins_received: post.coins_received || 0,
        created_at: post.created_at,
      }));

      setAllPosts(formattedPosts);
    } catch (error) {
      console.error('Error loading posts:', error);
    }
  };

  const loadTrendingPosts = async () => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await supabase
        .from('posts')
        .select(`
          id,
          user_id,
          caption,
          media_url,
          media_type,
          likes_count,
          comments_count,
          coins_received,
          views_count,
          created_at,
          is_published,
          users!posts_user_id_fkey (
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('is_published', true)
        .not('media_url', 'is', null)
        .gte('created_at', sevenDaysAgo.toISOString());

      if (error) throw error;

      // Sort by engagement score (likes + comments + views)
      const formattedPosts = (data || [])
        .map((post: any) => ({
          id: post.id,
          user_id: post.user_id,
          username: post.users?.username || 'unknown',
          display_name: post.users?.display_name || 'Unknown User',
          user_photo_url: post.users?.avatar_url,
          media_url: post.media_url,
          media_type: post.media_type || 'image',
          caption: post.caption || '',
          likes_count: post.likes_count || 0,
          comments_count: post.comments_count || 0,
          coins_received: post.coins_received || 0,
          views_count: post.views_count || 0,
          created_at: post.created_at,
          engagement_score:
            (post.likes_count || 0) * 3 +
            (post.comments_count || 0) * 5 +
            (post.views_count || 0) * 0.1 +
            (post.coins_received || 0) * 10
        }))
        .sort((a, b) => b.engagement_score - a.engagement_score)
        .slice(0, 50);

      setTrendingPosts(formattedPosts);
    } catch (error) {
      console.error('Error loading trending:', error);
    }
  };

  const loadSuggestedUsers = async () => {
    try {
      const { data: usersData, error } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url, followers, bio')
        .neq('id', userId || '')
        .order('followers', { ascending: false })
        .limit(50);

      if (error) throw error;

      const usersWithCounts = await Promise.all(
        (usersData || []).map(async (userData: any) => {
          const { count: followingCount } = await supabase
            .from('follows')
            .select('*', { count: 'exact', head: true })
            .eq('follower_id', userData.id);

          const { count: postsCount } = await supabase
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userData.id)
            .eq('is_published', true);

          return {
            id: userData.id,
            username: userData.username,
            display_name: userData.display_name,
            avatar_url: userData.avatar_url,
            followers: userData.followers || 0,
            following: followingCount || 0,
            bio: userData.bio,
            posts_count: postsCount || 0,
            isFollowing: followingUsers.has(userData.id),
          };
        })
      );

      const activeUsers = usersWithCounts
        .filter(u => u.posts_count > 0)
        .sort((a, b) => (b.followers + b.posts_count) - (a.followers + a.posts_count));

      setSuggestedUsers(activeUsers);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const performSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const searchTerm = searchQuery.toLowerCase().trim();

      const { data: postsData, error: postsError } = await supabase
        .from('posts')
        .select(`
          id,
          user_id,
          caption,
          media_url,
          media_type,
          likes_count,
          comments_count,
          coins_received,
          created_at,
          is_published,
          users!posts_user_id_fkey (
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('is_published', true)
        .not('media_url', 'is', null)
        .ilike('caption', `%${searchTerm}%`)
        .order('created_at', { ascending: false })
        .limit(100);

      if (postsError) throw postsError;

      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('username, display_name')
        .or(`username.ilike.%${searchTerm}%,display_name.ilike.%${searchTerm}%`)
        .limit(50);

      if (usersError) throw usersError;

      const userIds = (usersData || []).map(u => u.username);

      const allResults = (postsData || [])
        .map((post: any) => ({
          id: post.id,
          user_id: post.user_id,
          username: post.users?.username || 'unknown',
          display_name: post.users?.display_name || 'Unknown User',
          user_photo_url: post.users?.avatar_url,
          media_url: post.media_url,
          media_type: post.media_type || 'image',
          caption: post.caption || '',
          likes_count: post.likes_count || 0,
          comments_count: post.comments_count || 0,
          coins_received: post.coins_received || 0,
          created_at: post.created_at,
        }))
        .filter((post: Post) => {
          const captionMatch = post.caption?.toLowerCase().includes(searchTerm);
          const usernameMatch = userIds.includes(post.username);
          const displayNameMatch = post.display_name?.toLowerCase().includes(searchTerm);
          return captionMatch || usernameMatch || displayNameMatch;
        });

      setSearchResults(allResults);
    } catch (error) {
      console.error('Search error:', error);
      Alert.alert('Search Error', 'Failed to search. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInitialData();
    if (userId) {
      await loadFollowingStatus();
    }
    setRefreshing(false);
  };

  const handlePostPress = (post: Post) => {
    router.push('/(tabs)/' as any);
  };

  const handleUserPress = (targetUserId: string) => {
    router.push(`/user/${targetUserId}` as any);
  };

  const handleFollowUser = async (targetUser: UserProfile) => {
    if (!userId) {
      Alert.alert('Login Required', 'Please login to follow users');
      return;
    }

    if (targetUser.id === userId) {
      Alert.alert('Error', 'You cannot follow yourself');
      return;
    }

    try {
      const isCurrentlyFollowing = followingUsers.has(targetUser.id);

      if (isCurrentlyFollowing) {
        const { error: deleteError } = await supabase
          .from('follows')
          .delete()
          .eq('follower_id', userId)
          .eq('following_id', targetUser.id);

        if (deleteError) throw deleteError;

        const { data: userData } = await supabase
          .from('users')
          .select('followers')
          .eq('id', targetUser.id)
          .single();

        await supabase
          .from('users')
          .update({ followers: Math.max(0, (userData?.followers || 0) - 1) })
          .eq('id', targetUser.id);

        const newFollowingSet = new Set(followingUsers);
        newFollowingSet.delete(targetUser.id);
        setFollowingUsers(newFollowingSet);

        setSuggestedUsers(prev =>
          prev.map(u =>
            u.id === targetUser.id
              ? { ...u, followers: Math.max(0, u.followers - 1), isFollowing: false }
              : u
          )
        );
      } else {
        const { error: insertError } = await supabase
          .from('follows')
          .insert({
            follower_id: userId,
            following_id: targetUser.id,
          });

        if (insertError) {
          if (insertError.code === '23505') {
            Alert.alert('Info', 'You are already following this user');
            return;
          }
          throw insertError;
        }

        const { data: userData } = await supabase
          .from('users')
          .select('followers')
          .eq('id', targetUser.id)
          .single();

        await supabase
          .from('users')
          .update({ followers: (userData?.followers || 0) + 1 })
          .eq('id', targetUser.id);

        const newFollowingSet = new Set(followingUsers);
        newFollowingSet.add(targetUser.id);
        setFollowingUsers(newFollowingSet);

        setSuggestedUsers(prev =>
          prev.map(u =>
            u.id === targetUser.id
              ? { ...u, followers: u.followers + 1, isFollowing: true }
              : u
          )
        );
      }
    } catch (error: any) {
      console.error('Follow error:', error);
      Alert.alert('Error', error.message || 'Failed to update follow status');
    }
  };

  const renderGridPost = ({ item }: { item: Post }) => (
    <TouchableOpacity
      style={styles.gridItem}
      onPress={() => handlePostPress(item)}
      activeOpacity={0.8}
    >
      <Image
        source={{ uri: item.media_url }}
        style={styles.gridImage}
        resizeMode="cover"
      />
      {item.media_type === 'video' && (
        <View style={styles.videoIndicator}>
          <Ionicons name="play" size={20} color="#00ff88" />
        </View>
      )}
      <View style={styles.gridOverlay}>
        <View style={styles.gridStats}>
          <Ionicons name="heart" size={14} color="#00ff88" />
          <Text style={styles.gridStatText}>{item.likes_count}</Text>
        </View>
        {item.coins_received > 0 && (
          <View style={styles.gridStats}>
            <MaterialCommunityIcons name="diamond" size={14} color="#ffd700" />
            <Text style={styles.gridCoinText}>{item.coins_received}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderUserCard = ({ item }: { item: UserProfile }) => {
    const isFollowing = followingUsers.has(item.id);
  
    return (
      <TouchableOpacity
        style={styles.userCard}
        onPress={() => handleUserPress(item.id)}
        activeOpacity={0.8}
      >
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.userAvatar} />
        ) : (
          <View style={[styles.userAvatar, styles.avatarPlaceholder]}>
            <Ionicons name="person" size={24} color="#00ff88" />
          </View>
        )}
        <View style={styles.userInfo}>
          <Text style={styles.userDisplayName} numberOfLines={1}>
            {item.display_name}
          </Text>
          <Text style={styles.userUsername} numberOfLines={1}>
            @{item.username}
          </Text>
          {item.bio && (
            <Text style={styles.userBio} numberOfLines={1}>
              {item.bio}
            </Text>
          )}
          <View style={styles.userStatsRow}>
            <Text style={styles.userStats}>{item.posts_count} posts</Text>
            <Text style={styles.userStatsDot}>•</Text>
            <Text style={styles.userStats}>{item.followers} followers</Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.followButton, isFollowing && styles.followingButton]}
          onPress={() => handleFollowUser(item)}
        >
          <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => {
    let icon = 'search-outline';
    let title = 'No results found';
    let subtitle = 'Try searching for something else';

    if (activeTab === 'discover' && allPosts.length === 0) {
      icon = 'compass-outline';
      title = 'No posts yet';
      subtitle = 'Check back later for new content';
    } else if (activeTab === 'trending' && trendingPosts.length === 0) {
      icon = 'trending-up-outline';
      title = 'No trending posts';
      subtitle = 'Posts will appear here as they gain popularity';
    } else if (activeTab === 'users' && suggestedUsers.length === 0) {
      icon = 'people-outline';
      title = 'No users found';
      subtitle = 'We couldn\'t find any users to suggest';
    }

    return (
      <View style={styles.emptyContainer}>
        <Ionicons name={icon as any} size={80} color="#333" />
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptySubtitle}>{subtitle}</Text>
      </View>
    );
  };

  // Get the current posts to display
  const getCurrentPosts = () => {
    if (searchQuery.length > 0) {
      return searchResults;
    }
   
    switch (activeTab) {
      case 'discover':
        return allPosts;
      case 'trending':
        return trendingPosts;
      default:
        return [];
    }
  };

  const currentPosts = getCurrentPosts();
  const showGridView = activeTab !== 'users';

  if (loading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#000000', '#0a0a0a']} style={styles.header}>
          <Text style={styles.headerTitle}>Explore</Text>
          <View style={styles.coinsHeader}>
            <MaterialCommunityIcons name="diamond" size={18} color="#ffd700" />
            <Text style={styles.coinsHeaderText}>{userProfile?.coins || 0}</Text>
          </View>
        </LinearGradient>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#00ff88" />
          <Text style={styles.loadingText}>Loading explore...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#000000', '#0a0a0a']} style={styles.header}>
        <Text style={styles.headerTitle}>Explore</Text>
        <View style={styles.coinsHeader}>
          <MaterialCommunityIcons name="diamond" size={18} color="#ffd700" />
          <Text style={styles.coinsHeaderText}>{userProfile?.coins || 0}</Text>
        </View>
      </LinearGradient>

      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#00ff88" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search posts, users, tags..."
            placeholderTextColor="#666"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color="#00ff88" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {searchQuery.length === 0 && (
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'discover' && styles.tabActive]}
            onPress={() => setActiveTab('discover')}
          >
            <Ionicons
              name="compass"
              size={20}
              color={activeTab === 'discover' ? '#00ff88' : '#666'}
            />
            <Text style={[styles.tabText, activeTab === 'discover' && styles.tabTextActive]}>
              Discover
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'trending' && styles.tabActive]}
            onPress={() => setActiveTab('trending')}
          >
            <Ionicons
              name="trending-up"
              size={20}
              color={activeTab === 'trending' ? '#00ff88' : '#666'}
            />
            <Text style={[styles.tabText, activeTab === 'trending' && styles.tabTextActive]}>
              Trending
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'users' && styles.tabActive]}
            onPress={() => setActiveTab('users')}
          >
            <Ionicons
              name="people"
              size={20}
              color={activeTab === 'users' ? '#00ff88' : '#666'}
            />
            <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>
              Users
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {searching ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#00ff88" />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      ) : showGridView ? (
        currentPosts.length === 0 ? (
          renderEmptyState()
        ) : (
          <FlatList
            key="grid-view"
            data={currentPosts}
            renderItem={renderGridPost}
            keyExtractor={item => item.id}
            numColumns={3}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.gridContainer}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#00ff88"
              />
            }
          />
        )
      ) : (
        suggestedUsers.length === 0 ? (
          renderEmptyState()
        ) : (
          <FlatList
            key="user-list"
            data={suggestedUsers}
            renderItem={renderUserCard}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.userListContainer}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#00ff88"
              />
            }
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#00ff88',
  },
  coinsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: '#00ff88',
  },
  coinsHeaderText: {
    color: '#00ff88',
    fontWeight: 'bold',
    fontSize: 14,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#000',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#000',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  tabActive: {
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    borderColor: '#00ff88',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: '#00ff88',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    backgroundColor: '#000',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  gridContainer: {
    padding: 12,
    backgroundColor: '#000',
  },
  gridRow: {
    gap: 4,
    marginBottom: 4,
  },
  gridItem: {
    width: GRID_ITEM_SIZE,
    height: GRID_ITEM_SIZE,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    position: 'relative',
    borderWidth: 0.5,
    borderColor: '#333',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  videoIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    padding: 4,
  },
  gridOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gridStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gridStatText: {
    color: '#00ff88',
    fontSize: 11,
    fontWeight: '600',
  },
  gridCoinText: {
    color: '#ffd700',
    fontSize: 11,
    fontWeight: '600',
  },
  userListContainer: {
    padding: 16,
    backgroundColor: '#000',
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#00ff88',
  },
  avatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userDisplayName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  userUsername: {
    fontSize: 14,
    color: '#00ff88',
    marginBottom: 4,
  },
  userBio: {
    fontSize: 13,
    color: '#999',
    marginBottom: 6,
  },
  userStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userStats: {
    fontSize: 12,
    color: '#666',
  },
  userStatsDot: {
    fontSize: 12,
    color: '#666',
  },
  followButton: {
    backgroundColor: '#00ff88',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 90,
    alignItems: 'center',
  },
  followingButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#00ff88',
  },
  followButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
  },
  followingButtonText: {
    color: '#00ff88',
  },
}); 
	
