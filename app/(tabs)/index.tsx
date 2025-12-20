// app/(tabs)/index.tsx - COMPLETE ERROR-FREE VERSION
import React, { useEffect, useState, useCallback, memo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image, TouchableOpacity, RefreshControl,
  ActivityIndicator, Alert, TextInput, Modal, ScrollView, Dimensions, Share,
  ViewabilityConfig, ViewToken,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/config/supabase';
import { useRouter } from 'expo-router';
import { Audio } from 'expo-av';

const { width } = Dimensions.get('window');
const LIKE_REWARD = 0.01;

interface Post {
  id: string; user_id: string; username: string; display_name: string;
  user_photo_url?: string; media_url?: string; caption: string;
  likes_count: number; comments_count: number; views_count: number;
  coins_received: number; liked_by: string[]; saved_by: string[];
  location?: string; music_url?: string; music_name?: string;
  music_artist?: string; created_at: string;
}

interface Comment {
  id: string; post_id: string; user_id: string; username: string;
  display_name: string; user_photo_url?: string; text: string;
  likes_count: number; replies_count: number; liked_by: string[];
  parent_comment_id?: string; created_at: string;
}

const PostCard = memo(({
  item, user, onLike, onComment, onSave, onFollow, onUserPress, onShare, onDelete, isVisible, onView
}: {
  item: Post; user: any; onLike: (post: Post) => void; onComment: (post: Post) => void;
  onSave: (post: Post) => void; onFollow: (userId: string, isFollowing: boolean) => Promise<void>;
  onUserPress: (userId: string) => void; onShare: (post: Post) => void; onDelete: (post: Post) => void;
  isVisible: boolean; onView: (postId: string) => void;
}) => {
  const [isFollowing, setIsFollowing] = useState(false);
  const [checkingFollow, setCheckingFollow] = useState(true);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const viewedRef = useRef(false);
  const userId = user?.id || (user as any)?.id;
  const isLiked = userId ? item.liked_by?.includes(userId) : false;
  const isSaved = userId ? item.saved_by?.includes(userId) : false;
  const isOwnPost = userId === item.user_id;

  useEffect(() => { checkFollowStatus(); }, [user, item.user_id]);

  useEffect(() => {
    if (isVisible) {
      if (!viewedRef.current) {
        viewedRef.current = true;
        onView(item.id);
      }
      if (item.music_url) playMusic();
    } else {
      stopMusic();
    }
    return () => { unloadSound(); };
  }, [isVisible, item.music_url]);

  const playMusic = async () => {
    try {
      if (sound) { await sound.playAsync(); setIsPlaying(true); }
      else if (item.music_url) {
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: item.music_url }, { shouldPlay: true, isLooping: true }
        );
        setSound(newSound); setIsPlaying(true);
      }
    } catch (e) { console.error('Play music error:', e); }
  };

  const stopMusic = async () => {
    try { if (sound) { await sound.pauseAsync(); setIsPlaying(false); } }
    catch (e) { console.error('Stop music error:', e); }
  };

  const unloadSound = async () => {
    try { if (sound) { await sound.unloadAsync(); setSound(null); setIsPlaying(false); } }
    catch (e) { console.error('Unload sound error:', e); }
  };

  const checkFollowStatus = async () => {
    if (!userId || isOwnPost) { setCheckingFollow(false); return; }
    try {
      const { data } = await supabase.from('follows').select('id')
        .eq('follower_id', userId).eq('following_id', item.user_id).maybeSingle();
      setIsFollowing(!!data);
    } catch (e) { console.error('Check follow error:', e); } finally { setCheckingFollow(false); }
  };

  const handleFollow = async () => {
    if (checkingFollow) return;
    try { await onFollow(item.user_id, isFollowing); setIsFollowing(!isFollowing); }
    catch (e) { console.error('Follow button error:', e); Alert.alert('Error', 'Failed to update follow status'); }
  };

  const handlePostOptions = () => {
    if (isOwnPost) {
      Alert.alert('Post Options', 'What would you like to do?', [
        { text: 'Delete Post', style: 'destructive', onPress: () => onDelete(item) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const formatTime = (timestamp: string) => {
    if (!timestamp) return 'Just now';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <TouchableOpacity style={styles.userInfo} onPress={() => onUserPress(item.user_id)} activeOpacity={0.7}>
          {item.user_photo_url ? (
            <Image source={{ uri: item.user_photo_url }} style={styles.userAvatar} />
          ) : (
            <View style={[styles.userAvatar, styles.avatarPlaceholder]}>
              <Feather name="user" size={20} color="#00ff88" />
            </View>
          )}
          <View style={styles.userDetails}>
            <Text style={styles.displayName}>{item.display_name}</Text>
            <Text style={styles.username}>@{item.username}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.headerRightContainer}>
          <Text style={styles.timestamp}>{formatTime(item.created_at)}</Text>
          {!isOwnPost ? (
            <TouchableOpacity
              style={[styles.followButton, isFollowing && styles.followingButton, checkingFollow && styles.followButtonDisabled]}
              onPress={handleFollow} disabled={checkingFollow}
            >
              <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>
                {checkingFollow ? '...' : isFollowing ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.optionsButton} onPress={handlePostOptions}>
              <Feather name="more-horizontal" size={24} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {item.media_url && (
        <Image source={{ uri: item.media_url }} style={styles.postImage} resizeMode="cover" />
      )}

      <View style={styles.actionsContainer}>
        <View style={styles.actionsLeft}>
          <TouchableOpacity style={styles.actionButton} onPress={() => onLike(item)}>
            <Feather name="heart" size={28} color={isLiked ? '#00ff88' : '#666'} fill={isLiked ? '#00ff88' : 'none'} />
            <Text style={styles.actionCount}>{item.likes_count}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => onComment(item)}>
            <Feather name="message-circle" size={26} color="#666" />
            <Text style={styles.actionCount}>{item.comments_count}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => onShare(item)}>
            <Feather name="share-2" size={26} color="#666" />
          </TouchableOpacity>
        </View>

        <View style={styles.actionsRight}>
          {item.coins_received > 0 && (
            <View style={styles.coinsEarned}>
              <MaterialCommunityIcons name="diamond" size={16} color="#ffd700" />
              <Text style={styles.coinsText}>{item.coins_received.toFixed(2)}</Text>
            </View>
          )}

          <TouchableOpacity style={styles.actionButton} onPress={() => onSave(item)}>
            <Feather name="bookmark" size={26} color={isSaved ? '#00ff88' : '#666'} fill={isSaved ? '#00ff88' : 'none'} />
          </TouchableOpacity>
        </View>
      </View>

      {item.views_count > 0 && (
        <View style={styles.viewsContainer}>
          <Feather name="eye" size={14} color="#666" />
          <Text style={styles.viewsText}>{item.views_count} {item.views_count === 1 ? 'view' : 'views'}</Text>
        </View>
      )}

      {item.location && (
        <View style={styles.locationContainer}>
          <Feather name="map-pin" size={12} color="#00ff88" />
          <Text style={styles.locationText}>{item.location}</Text>
        </View>
      )}

      {item.music_name && (
        <View style={styles.musicContainer}>
          <Feather name={isPlaying ? "volume-2" : "music"} size={12} color="#00ff88" />
          <Text style={styles.musicText}>
            {item.music_name} - {item.music_artist}{isPlaying && ' • Playing'}
          </Text>
        </View>
      )}

      {item.caption && (
        <View style={styles.captionContainer}>
          <Text style={styles.captionUsername}>@{item.username}</Text>
          <Text style={styles.captionText}>{item.caption}</Text>
        </View>
      )}
    </View>
  );
});

export default function HomeScreen() {
  const { userProfile, user, loadProfile } = useAuthStore();
  const userId = user?.id || (user as any)?.id;
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [visiblePostId, setVisiblePostId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const router = useRouter();

  const viewabilityConfig = useRef<ViewabilityConfig>({ itemVisiblePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0) setVisiblePostId(viewableItems[0].key);
  }).current;

  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: true });
    loadFeed();
    const postsChannel = supabase.channel('posts-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => loadFeed()).subscribe();
    const likesChannel = supabase.channel('likes-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, () => loadFeed()).subscribe();
    const commentsChannel = supabase.channel('comments-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => loadFeed()).subscribe();
    return () => {
      supabase.removeChannel(postsChannel);
      supabase.removeChannel(likesChannel);
      supabase.removeChannel(commentsChannel);
    };
  }, []);

  const loadFeed = async () => {
    try {
      const { data: postsData, error: postsError } = await supabase.from('posts').select(`*, users!posts_user_id_fkey (username, display_name, avatar_url)`)
        .eq('media_type', 'image').eq('is_published', true).order('created_at', { ascending: false }).limit(50);
      if (postsError) throw postsError;
      if (!postsData || postsData.length === 0) { setPosts([]); setLoading(false); return; }

      const postIds = postsData.map(p => p.id);
      const { data: likesData } = await supabase.from('likes').select('post_id, user_id').in('post_id', postIds);
      const { data: commentsData } = await supabase.from('comments').select('post_id').in('post_id', postIds).is('parent_comment_id', null);

      const likesMap = new Map<string, { count: number; users: string[] }>();
      likesData?.forEach(like => {
        const existing = likesMap.get(like.post_id) || { count: 0, users: [] };
        existing.count++;
        existing.users.push(like.user_id);
        likesMap.set(like.post_id, existing);
      });

      const commentsMap = new Map<string, number>();
      commentsData?.forEach(comment => {
        commentsMap.set(comment.post_id, (commentsMap.get(comment.post_id) || 0) + 1);
      });

      const formattedPosts = postsData.map((post: any) => {
        const likes = likesMap.get(post.id) || { count: 0, users: [] };
        const comments = commentsMap.get(post.id) || 0;
      
        return {
          id: post.id, user_id: post.user_id,
          username: post.users?.username || 'unknown',
          display_name: post.users?.display_name || 'Unknown User',
          user_photo_url: post.users?.avatar_url, media_url: post.media_url,
          caption: post.caption || '', likes_count: likes.count,
          comments_count: comments, views_count: post.views_count || 0,
          coins_received: post.coins_received || 0, liked_by: likes.users,
          saved_by: post.saved_by || [], location: post.location,
          music_url: post.music_url, music_name: post.music_name,
          music_artist: post.music_artist, created_at: post.created_at,
        };
      });

      setPosts(formattedPosts);
    } catch (e: any) {
      console.error('Error loading feed:', e);
      Alert.alert('Error', `Failed to load feed: ${e.message}`);
    } finally { setLoading(false); }
  };

  const onRefresh = async () => { setRefreshing(true); await loadFeed(); setRefreshing(false); };

  const handleView = useCallback(async (postId: string) => {
    if (!userId) return;
    try {
      const { data: post } = await supabase.from('posts').select('views_count, viewed_by').eq('id', postId).single();
      if (!post) return;
    
      const viewedBy = post.viewed_by || [];
      if (viewedBy.includes(userId)) return;

      const newViewedBy = [...viewedBy, userId];
      const newViewsCount = (post.views_count || 0) + 1;

      await supabase.from('posts').update({
        views_count: newViewsCount,
        viewed_by: newViewedBy
      }).eq('id', postId);

      setPosts(prev => prev.map(p => p.id === postId ? { ...p, views_count: newViewsCount } : p));
    } catch (e) { console.error('View tracking error:', e); }
  }, [userId]);

  const handleDeletePost = useCallback(async (post: Post) => {
    if (post.user_id !== userId) { Alert.alert('Error', 'You can only delete your own posts'); return; }
    Alert.alert('Delete Post', 'Are you sure you want to delete this post? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await supabase.from('likes').delete().eq('post_id', post.id);
            await supabase.from('comments').delete().eq('post_id', post.id);
            const { error } = await supabase.from('posts').delete().eq('id', post.id).eq('user_id', userId);
            if (error) throw error;
            setPosts(prev => prev.filter(p => p.id !== post.id));
            Alert.alert('Success', 'Post deleted successfully');
          } catch (e: any) {
            console.error('Delete error:', e);
            Alert.alert('Error', 'Failed to delete post. Please try again.');
          }
        }
      }
    ]);
  }, [userId]);

  const handleLike = useCallback(async (post: Post) => {
    if (!userId) { Alert.alert('Login Required', 'Please login to like posts'); return; }
    const isLiked = post.liked_by?.includes(userId);

    try {
      if (isLiked) {
        await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', userId);
      
        const { data: ownerData } = await supabase.from('users').select('coins').eq('id', post.user_id).single();
        if (ownerData) {
          await supabase.from('users').update({ coins: Math.max(0, ownerData.coins - LIKE_REWARD) }).eq('id', post.user_id);
          await supabase.from('posts').update({ coins_received: Math.max(0, post.coins_received - LIKE_REWARD) }).eq('id', post.id);
        }
      } else {
        await supabase.from('likes').insert({ post_id: post.id, user_id: userId });
      
        const { data: ownerData } = await supabase.from('users').select('coins').eq('id', post.user_id).single();
        if (ownerData) {
          const newOwnerCoins = (ownerData.coins || 0) + LIKE_REWARD;
          await supabase.from('users').update({ coins: newOwnerCoins }).eq('id', post.user_id);
          await supabase.from('posts').update({ coins_received: post.coins_received + LIKE_REWARD }).eq('id', post.id);
          await supabase.from('transactions').insert({
            user_id: post.user_id, type: 'received', amount: LIKE_REWARD,
            description: `Earned ${LIKE_REWARD} coins from a like`, status: 'completed'
          });
        }
      }
      await loadFeed();
    } catch (e: any) {
      console.error('Like error:', e);
      Alert.alert('Error', e.message || 'Failed to like/unlike post');
    }
  }, [userId]);

  const handleCommentLike = useCallback(async (comment: Comment) => {
    if (!userId) return;
    const isLiked = comment.liked_by?.includes(userId);

    try {
      if (isLiked) {
        await supabase.from('comment_likes').delete().eq('comment_id', comment.id).eq('user_id', userId);
      } else {
        await supabase.from('comment_likes').insert({ comment_id: comment.id, user_id: userId });
      }
      if (selectedPost) await handleComment(selectedPost);
    } catch (e: any) {
      console.error('Comment like error:', e);
    }
  }, [userId, selectedPost]);

  const handleComment = useCallback(async (post: Post) => {
    if (!userId) { Alert.alert('Login Required', 'Please login to comment'); return; }
    setSelectedPost(post); setCommentModalVisible(true); setLoadingComments(true); setCommentText(''); setReplyingTo(null);
    try {
      const { data: commentsData } = await supabase.from('comments').select(`*, users!comments_user_id_fkey (username, display_name, avatar_url)`)
        .eq('post_id', post.id).order('created_at', { ascending: false });
      if (!commentsData) { setComments([]); return; }

      const commentIds = commentsData.map(c => c.id);
      const { data: commentLikesData } = await supabase.from('comment_likes').select('comment_id, user_id').in('comment_id', commentIds);

      const likesMap = new Map<string, string[]>();
      commentLikesData?.forEach(like => {
        const existing = likesMap.get(like.comment_id) || [];
        existing.push(like.user_id);
        likesMap.set(like.comment_id, existing);
      });

      const formatted = commentsData.map((c: any) => ({
        id: c.id, post_id: c.post_id, user_id: c.user_id, username: c.users?.username || 'unknown',
        display_name: c.users?.display_name || 'Unknown', user_photo_url: c.users?.avatar_url,
        text: c.text, likes_count: likesMap.get(c.id)?.length || 0,
        replies_count: c.replies_count || 0, liked_by: likesMap.get(c.id) || [],
        parent_comment_id: c.parent_comment_id, created_at: c.created_at,
      }));
      setComments(formatted);
    } catch (e) { console.error('Load comments error:', e); setComments([]); }
    finally { setLoadingComments(false); }
  }, [userId]);

  const submitComment = async () => {
    if (!commentText.trim() || !selectedPost || !userId || submittingComment) return;
    setSubmittingComment(true);
    try {
      await supabase.from('comments').insert({
        post_id: selectedPost.id, user_id: userId, text: commentText.trim(),
        parent_comment_id: replyingTo?.id || null,
        display_name: userProfile?.username || 'Anonymous', username: userProfile?.username || 'anonymous',
        user_photo_url: userProfile?.avatar_url || null,
      });
      setCommentText(''); setReplyingTo(null);
      await loadFeed();
      await handleComment(selectedPost);
    } catch (e: any) {
      console.error('Submit comment error:', e);
      Alert.alert('Error', e.message || 'Failed to post comment');
    } finally { setSubmittingComment(false); }
  };

  const handleSave = useCallback(async (post: Post) => {
    if (!userId) { Alert.alert('Login Required', 'Please login to save posts'); return; }
    const isSaved = post.saved_by?.includes(userId);
    try {
      const newSavedBy = isSaved ? post.saved_by.filter(id => id !== userId) : [...(post.saved_by || []), userId];
      await supabase.from('posts').update({ saved_by: newSavedBy }).eq('id', post.id);
      setPosts(prev => prev.map(p => (p.id === post.id ? { ...p, saved_by: newSavedBy } : p)));
      Alert.alert(isSaved ? 'Removed from Saved' : 'Saved!', isSaved ? 'Post removed from your saved posts' : 'Post saved! View in Profile > Saved Posts');
    } catch (e) { Alert.alert('Error', 'Failed to save post'); }
  }, [userId]);

  const handleShare = useCallback(async (post: Post) => {
    try { await Share.share({ message: `Check out @${post.username}'s post on Kinsta!\n\n${post.caption || ''}` }); }
    catch (e) { console.error('Share error', e); }
  }, []);

  const handleFollow = useCallback(async (targetUserId: string, isFollowing: boolean) => {
    if (!userId) return;
    try {
      if (isFollowing) {
        await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', targetUserId);
        const { data: userData } = await supabase.from('users').select('followers').eq('id', targetUserId).single();
        await supabase.from('users').update({ followers: Math.max(0, (userData?.followers || 0) - 1) }).eq('id', targetUserId);
      } else {
        await supabase.from('follows').insert({ follower_id: userId, following_id: targetUserId });
        const { data: userData } = await supabase.from('users').select('followers').eq('id', targetUserId).single();
        await supabase.from('users').update({ followers: (userData?.followers || 0) + 1 }).eq('id', targetUserId);
      }
    } catch (e) { throw e; }
  }, [userId]);

  const handleUserPress = useCallback((targetUserId: string) => router.push(`/user/${targetUserId}` as any), [router]);

  const renderPost = useCallback(({ item }: { item: Post }) => (
    <PostCard item={item} user={user} onLike={handleLike} onComment={handleComment} onSave={handleSave}
      onFollow={handleFollow} onUserPress={handleUserPress} onShare={handleShare} onDelete={handleDeletePost}
      isVisible={visiblePostId === item.id} onView={handleView} />
  ), [user, handleLike, handleComment, handleSave, handleFollow, handleUserPress, handleShare, handleDeletePost, visiblePostId, handleView]);

  const renderComment = useCallback(({ item }: { item: Comment }) => {
    const isLiked = userId ? item.liked_by?.includes(userId) : false;
    const isReply = !!item.parent_comment_id;
  
    return (
      <View style={[styles.commentItem, isReply && styles.commentReply]}>
        {item.user_photo_url ? (
          <Image source={{ uri: item.user_photo_url }} style={styles.commentAvatar} />
        ) : (
          <View style={[styles.commentAvatar, styles.avatarPlaceholder]}>
            <Feather name="user" size={16} color="#00ff88" />
          </View>
        )}
        <View style={styles.commentContent}>
          <View style={styles.commentHeader}>
            <Text style={styles.commentDisplayName}>{item.display_name}</Text>
            <Text style={styles.commentUsername}>@{item.username}</Text>
          </View>
          <Text style={styles.commentText}>{item.text}</Text>
          <View style={styles.commentActions}>
            <TouchableOpacity style={styles.commentActionBtn} onPress={() => handleCommentLike(item)}>
              <Feather name="heart" size={14} color={isLiked ? '#00ff88' : '#666'} fill={isLiked ? '#00ff88' : 'none'} />
              <Text style={styles.commentActionText}>{item.likes_count}</Text>
            </TouchableOpacity>
            {!isReply && (
              <TouchableOpacity style={styles.commentActionBtn} onPress={() => setReplyingTo(item)}>
                <Feather name="message-circle" size={14} color="#666" />
                <Text style={styles.commentActionText}>Reply</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.commentTime}>{new Date(item.created_at).toLocaleDateString()}</Text>
          </View>
        </View>
      </View>
    );
  }, [userId, handleCommentLike]);

  if (loading && posts.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Kinsta</Text>
          <View style={styles.coinsHeader}>
            <MaterialCommunityIcons name="diamond" size={20} color="#ffd700" />
            <Text style={styles.coinsHeaderText}>{userProfile?.coins || 0}</Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00ff88" />
          <Text style={styles.loadingText}>Loading feed...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Kinsta</Text>
        <View style={styles.coinsHeader}>
          <MaterialCommunityIcons name="diamond" size={20} color="#ffd700" />
          <Text style={styles.coinsHeaderText}>{userProfile?.coins || 0}</Text>
        </View>
      </View>

      {posts.length === 0 ? (
        <ScrollView 
          contentContainerStyle={styles.emptyContainer} 
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00ff88" />}
        >
          <Feather name="image" size={80} color="#333" />
          <Text style={styles.emptyTitle}>No Posts Yet</Text>
          <Text style={styles.emptyText}>Start following creators to see their posts here!</Text>
        </ScrollView>
      ) : (
        <FlatList
          data={posts}
          renderItem={renderPost}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.feedContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00ff88" />}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={5}
          updateCellsBatchingPeriod={50}
          initialNumToRender={3}
          windowSize={5}
          viewabilityConfig={viewabilityConfig}
          onViewableItemsChanged={onViewableItemsChanged}
        />
      )}

      <Modal
        visible={commentModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCommentModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Comments</Text>
              <TouchableOpacity onPress={() => setCommentModalVisible(false)}>
                <Feather name="x" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {loadingComments ? (
              <View style={styles.modalLoadingContainer}>
                <ActivityIndicator size="large" color="#00ff88" />
                <Text style={styles.loadingText}>Loading comments...</Text>
              </View>
            ) : (
              <FlatList
                data={comments}
                renderItem={renderComment}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.commentsContainer}
                ListEmptyComponent={
                  <View style={styles.emptyCommentsContainer}>
                    <Feather name="message-circle" size={60} color="#333" />
                    <Text style={styles.emptyCommentsText}>No comments yet</Text>
                    <Text style={styles.emptyCommentsSubtext}>Be the first to comment!</Text>
                  </View>
                }
                showsVerticalScrollIndicator={false}
              />
            )}

            <View style={styles.commentInputContainer}>
              {replyingTo && (
                <View style={styles.replyingToContainer}>
                  <Text style={styles.replyingToText}>
                    Replying to @{replyingTo.username}
                  </Text>
                  <TouchableOpacity onPress={() => setReplyingTo(null)}>
                    <Feather name="x" size={16} color="#666" />
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.commentInputWrapper}>
                {userProfile?.avatar_url ? (
                  <Image source={{ uri: userProfile.avatar_url }} style={styles.commentInputAvatar} />
                ) : (
                  <View style={[styles.commentInputAvatar, styles.avatarPlaceholder]}>
                    <Feather name="user" size={16} color="#00ff88" />
                  </View>
                )}
                <TextInput
                  style={styles.commentInput}
                  placeholder="Add a comment..."
                  placeholderTextColor="#666"
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                  maxLength={500}
                />
                <TouchableOpacity
                  style={[styles.sendButton, (!commentText.trim() || submittingComment) && styles.sendButtonDisabled]}
                  onPress={submitComment}
                  disabled={!commentText.trim() || submittingComment}
                >
                  {submittingComment ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Feather name="send" size={20} color="#000" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 15,
    backgroundColor: '#000',
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
  },
  coinsHeaderText: {
    color: '#ffd700',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#666',
    fontSize: 16,
    marginTop: 12,
  },
  feedContainer: {
    paddingBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 20,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  postCard: {
    backgroundColor: '#0a0a0a',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userDetails: {
    flex: 1,
  },
  displayName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  username: {
    color: '#666',
    fontSize: 14,
  },
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  timestamp: {
    color: '#666',
    fontSize: 12,
  },
  followButton: {
    backgroundColor: '#00ff88',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  followingButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#00ff88',
  },
  followButtonDisabled: {
    opacity: 0.5,
  },
  followButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  followingButtonText: {
    color: '#00ff88',
  },
  optionsButton: {
    padding: 4,
  },
  postImage: {
    width: width,
    height: width,
    backgroundColor: '#1a1a1a',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  actionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionCount: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  coinsEarned: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  coinsText: {
    color: '#ffd700',
    fontSize: 12,
    fontWeight: 'bold',
  },
  viewsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingBottom: 8,
    gap: 6,
  },
  viewsText: {
    color: '#666',
    fontSize: 13,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingBottom: 8,
    gap: 6,
  },
  locationText: {
    color: '#00ff88',
    fontSize: 13,
  },
  musicContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingBottom: 8,
    gap: 6,
  },
  musicText: {
    color: '#00ff88',
    fontSize: 13,
    fontStyle: 'italic',
  },
  captionContainer: {
    paddingHorizontal: 15,
    paddingBottom: 15,
  },
  captionUsername: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  captionText: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0a0a0a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalLoadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  commentsContainer: {
    padding: 15,
  },
  emptyCommentsContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyCommentsText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
  },
  emptyCommentsSubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
  commentItem: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  commentReply: {
    marginLeft: 40,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  commentDisplayName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  commentUsername: {
    color: '#666',
    fontSize: 13,
  },
  commentText: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  commentActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  commentActionText: {
    color: '#666',
    fontSize: 12,
  },
  commentTime: {
    color: '#666',
    fontSize: 12,
    marginLeft: 'auto',
  },
  commentInputContainer: {
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    backgroundColor: '#0a0a0a',
  },
  replyingToContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingTop: 10,
    paddingBottom: 5,
  },
  replyingToText: {
    color: '#00ff88',
    fontSize: 13,
  },
  commentInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    gap: 12,
  },
  commentInputAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  commentInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 14,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00ff88',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
