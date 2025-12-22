// app/(tabs)/videos.tsx - WITH NATIVE ADMOB ADS
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image, TouchableOpacity, Dimensions,
  ActivityIndicator, Alert, Modal, TextInput, Share
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import * as MediaLibrary from 'expo-media-library';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/config/supabase';
import { useRouter } from 'expo-router';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

const { width, height } = Dimensions.get('window');
const LIKE_REWARD = 0.01;

// YOUR ADMOB AD UNIT IDs
const BANNER_AD_UNIT_ID = __DEV__
  ? TestIds.BANNER
  : 'ca-app-pub-8235065812461074/4176727692';

interface Post {
  id: string; user_id: string; username: string; display_name: string;
  user_photo_url?: string; media_url?: string; caption: string;
  likes_count: number; comments_count: number; views_count: number;
  coins_received: number; liked_by: string[]; location?: string;
  music_name?: string; music_artist?: string; created_at: string;
}

interface Comment {
  id: string; post_id: string; user_id: string; username: string;
  display_name: string; user_photo_url?: string; text: string;
  likes_count: number; replies_count: number; liked_by: string[];
  parent_comment_id?: string; created_at: string;
}

// Ad Item Interface
interface AdItem {
  id: string;
  isAd: true;
  adIndex: number;
}

type FeedItem = Post | AdItem;

function isAd(item: FeedItem): item is AdItem {
  return 'isAd' in item && item.isAd === true;
}

