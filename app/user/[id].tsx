// app/user/[id].tsx - VIEW OTHER USER'S PROFILE
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  FlatList,
  Dimensions,
  Modal,
  Alert,
  TextInput,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/config/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const POST_SIZE = (width - 6) / 3;

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [stats, setStats] = useState({ posts: 0, followers: 0, following: 0, likes: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersVisible, setFollowersVisible] = useState(false);
  const [followingVisible, setFollowingVisible] = useState(false);
  const [giftModalVisible, setGiftModalVisible] = useState(false);
  const [giftAmount, setGiftAmount] = useState('');
  const [giftMessage, setGiftMessage] = useState('');
  const [myCoins, setMyCoins] = useState(0);

  useEffect(() => {
    if (id) loadUserProfile();
  }, [id]);

  const loadUserProfile = async () => {
    setLoading(true);
    try {
      // Load user data
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();

      if (!userData) {
        Alert.alert('Error', 'User not found');
        router.back();
        return;
      }

      setUser(userData);

      // Load stats
      const { count: postsCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', id);

      const { count: followersCount } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', id);

      const { count: followingCount } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', id);

      // Get total likes
      const { data: userPosts } = await supabase
        .from('posts')
        .select('id')
        .eq('user_id', id);

      let totalLikes = 0;
      if (userPosts && userPosts.length > 0) {
        const { count } = await supabase
          .from('likes')
          .select('*', { count: 'exact', head: true })
          .in('post_id', userPosts.map(p => p.id));
        totalLikes = count || 0;
      }

      setStats({
        posts: postsCount || 0,
        followers: followersCount || 0,
        following: followingCount || 0,
        likes: totalLikes,
      });

      // Check if following
      if (currentUser?.id) {
        const { data: followData } = await supabase
          .from('follows')
          .select('id')
          .eq('follower_id', currentUser.id)
          .eq('following_id', id)
          .single();

        setIsFollowing(!!followData);
      }

      // Load posts
      await loadPosts();
      
      // Load my coins for gifting
      if (currentUser?.id) {
        const { data: coinsData } = await supabase
          .from('users')
          .select('coins')
          .eq('id', currentUser.id)
          .single();
        setMyCoins(coinsData?.coins || 0);
      }

    } catch (error: any) {
      console.error('Error loading profile:', error);
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const loadPosts = async () => {
    try {
      const { data } = await supabase
        .from('posts')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(50);

      setPosts(data || []);
    } catch (error) {
      console.error('Error loading posts:', error);
    }
  };

  const loadFollowers = async () => {
    try {
      const { data } = await supabase
        .from('follows')
        .select(`
          follower_id,
          users!follows_follower_id_fkey (
            id, username, display_name, avatar_url
          )
        `)
        .eq('following_id', id)
        .limit(50);

      setFollowers(data?.map((f: any) => f.users) || []);
    } catch (error) {
      console.error('Error loading followers:', error);
    }
  };

  const loadFollowing = async () => {
    try {
      const { data } = await supabase
        .from('follows')
        .select(`
          following_id,
          users!follows_following_id_fkey (
            id, username, display_name, avatar_url
          )
        `)
        .eq('follower_id', id)
        .limit(50);

      setFollowing(data?.map((f: any) => f.users) || []);
    } catch (error) {
      console.error('Error loading following:', error);
    }
  };

  const handleFollow = async () => {
    if (!currentUser?.id) return;

    try {
      if (isFollowing) {
        // Unfollow
        await supabase
          .from('follows')
          .delete()
          .eq('follower_id', currentUser.id)
          .eq('following_id', id);

        setIsFollowing(false);
        setStats(prev => ({ ...prev, followers: prev.followers - 1 }));
      } else {
        // Follow
        await supabase
          .from('follows')
          .insert({
            follower_id: currentUser.id,
            following_id: id,
          });

        setIsFollowing(true);
        setStats(prev => ({ ...prev, followers: prev.followers + 1 }));
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleGiftCoins = async () => {
    const amount = parseInt(giftAmount);
    
    if (isNaN(amount) || amount < 10) {
      Alert.alert('Invalid Amount', 'Minimum gift is 10 coins');
      return;
    }

    if (amount > myCoins) {
      Alert.alert('Insufficient Coins', 'You don\'t have enough coins');
      return;
    }

    try {
      const PLATFORM_FEE = 0.30;
      const receiverGets = amount * (1 - PLATFORM_FEE);

      // Deduct from sender
      await supabase.from('transactions').insert({
        user_id: currentUser?.id,
        type: 'spent',
        amount: amount,
        description: `Gifted ${amount} coins to @${user.username}`,
      });

      // Add to receiver (70%)
      await supabase.from('transactions').insert({
        user_id: id,
        type: 'received',
        amount: receiverGets,
        description: `Gift from @${currentUser?.email}: ${amount} coins (You get ${receiverGets.toFixed(0)}, fee ${(amount * PLATFORM_FEE).toFixed(0)})`,
      });

      // Record gift
      await supabase.from('coin_gifts').insert({
        sender_id: currentUser?.id,
        receiver_id: id,
        amount: amount,
        message: giftMessage,
        platform_fee: amount * PLATFORM_FEE,
        receiver_gets: receiverGets,
      });

      setGiftModalVisible(false);
      setGiftAmount('');
      setGiftMessage('');
      
      Alert.alert(
        '🎁 Gift Sent!',
        `You gifted ${amount} coins to @${user.username}\nThey received ${receiverGets.toFixed(0)} coins (30% platform fee)`,
      );

      setMyCoins(prev => prev - amount);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handlePostPress = (post: any) => {
    try {
      router.push(`/post-detail?id=${post.id}` as any);
    } catch (error) {
      Alert.alert('Error', 'Could not open post');
    }
  };

  const handleUserPress = (userId: string) => {
    if (userId === currentUser?.id) {
      // Go to own profile
      try {
        router.push('/(tabs)/profile');
      } catch (error) {
        router.back();
      }
    } else {
      // Navigate to another user's profile
      try {
        router.push(`/user/${userId}` as any);
      } catch (error) {
        Alert.alert('Error', 'Could not open profile');
      }
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#00ff88" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>User not found</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>@{user.username}</Text>
        <TouchableOpacity onPress={() => setGiftModalVisible(true)}>
          <MaterialCommunityIcons name="gift" size={24} color="#ffd700" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.profile}>
          <View style={styles.topRow}>
            {user.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Feather name="user" size={32} color="#00ff88" />
              </View>
            )}

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{stats.posts}</Text>
                <Text style={styles.statLabel}>Posts</Text>
              </View>

              <TouchableOpacity 
                style={styles.stat}
                onPress={() => {
                  loadFollowers();
                  setFollowersVisible(true);
                }}
              >
                <Text style={styles.statNum}>{stats.followers}</Text>
                <Text style={styles.statLabel}>Followers</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.stat}
                onPress={() => {
                  loadFollowing();
                  setFollowingVisible(true);
                }}
              >
                <Text style={styles.statNum}>{stats.following}</Text>
                <Text style={styles.statLabel}>Following</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.info}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{user.display_name}</Text>
              {user.is_premium && (
                <MaterialCommunityIcons name="crown" size={20} color="#ffd700" />
              )}
            </View>
            {user.bio && <Text style={styles.bio}>{user.bio}</Text>}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.followButton, isFollowing && styles.followingButton]}
              onPress={handleFollow}
            >
              <Text style={[styles.followText, isFollowing && styles.followingText]}>
                {isFollowing ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.giftButton}
              onPress={() => setGiftModalVisible(true)}
            >
              <MaterialCommunityIcons name="gift" size={20} color="#ffd700" />
              <Text style={styles.giftText}>Gift</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.postsSection}>
          <View style={styles.tabBar}>
            <View style={styles.tabActive}>
              <MaterialCommunityIcons name="grid" size={24} color="#00ff88" />
            </View>
          </View>

          {posts.length === 0 ? (
            <View style={styles.noPosts}>
              <Feather name="camera" size={64} color="#333" />
              <Text style={styles.noPostsText}>No posts yet</Text>
            </View>
          ) : (
            <FlatList
              data={posts}
              numColumns={3}
              scrollEnabled={false}
              columnWrapperStyle={styles.postRow}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.post}
                  onPress={() => handlePostPress(item)}
                >
                  {item.media_url ? (
                    <Image source={{ uri: item.media_url }} style={styles.postImage} />
                  ) : (
                    <View style={[styles.postImage, styles.textPost]}>
                      <Text style={styles.postText} numberOfLines={3}>
                        {item.caption}
                      </Text>
                    </View>
                  )}
                  <View style={styles.postOverlay}>
                    <Feather name="heart" size={14} color="#fff" />
                    <Text style={styles.postStat}>{item.likes_count || 0}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </ScrollView>

      {/* Gift Coins Modal */}
      <Modal
        visible={giftModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setGiftModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🎁 Gift Coins</Text>
              <TouchableOpacity onPress={() => setGiftModalVisible(false)}>
                <Feather name="x" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.giftRecipient}>
              {user.avatar_url ? (
                <Image source={{ uri: user.avatar_url }} style={styles.recipientAvatar} />
              ) : (
                <View style={[styles.recipientAvatar, styles.avatarPlaceholder]}>
                  <Feather name="user" size={24} color="#00ff88" />
                </View>
              )}
              <View>
                <Text style={styles.recipientName}>{user.display_name}</Text>
                <Text style={styles.recipientUsername}>@{user.username}</Text>
              </View>
            </View>

            <View style={styles.giftForm}>
              <Text style={styles.giftLabel}>Your Balance: {myCoins.toFixed(0)} coins</Text>
              
              <TextInput
                style={styles.giftInput}
                placeholder="Amount (min 10 coins)"
                placeholderTextColor="#666"
                keyboardType="numeric"
                value={giftAmount}
                onChangeText={setGiftAmount}
              />

              <TextInput
                style={[styles.giftInput, styles.giftMessageInput]}
                placeholder="Add a message (optional)"
                placeholderTextColor="#666"
                multiline
                value={giftMessage}
                onChangeText={setGiftMessage}
              />

              <View style={styles.giftBreakdown}>
                <Text style={styles.breakdownText}>
                  💎 They receive: {giftAmount ? Math.floor(parseFloat(giftAmount) * 0.7) : 0} coins (70%)
                </Text>
                <Text style={styles.breakdownText}>
                  💰 Platform fee: {giftAmount ? Math.floor(parseFloat(giftAmount) * 0.3) : 0} coins (30%)
                </Text>
              </View>

              <View style={styles.giftActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setGiftModalVisible(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sendGiftButton}
                  onPress={handleGiftCoins}
                >
                  <Text style={styles.sendGiftButtonText}>Send Gift</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Followers Modal */}
      <Modal
        visible={followersVisible}
        animationType="slide"
        onRequestClose={() => setFollowersVisible(false)}
      >
        <SafeAreaView style={styles.fullModal} edges={['top']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Followers</Text>
            <TouchableOpacity onPress={() => setFollowersVisible(false)}>
              <Feather name="x" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          {followers.length === 0 ? (
            <View style={styles.emptyList}>
              <Feather name="users" size={64} color="#333" />
              <Text style={styles.emptyText}>No followers yet</Text>
            </View>
          ) : (
            <FlatList
              data={followers}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 20 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userItem}
                  onPress={() => {
                    setFollowersVisible(false);
                    handleUserPress(item.id);
                  }}
                >
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={styles.userAvatar} />
                  ) : (
                    <View style={[styles.userAvatar, styles.avatarPlaceholder]}>
                      <Feather name="user" size={20} color="#00ff88" />
                    </View>
                  )}
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{item.display_name}</Text>
                    <Text style={styles.userUsername}>@{item.username}</Text>
                  </View>
                  <Feather name="chevron-right" size={20} color="#666" />
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>

      {/* Following Modal */}
      <Modal
        visible={followingVisible}
        animationType="slide"
        onRequestClose={() => setFollowingVisible(false)}
      >
        <SafeAreaView style={styles.fullModal} edges={['top']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Following</Text>
            <TouchableOpacity onPress={() => setFollowingVisible(false)}>
              <Feather name="x" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          {following.length === 0 ? (
            <View style={styles.emptyList}>
              <Feather name="users" size={64} color="#333" />
              <Text style={styles.emptyText}>Not following anyone</Text>
            </View>
          ) : (
            <FlatList
              data={following}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 20 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.userItem}
                  onPress={() => {
                    setFollowingVisible(false);
                    handleUserPress(item.id);
                  }}
                >
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={styles.userAvatar} />
                  ) : (
                    <View style={[styles.userAvatar, styles.avatarPlaceholder]}>
                      <Feather name="user" size={20} color="#00ff88" />
                    </View>
                  )}
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{item.display_name}</Text>
                    <Text style={styles.userUsername}>@{item.username}</Text>
                  </View>
                  <Feather name="chevron-right" size={20} color="#666" />
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loading: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, color: '#999' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  profile: { padding: 20 },
  topRow: { flexDirection: 'row', marginBottom: 16 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1a1a1a', borderWidth: 2, borderColor: '#00ff88', marginRight: 16 },
  avatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#999' },
  info: { marginBottom: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  name: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  bio: { fontSize: 14, color: '#fff', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 12 },
  followButton: { flex: 1, backgroundColor: '#00ff88', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  followingButton: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#00ff88' },
  followText: { fontSize: 15, fontWeight: '600', color: '#000' },
  followingText: { color: '#00ff88' },
  giftButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, gap: 8, borderWidth: 1, borderColor: '#ffd700' },
  giftText: { fontSize: 15, fontWeight: '600', color: '#ffd700' },
  postsSection: { marginTop: 8 },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  tabActive: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: '#00ff88' },
  noPosts: { alignItems: 'center', paddingVertical: 60 },
  noPostsText: { fontSize: 16, color: '#666', marginTop: 16 },
  postRow: { gap: 2, marginBottom: 2 },
  post: { width: POST_SIZE, height: POST_SIZE, position: 'relative' },
  postImage: { width: '100%', height: '100%', backgroundColor: '#1a1a1a' },
  textPost: { justifyContent: 'center', alignItems: 'center', padding: 8 },
  postText: { fontSize: 12, color: '#fff', textAlign: 'center' },
  postOverlay: { position: 'absolute', bottom: 4, left: 4, flexDirection: 'row', alignItems: 'center', gap: 4 },
  postStat: { fontSize: 11, fontWeight: 'bold', color: '#fff' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#333' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  giftRecipient: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 12 },
  recipientAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#0a0a0a' },
  recipientName: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  recipientUsername: { fontSize: 14, color: '#00ff88', marginTop: 2 },
  giftForm: { padding: 20 },
  giftLabel: { fontSize: 14, color: '#999', marginBottom: 12 },
  giftInput: { backgroundColor: '#0a0a0a', borderRadius: 12, borderWidth: 1, borderColor: '#333', padding: 16, fontSize: 16, color: '#fff', marginBottom: 12 },
  giftMessageInput: { height: 80, textAlignVertical: 'top' },
  giftBreakdown: { backgroundColor: '#0a0a0a', padding: 16, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: '#00ff88' },
  breakdownText: { fontSize: 14, color: '#999', marginVertical: 4 },
  giftActions: { flexDirection: 'row', gap: 12 },
  cancelButton: { flex: 1, backgroundColor: '#333', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  cancelButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  sendGiftButton: { flex: 1, backgroundColor: '#00ff88', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  sendGiftButtonText: { fontSize: 16, fontWeight: 'bold', color: '#000' },
  fullModal: { flex: 1, backgroundColor: '#000' },
  emptyList: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#666', marginTop: 16 },
  userItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a0a0a', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#1a1a1a' },
  userAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#1a1a1a', marginRight: 12 },
  userInfo: { flex: 1 },
  userName: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 4 },
  userUsername: { fontSize: 14, color: '#00ff88' },
});
	