// Native Ad Component (looks like a video post)
function NativeAdPost({ adIndex }: { adIndex: number }) {
  const [adLoaded, setAdLoaded] = useState(false);
  const [adError, setAdError] = useState(false);

  return (
    <View style={styles.videoContainer}>
      <View style={styles.adContainer}>
        {/* Ad Label */}
        <View style={styles.adBadge}>
          <Text style={styles.adBadgeText}>Sponsored</Text>
        </View>

        {/* Banner Ad */}
        <View style={styles.adBannerContainer}>
          <BannerAd
            unitId={BANNER_AD_UNIT_ID}
            size={BannerAdSize.LARGE_BANNER}
            requestOptions={{
              requestNonPersonalizedAdsOnly: false,
            }}
            onAdLoaded={() => {
              setAdLoaded(true);
              setAdError(false);
            }}
            onAdFailedToLoad={(error) => {
              console.log('Ad failed to load:', error);
              setAdError(true);
            }}
          />
        </View>

        {/* Ad Content Placeholder (while ad loads) */}
        {!adLoaded && !adError && (
          <View style={styles.adPlaceholder}>
            <ActivityIndicator size="large" color="#00ff88" />
            <Text style={styles.adPlaceholderText}>Loading ad...</Text>
          </View>
        )}

        {/* Error State */}
        {adError && (
          <View style={styles.adPlaceholder}>
            <Feather name="alert-circle" size={48} color="#666" />
            <Text style={styles.adPlaceholderText}>Ad not available</Text>
          </View>
        )}

        {/* Decorative content around ad */}
        <View style={styles.adDecoration}>
          <View style={styles.adInfoBox}>
            <MaterialCommunityIcons name="star" size={24} color="#00ff88" />
            <Text style={styles.adInfoText}>Support Kinsta by viewing ads</Text>
          </View>
         
          <View style={styles.adBenefits}>
            <View style={styles.adBenefitItem}>
              <Feather name="check-circle" size={16} color="#00ff88" />
              <Text style={styles.adBenefitText}>Free content</Text>
            </View>
            <View style={styles.adBenefitItem}>
              <Feather name="check-circle" size={16} color="#00ff88" />
              <Text style={styles.adBenefitText}>Support creators</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function VideoPost({
  item, isActive, onLike, onLikeWithTip, onComment, onFollow, onUserPress, onShare, onSaveMedia, user, onView
}: {
  item: Post; isActive: boolean; onLike: (post: Post) => void; onLikeWithTip: (post: Post) => void;
  onComment: (post: Post) => void; onFollow: (userId: string, isFollowing: boolean) => Promise<void>;
  onUserPress: (userId: string) => void; onShare: (post: Post) => void; onSaveMedia: (post: Post) => void;
  user: any; onView: (postId: string) => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [checkingFollow, setCheckingFollow] = useState(true);
  const videoRef = useRef<Video>(null);
  const viewedRef = useRef(false);
  const userId = user?.id || (user as any)?.id;
  const isLiked = userId ? item.liked_by?.includes(userId) : false;
  const isOwnPost = userId === item.user_id;

  useEffect(() => { checkFollowStatus(); }, [user, item.user_id]);
  useEffect(() => {
    if (isActive) {
      if (!viewedRef.current) {
        viewedRef.current = true;
        onView(item.id);
      }
      if (videoRef.current) { videoRef.current.playAsync(); setIsPlaying(true); }
    } else if (videoRef.current) { videoRef.current.pauseAsync(); setIsPlaying(false); }
  }, [isActive]);

  const checkFollowStatus = async () => {
    if (!userId || isOwnPost) { setCheckingFollow(false); return; }
    try {
      const { data } = await supabase.from('follows').select('id')
        .eq('follower_id', userId).eq('following_id', item.user_id).maybeSingle();
      setIsFollowing(!!data);
    } catch { /* ignore */ } finally { setCheckingFollow(false); }
  };

  const handleFollow = async () => {
    if (checkingFollow || !userId) return;
    try { await onFollow(item.user_id, isFollowing); setIsFollowing(!isFollowing); }
    catch { Alert.alert('Error', 'Follow update failed'); }
  };

  const togglePlay = async () => {
    if (!videoRef.current) return;
    try {
      if (isPlaying) { await videoRef.current.pauseAsync(); setIsPlaying(false); }
      else { await videoRef.current.playAsync(); setIsPlaying(true); }
    } catch { /* ignore */ }
  };

  const toggleMute = async () => {
    if (!videoRef.current) return;
    try { await videoRef.current.setIsMutedAsync(!isMuted); setIsMuted(!isMuted); } catch { /* ignore */ }
  };

  return (
    <View style={styles.videoContainer}>
      <TouchableOpacity style={styles.videoTouchable} onPress={togglePlay} onLongPress={() => onSaveMedia(item)} delayLongPress={500} activeOpacity={0.9}>
        <Video
          ref={videoRef}
          source={{ uri: item.media_url || '' }}
          style={styles.video}
          resizeMode={ResizeMode.COVER}
          isLooping
          isMuted={isMuted}
          shouldPlay={isActive}
        />
        {!isPlaying && (
          <View style={styles.playOverlay}>
            <View style={styles.playButton}><Feather name="play" size={64} color="#00ff88" /></View>
          </View>
        )}
      </TouchableOpacity>

      {item.music_name && (
        <View style={styles.musicContainer}>
          <Feather name="music" size={12} color="#00ff88" />
          <Text style={styles.musicText}>{item.music_name}{item.music_artist ? ` - ${item.music_artist}` : ''}</Text>
        </View>
      )}

      <View style={styles.videoInfo}>
        <View style={styles.userInfoOverlay}>
          <TouchableOpacity style={styles.userInfoContent} onPress={() => onUserPress(item.user_id)}>
            {item.user_photo_url ? (
              <Image source={{ uri: item.user_photo_url }} style={styles.videoUserAvatar} />
            ) : (
              <View style={[styles.videoUserAvatar, styles.avatarPlaceholder]}><Feather name="user" size={20} color="#00ff88" /></View>
            )}
            <View style={styles.videoUserDetails}>
              <Text style={styles.videoDisplayName}>{item.display_name}</Text>
              <Text style={styles.videoUsername}>@{item.username}</Text>
            </View>
          </TouchableOpacity>
          {!isOwnPost && (
            <TouchableOpacity
              style={[styles.followButtonVideo, isFollowing && styles.followingButtonVideo, checkingFollow && styles.disabled]}
              onPress={handleFollow} disabled={checkingFollow}
            >
              <Text style={[styles.followButtonTextVideo, isFollowing && styles.followingButtonTextVideo]}>
                {checkingFollow ? '...' : isFollowing ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {item.caption && <Text style={styles.videoCaption} numberOfLines={3}>{item.caption}</Text>}
        {item.location && (
          <View style={styles.locationContainer}>
            <Feather name="map-pin" size={12} color="#00ff88" />
            <Text style={styles.locationText}>{item.location}</Text>
          </View>
        )}
      </View>

      <View style={styles.actionsRight}>
        <TouchableOpacity
          style={styles.actionButtonRight}
          onPress={() => onLike(item)}
          onLongPress={() => !isOwnPost && onLikeWithTip(item)}
          delayLongPress={500}
        >
          <View style={styles.iconContainer}>
            <Feather name="heart" size={32} color={isLiked ? '#00ff88' : '#fff'} fill={isLiked ? '#00ff88' : 'none'} />
          </View>
          <Text style={styles.actionTextRight}>{item.likes_count}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButtonRight} onPress={() => onComment(item)}>
          <View style={styles.iconContainer}>
            <Feather name="message-circle" size={30} color="#fff" />
          </View>
          <Text style={styles.actionTextRight}>{item.comments_count}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButtonRight} onPress={() => onShare(item)}>
          <View style={styles.iconContainer}>
            <Feather name="share-2" size={30} color="#fff" />
          </View>
          <Text style={styles.actionTextRight}>Share</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButtonRight} onPress={toggleMute}>
          <View style={styles.iconContainer}>
            <Feather name={isMuted ? 'volume-x' : 'volume-2'} size={30} color="#fff" />
          </View>
        </TouchableOpacity>

        {item.views_count > 0 && (
          <View style={styles.viewsOverlay}>
            <Feather name="eye" size={16} color="#fff" />
            <Text style={styles.viewsOverlayText}>{item.views_count}</Text>
          </View>
        )}

        {item.coins_received > 0 && (
          <View style={styles.coinsOverlay}>
            <MaterialCommunityIcons name="diamond" size={20} color="#ffd700" />
            <Text style={styles.coinsOverlayText}>{item.coins_received.toFixed(2)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function VideosScreen() {
  const { userProfile, user, loadProfile } = useAuthStore();
  const router = useRouter();
  const userId = user?.id || (user as any)?.id;

  const [posts, setPosts] = useState<Post[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [coinModalVisible, setCoinModalVisible] = useState(false);
  const [coinAmount, setCoinAmount] = useState('');
  const [coinRecipientPost, setCoinRecipientPost] = useState<Post | null>(null);
  const [coinCallback, setCoinCallback] = useState<((amount: number) => void) | null>(null);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    loadVideos();
    const postsChannel = supabase.channel('video-posts-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => loadVideos()).subscribe();
    const likesChannel = supabase.channel('video-likes-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, () => loadVideos()).subscribe();
    const commentsChannel = supabase.channel('video-comments-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => loadVideos()).subscribe();
    return () => {
      supabase.removeChannel(postsChannel);
      supabase.removeChannel(likesChannel);
      supabase.removeChannel(commentsChannel);
    };
  }, []);

  const loadVideos = async () => {
    try {
      const { data, error } = await supabase.from('posts').select(`*, users!posts_user_id_fkey (username, display_name, avatar_url)`)
        .eq('media_type', 'video').eq('is_published', true).order('created_at', { ascending: false }).limit(50);
      if (error) throw error;

      const postIds = (data || []).map(p => p.id);
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

      const postsArray = (data || []).map((p: any) => {
        const likes = likesMap.get(p.id) || { count: 0, users: [] };
        const comments = commentsMap.get(p.id) || 0;
     
        return {
          id: p.id, user_id: p.user_id, username: p.users?.username || 'unknown',
          display_name: p.users?.display_name || 'Unknown', user_photo_url: p.users?.avatar_url,
          media_url: p.media_url, caption: p.caption || '', likes_count: likes.count,
          comments_count: comments, views_count: p.views_count || 0,
          coins_received: p.coins_received || 0, liked_by: likes.users,
          location: p.location, music_name: p.music_name, music_artist: p.music_artist,
          created_at: p.created_at,
        };
      });

      setPosts(postsArray);

      // Insert ads every 4 posts
      const itemsWithAds: FeedItem[] = [];
      let adCounter = 0;
     
      postsArray.forEach((post, index) => {
        itemsWithAds.push(post);
       
        // Insert ad after every 4 posts
        if ((index + 1) % 4 === 0) {
          itemsWithAds.push({
            id: `ad_${adCounter}`,
            isAd: true,
            adIndex: adCounter,
          });
          adCounter++;
        }
      });

      setFeedItems(itemsWithAds);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load videos');
    } finally {
      setLoading(false);
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) setActiveIndex(viewableItems[0].index || 0);
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

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

  const showCoinDialog = (post: Post, onSend: (amount: number) => void) => {
    setCoinRecipientPost(post); setCoinCallback(() => onSend); setCoinAmount(''); setCoinModalVisible(true);
  };

  const handleCoinSend = () => {
    if (!coinAmount.trim() || !coinCallback) return;
    const amount = parseFloat(coinAmount);
    if (isNaN(amount) || amount < 0.01) { Alert.alert('Invalid Amount', 'Minimum 0.01 coins'); return; }
    if (amount > (userProfile?.coins || 0)) { Alert.alert('Insufficient Coins', `You only have ${(userProfile?.coins || 0).toFixed(2)} coins`); return; }
    setCoinModalVisible(false); coinCallback(amount);
  };

  const handleLike = useCallback(async (post: Post) => {
    if (!userId) { Alert.alert('Login Required', 'Please login to like videos'); return; }
    const isLiked = post.liked_by?.includes(userId);

    if (isLiked) {
      try {
        await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', userId);
     
        const { data: ownerData } = await supabase.from('users').select('coins').eq('id', post.user_id).single();
        if (ownerData) {
          await supabase.from('users').update({ coins: Math.max(0, ownerData.coins - LIKE_REWARD) }).eq('id', post.user_id);
          await supabase.from('posts').update({ coins_received: Math.max(0, post.coins_received - LIKE_REWARD) }).eq('id', post.id);
        }
    
        await loadVideos();
      } catch (err: any) { console.error('Unlike error:', err); Alert.alert('Error', err.message || 'Unlike failed'); }
    } else {
      try {
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
    
        await loadVideos();
      } catch (err: any) { console.error('Like error:', err); Alert.alert('Error', err.message || 'Like failed'); }
    }
  }, [userId, userProfile]);

  const handleLikeWithTip = useCallback((post: Post) => {
    if (post.liked_by?.includes(userId)) { Alert.alert('Already Liked', 'You already liked this video. Long press to send extra coins!'); return; }
    showCoinDialog(post, async (coinAmount) => {
      try {
        await supabase.from('likes').insert({ post_id: post.id, user_id: userId });
        await supabase.from('posts').update({ coins_received: post.coins_received + coinAmount + LIKE_REWARD }).eq('id', post.id);
    
        await supabase.from('users').update({ coins: (userProfile?.coins || 0) - coinAmount }).eq('id', userId);
    
        const { data: receiver } = await supabase.from('users').select('coins').eq('id', post.user_id).single();
        await supabase.from('users').update({ coins: (receiver?.coins || 0) + coinAmount + LIKE_REWARD }).eq('id', post.user_id);
    
        await supabase.from('transactions').insert([
          { user_id: userId, type: 'spent', amount: coinAmount, description: `Sent ${coinAmount} coins to @${post.username}`, status: 'completed' },
          { user_id: post.user_id, type: 'received', amount: coinAmount + LIKE_REWARD, description: `Received ${coinAmount} coins tip + ${LIKE_REWARD} like reward`, status: 'completed' }
        ]);
    
        await loadVideos();
        await loadProfile();
        Alert.alert('Success! 💎', `You sent ${coinAmount.toFixed(2)} coins to @${post.username}!`);
      } catch (err: any) { console.error('Coin send error:', err); Alert.alert('Error', err.message || 'Failed to send coins'); }
    });
  }, [userId, userProfile]);

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
      const { data } = await supabase.from('comments').select(`*, users!comments_user_id_fkey (username, display_name, avatar_url)`)
        .eq('post_id', post.id).order('created_at', { ascending: false });
   
      const commentIds = (data || []).map(c => c.id);
      const { data: commentLikesData } = await supabase.from('comment_likes').select('comment_id, user_id').in('comment_id', commentIds);

      const likesMap = new Map<string, string[]>();
      commentLikesData?.forEach(like => {
        const existing = likesMap.get(like.comment_id) || [];
        existing.push(like.user_id);
        likesMap.set(like.comment_id, existing);
      });

      setComments((data || []).map((c: any) => ({
        id: c.id, post_id: c.post_id, user_id: c.user_id, username: c.users?.username || 'unknown',
        display_name: c.users?.display_name || 'Unknown', user_photo_url: c.users?.avatar_url,
        text: c.text, likes_count: likesMap.get(c.id)?.length || 0,
        replies_count: c.replies_count || 0, liked_by: likesMap.get(c.id) || [],
        parent_comment_id: c.parent_comment_id, created_at: c.created_at,
      })));
    } catch { setComments([]); } finally { setLoadingComments(false); }
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
      await loadVideos();
      await handleComment(selectedPost);
    } catch (e: any) { console.error('Comment error:', e); Alert.alert('Error', e.message || 'Comment failed'); }
    finally { setSubmittingComment(false); }
  };

  const saveMediaToGallery = async (post: Post) => {
    if (!post.media_url) return Alert.alert('No media', 'Nothing to save');
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission required', 'Allow access to photos to save');
    try {
      const asset = await MediaLibrary.createAssetAsync(post.media_url);
      await MediaLibrary.createAlbumAsync('Kinsta', asset, false);
      Alert.alert('Saved!', 'Video saved to gallery');
    } catch (err: any) {
      console.error('Save error:', err);
      if (err.message?.includes('network') || err.message?.includes('download')) {
        Alert.alert('Save failed', 'Check your internet connection and try again');
      } else {
        Alert.alert('Save failed', 'Could not save video');
      }
    }
  };

  const handleShare = useCallback(async (post: Post) => {
    try { await Share.share({ message: `Check out this video by @${post.username} on Kinsta!\n\n${post.caption || 'Amazing content!'}` }); } catch { /* ignore */ }
  }, []);

  const handleFollow = useCallback(async (targetUserId: string, isFollowing: boolean) => {
    if (!userId) return;
    try {
      if (isFollowing) {
        await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', targetUserId);
        const { data } = await supabase.from('users').select('followers').eq('id', targetUserId).single();
        await supabase.from('users').update({ followers: Math.max(0, (data?.followers || 0) - 1) }).eq('id', targetUserId);
      } else {
        await supabase.from('follows').insert({ follower_id: userId, following_id: targetUserId });
        const { data } = await supabase.from('users').select('followers').eq('id', targetUserId).single();
        await supabase.from('users').update({ followers: (data?.followers || 0) + 1 }).eq('id', targetUserId);
      }
    } catch { throw new Error('Follow failed'); }
  }, [userId]);

  const handleUserPress = useCallback((targetUserId: string) => router.push(`/user/${targetUserId}` as any), [router]);

  const renderComment = useCallback(({ item }: { item: Comment }) => {
    const isLiked = userId ? item.liked_by?.includes(userId) : false;
    const isReply = !!item.parent_comment_id;
 
    return (
      <View style={[styles.commentItem, isReply && styles.commentReply]}>
        {item.user_photo_url ? (
          <Image source={{ uri: item.user_photo_url }} style={styles.commentAvatar} />
        ) : (
          <View style={[styles.commentAvatar, styles.commentAvatarPlaceholder]}>
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

  const renderFeedItem = useCallback(({ item, index }: { item: FeedItem; index: number }) => {
    if (isAd(item)) {
      return <NativeAdPost adIndex={item.adIndex} />;
    }
   
    return (
      <VideoPost
        item={item}
        isActive={index === activeIndex}
        onLike={handleLike}
        onLikeWithTip={handleLikeWithTip}
        onComment={handleComment}
        onFollow={handleFollow}
        onUserPress={handleUserPress}
        onShare={handleShare}
        onSaveMedia={saveMediaToGallery}
        user={user}
        onView={handleView}
      />
    );
  }, [activeIndex, handleLike, handleLikeWithTip, handleComment, handleFollow, handleUserPress, handleShare, user, handleView]);

  if (loading && feedItems.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Videos</Text>
          <View style={styles.coinsHeader}>
            <MaterialCommunityIcons name="diamond" size={18} color="#ffd700" />
            <Text style={styles.coinsHeaderText}>{(userProfile?.coins || 0).toFixed(2)}</Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00ff88" />
          <Text style={styles.loadingText}>Loading videos...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerSmall}>
        <Text style={styles.headerTitleSmall}>Videos</Text>
        <View style={styles.coinsHeader}>
          <MaterialCommunityIcons name="diamond" size={18} color="#ffd700" />
          <Text style={styles.coinsHeaderText}>{(userProfile?.coins || 0).toFixed(2)}</Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={feedItems}
        renderItem={renderFeedItem}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={height - 100}
        snapToAlignment="start"
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        removeClippedSubviews
        maxToRenderPerBatch={2}
        initialNumToRender={1}
        windowSize={3}
      />

      <Modal visible={commentModalVisible} animationType="slide" onRequestClose={() => setCommentModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Comments ({selectedPost?.comments_count || 0})</Text>
            <TouchableOpacity onPress={() => setCommentModalVisible(false)}>
              <Feather name="x" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          {loadingComments ? (
            <View style={styles.modalLoading}><ActivityIndicator size="large" color="#00ff88" /></View>
          ) : comments.length === 0 ? (
            <View style={styles.noComments}>
              <Feather name="message-circle" size={64} color="#333" />
              <Text style={styles.noCommentsText}>No comments yet</Text>
            </View>
          ) : (
            <FlatList data={comments} keyExtractor={item => item.id} renderItem={renderComment} contentContainerStyle={styles.commentsList} />
          )}
          {replyingTo && (
            <View style={styles.replyingToBar}>
              <Text style={styles.replyingToText}>Replying to @{replyingTo.username}</Text>
              <TouchableOpacity onPress={() => setReplyingTo(null)}>
                <Feather name="x" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.commentInputContainer}>
            <TextInput style={styles.commentInput} placeholder={replyingTo ? "Write a reply..." : "Add a comment..."} placeholderTextColor="#666"
              value={commentText} onChangeText={setCommentText} multiline maxLength={500} editable={!submittingComment} />
            <TouchableOpacity style={styles.sendButton} onPress={submitComment} disabled={!commentText.trim() || submittingComment}>
              <View style={[styles.sendButtonGradient, (!commentText.trim() || submittingComment) && styles.sendButtonDisabled]}>
                {submittingComment ? <ActivityIndicator size="small" color="#000" /> : <Feather name="send" size={20} color="#000" />}
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={coinModalVisible} transparent={true} animationType="fade" onRequestClose={() => setCoinModalVisible(false)}>
        <View style={styles.coinModalOverlay}>
          <View style={styles.coinModalContent}>
            <Text style={styles.coinModalTitle}>💎 Send Extra Coins</Text>
            <Text style={styles.coinModalSubtitle}>Support @{coinRecipientPost?.username}!</Text>
            <Text style={styles.coinModalBalance}>Your balance: {(userProfile?.coins || 0).toFixed(2)} coins</Text>
            <Text style={styles.coinModalNote}>Tip on top of the 0.01 coin like reward</Text>
            <TextInput style={styles.coinInput} placeholder="Enter amount (min 0.01)" placeholderTextColor="#666"
              keyboardType="decimal-pad" value={coinAmount} onChangeText={setCoinAmount} autoFocus />
            <View style={styles.coinModalButtons}>
              <TouchableOpacity style={styles.coinCancelButton} onPress={() => setCoinModalVisible(false)}>
                <Text style={styles.coinCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.coinSendButton} onPress={handleCoinSend}>
                <Text style={styles.coinSendButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { paddingTop: 50, paddingBottom: 16, paddingHorizontal: 24, backgroundColor: '#0a0a0a', borderBottomWidth: 1, borderBottomColor: '#1a1a1a', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#00ff88' },
  headerSmall: { paddingTop: 50, paddingBottom: 12, paddingHorizontal: 24, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(10, 10, 10, 0.8)' },
  headerTitleSmall: { fontSize: 20, fontWeight: 'bold', color: '#00ff88' },
  coinsHeader: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, gap: 5, borderWidth: 1, borderColor: '#00ff88' },
  coinsHeaderText: { color: '#00ff88', fontWeight: 'bold', fontSize: 14 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 16, color: '#666' },
 
  // Ad Styles
  adContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  adBadge: {
    position: 'absolute',
    top: 60,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    zIndex: 10,
  },
  adBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  adBannerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  adPlaceholder: {
    width: width - 40,
    height: 200,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  adPlaceholderText: {
    color: '#666',
    fontSize: 16,
    marginTop: 12,
  },
  adDecoration: {
    width: '100%',
    marginTop: 40,
  },
  adInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 20,
  },
  adInfoText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  adBenefits: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 16,
  },
  adBenefitItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  adBenefitText: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: '600',
  },

  videoContainer: { width, height: height - 100, backgroundColor: '#000', position: 'relative' },
  videoTouchable: { flex: 1 },
  video: { width: '100%', height: '100%' },
  playOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  playButton: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#00ff88' },
  videoInfo: { position: 'absolute', bottom: 100, left: 0, right: 80, padding: 16 },
  userInfoOverlay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  userInfoContent: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  videoUserAvatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12, borderWidth: 2, borderColor: '#00ff88', backgroundColor: '#1a1a1a' },
  avatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  videoUserDetails: { flex: 1 },
  videoDisplayName: { fontSize: 16, fontWeight: 'bold', color: '#fff', textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  videoUsername: { fontSize: 14, color: '#00ff88', textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  musicContainer: { position: 'absolute', bottom: 90, left: 16, right: 80, flexDirection: 'row', alignItems: 'center', gap: 4 },
  musicText: { fontSize: 12, color: '#00ff88', textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  followButtonVideo: { backgroundColor: '#00ff88', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, minWidth: 80, alignItems: 'center' },
  followingButtonVideo: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#00ff88' },
  disabled: { opacity: 0.6 },
  followButtonTextVideo: { color: '#000', fontSize: 13, fontWeight: '700' },
  followingButtonTextVideo: { color: '#00ff88' },
  videoCaption: { fontSize: 14, color: '#fff', lineHeight: 20, textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3, marginBottom: 8 },
  locationContainer: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  locationText: { fontSize: 12, color: '#00ff88', textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  actionsRight: { position: 'absolute', right: 16, bottom: 120, gap: 24, alignItems: 'center' },
  actionButtonRight: { alignItems: 'center', gap: 4 },
  iconContainer: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.5, shadowRadius: 3 },
  actionTextRight: { color: '#fff', fontSize: 12, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  viewsOverlay: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(26, 26, 26, 0.8)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, gap: 4, borderWidth: 1, borderColor: '#666' },
  viewsOverlayText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  coinsOverlay: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(26, 26, 26, 0.8)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, gap: 4, borderWidth: 1, borderColor: '#ffd700' },
  coinsOverlayText: { color: '#ffd700', fontSize: 14, fontWeight: 'bold' },
  modalContainer: { flex: 1, backgroundColor: '#000' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingTop: 60, borderBottomWidth: 1, borderBottomColor: '#1a1a1a', backgroundColor: '#0a0a0a' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#00ff88' },
  modalLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noComments: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  noCommentsText: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginTop: 16 },
  commentsList: { padding: 16 },
  commentItem: { flexDirection: 'row', marginBottom: 20 },
  commentReply: { marginLeft: 40, borderLeftWidth: 2, borderLeftColor: '#00ff88', paddingLeft: 12 },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 12, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#00ff88' },
  commentAvatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  commentContent: { flex: 1 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 },
  commentDisplayName: { fontSize: 14, fontWeight: '700', color: '#fff' },
  commentUsername: { fontSize: 13, fontWeight: '400', color: '#00ff88' },
  commentText: { fontSize: 14, color: '#fff', lineHeight: 20, marginBottom: 8 },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  commentActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  commentActionText: { fontSize: 12, color: '#666' },
  commentTime: { fontSize: 12, color: '#666', marginLeft: 'auto' },
  replyingToBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#1a1a1a', borderTopWidth: 1, borderTopColor: '#333' },
  replyingToText: { fontSize: 14, color: '#00ff88', fontStyle: 'italic' },
  commentInputContainer: { flexDirection: 'row', padding: 16, borderTopWidth: 1, borderTopColor: '#1a1a1a', gap: 12, backgroundColor: '#0a0a0a' },
  commentInput: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, maxHeight: 100, color: '#fff', borderWidth: 1, borderColor: '#333' },
  sendButton: { borderRadius: 24, overflow: 'hidden' },
  sendButtonGradient: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: '#00ff88', borderRadius: 24 },
  sendButtonDisabled: { backgroundColor: '#1a1a1a', opacity: 0.5 },
  coinModalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  coinModalContent: { backgroundColor: '#1a1a1a', borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, borderWidth: 2, borderColor: '#00ff88' },
  coinModalTitle: { fontSize: 24, fontWeight: 'bold', color: '#00ff88', textAlign: 'center', marginBottom: 8 },
  coinModalSubtitle: { fontSize: 16, color: '#fff', textAlign: 'center', marginBottom: 8 },
  coinModalBalance: { fontSize: 14, color: '#ffd700', textAlign: 'center', marginBottom: 8 },
  coinModalNote: { fontSize: 12, color: '#999', textAlign: 'center', marginBottom: 20, fontStyle: 'italic' },
  coinInput: { backgroundColor: '#0a0a0a', borderRadius: 12, borderWidth: 1, borderColor: '#00ff88', padding: 16, fontSize: 18, color: '#fff', textAlign: 'center', marginBottom: 20 },
  coinModalButtons: { flexDirection: 'row', gap: 12 },
  coinCancelButton: { flex: 1, backgroundColor: '#333', padding: 16, borderRadius: 12, alignItems: 'center' },
  coinCancelButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  coinSendButton: { flex: 1, backgroundColor: '#00ff88', padding: 16, borderRadius: 12, alignItems: 'center' },
  coinSendButtonText: { color: '#000', fontSize: 16, fontWeight: '700' },
}); 
	
