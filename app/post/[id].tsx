// app/post/[id].tsx
// ✅ Full interactive post view — same experience as the feed
// ✅ Real-time likes, comments, views from Supabase
// ✅ Like / Unlike functionality
// ✅ Comments with real data
// ✅ Video support
// ✅ Navigate to user profile on tap

import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, KeyboardAvoidingView,
  Platform, FlatList, Dimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { supabase } from '../../config/supabase';
import { useAuthStore } from '../../store/authStore';

const { width } = Dimensions.get('window');
const COIN_TO_NGN = 150;

export default function PostDetail() {
  const { id }     = useLocalSearchParams();
  const { user }   = useAuthStore();

  const [post,         setPost]         = useState<any>(null);
  const [loading,      setLoading]      = useState(true);
  const [liked,        setLiked]        = useState(false);
  const [likesCount,   setLikesCount]   = useState(0);
  const [comments,     setComments]     = useState<any[]>([]);
  const [commentsCount,setCommentsCount]= useState(0);
  const [viewsCount,   setViewsCount]   = useState(0);
  const [newComment,   setNewComment]   = useState('');
  const [sendingComment,setSendingComment] = useState(false);
  const [liking,       setLiking]       = useState(false);
  const videoRef = useRef<any>(null);

  useEffect(() => { loadPost(); }, [id]);

  // ─── Load post + all real-time data ───────────────────────────────────────
  const loadPost = async () => {
    try {
      // 1. Load post with user info
      const { data: postData, error } = await supabase
        .from('posts')
        .select(`*, users(id, username, display_name, avatar_url, is_premium)`)
        .eq('id', id)
        .single();
      if (error) throw error;
      setPost(postData);

      // 2. Real-time like count from likes table
      const { count: lc } = await supabase
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', id);
      setLikesCount(lc || postData.likes_count || 0);

      // 3. Check if current user liked this post
      if (user?.id) {
        const { data: likeData } = await supabase
          .from('likes')
          .select('id')
          .eq('post_id', id)
          .eq('user_id', user.id)
          .maybeSingle();
        setLiked(!!likeData);
      }

      // 4. Real-time comment count
      const { count: cc } = await supabase
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', id);
      setCommentsCount(cc || postData.comments_count || 0);

      // 5. Load comments with user info
      const { data: commentsData } = await supabase
        .from('comments')
        .select(`*, users(id, username, display_name, avatar_url)`)
        .eq('post_id', id)
        .order('created_at', { ascending: true })
        .limit(50);
      setComments(commentsData || []);

      // 6. Views count
      setViewsCount(postData.views_count || 0);

      // 7. Increment view count (fire and forget)
      supabase.from('post_views')
        .insert({ post_id: id, user_id: user?.id || null })
        .then(() => {});

    } catch (error) {
      console.error('Error loading post:', error);
      Alert.alert('Error', 'Failed to load post');
    } finally {
      setLoading(false);
    }
  };

  // ─── Like / Unlike ────────────────────────────────────────────────────────
  const handleLike = async () => {
    if (!user?.id) { Alert.alert('Login Required', 'Please login to like posts'); return; }
    if (liking) return;
    setLiking(true);

    const wasLiked = liked;
    // Optimistic update
    setLiked(!wasLiked);
    setLikesCount(prev => wasLiked ? Math.max(0, prev - 1) : prev + 1);

    try {
      if (wasLiked) {
        await supabase.from('likes').delete()
          .eq('post_id', id).eq('user_id', user.id);
        await supabase.from('posts')
          .update({ likes_count: Math.max(0, likesCount - 1) })
          .eq('id', id);
      } else {
        await supabase.from('likes').insert({ post_id: id, user_id: user.id });
        await supabase.from('posts')
          .update({ likes_count: likesCount + 1 })
          .eq('id', id);
        // Notify post owner
        if (post?.users?.id && post.users.id !== user.id) {
          await supabase.from('notifications').insert({
            user_id:      post.users.id,
            from_user_id: user.id,
            type:         'like',
            title:        'New Like',
            message:      `Someone liked your post`,
            is_read:      false,
          });
        }
      }
    } catch {
      // Revert on error
      setLiked(wasLiked);
      setLikesCount(prev => wasLiked ? prev + 1 : Math.max(0, prev - 1));
    } finally {
      setLiking(false);
    }
  };

  // ─── Add Comment ──────────────────────────────────────────────────────────
  const handleComment = async () => {
    if (!user?.id) { Alert.alert('Login Required', 'Please login to comment'); return; }
    if (!newComment.trim()) return;
    if (newComment.length > 500) { Alert.alert('Too Long', 'Comment must be under 500 characters'); return; }

    setSendingComment(true);
    const text = newComment.trim();
    setNewComment('');

    try {
      const { data: commentData, error } = await supabase
        .from('comments')
        .insert({
          post_id:  id,
          user_id:  user.id,
          content:  text,
          text:     text,
        })
        .select(`*, users(id, username, display_name, avatar_url)`)
        .single();

      if (error) throw error;

      setComments(prev => [...prev, commentData]);
      setCommentsCount(prev => prev + 1);

      // Notify post owner
      if (post?.users?.id && post.users.id !== user.id) {
        await supabase.from('notifications').insert({
          user_id:      post.users.id,
          from_user_id: user.id,
          type:         'comment',
          title:        'New Comment',
          message:      `Someone commented on your post: "${text.slice(0, 50)}"`,
          is_read:      false,
        });
      }

      // Update comments count in posts table
      await supabase.from('posts')
        .update({ comments_count: commentsCount + 1 })
        .eq('id', id);

    } catch (e: any) {
      setNewComment(text);
      Alert.alert('Error', 'Failed to post comment. Please try again.');
    } finally {
      setSendingComment(false);
    }
  };

  // ─── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Post</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={s.center}>
          <ActivityIndicator size="large" color="#00ff88" />
        </View>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Feather name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Post</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={s.center}>
          <Feather name="alert-circle" size={64} color="#666" />
          <Text style={s.emptyText}>Post not found</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Post</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Media */}
        {post.media_type === 'video' ? (
          <Video
            ref={videoRef}
            source={{ uri: post.media_url }}
            style={s.media}
            resizeMode={ResizeMode.COVER}
            shouldPlay={false}
            useNativeControls
            isLooping={false}
          />
        ) : post.media_url ? (
          <Image
            source={{ uri: post.media_url }}
            style={s.media}
            resizeMode="cover"
          />
        ) : (
          <View style={[s.media, s.mediaPlaceholder]}>
            <Feather name="image" size={48} color="#333" />
          </View>
        )}

        <View style={s.content}>

          {/* User row */}
          <TouchableOpacity
            style={s.userRow}
            onPress={() => router.push(`/user/${post.users?.id}` as any)}
            activeOpacity={0.8}
          >
            {post.users?.avatar_url ? (
              <Image source={{ uri: post.users.avatar_url }} style={s.avatar} />
            ) : (
              <View style={[s.avatar, s.avatarPlaceholder]}>
                <Feather name="user" size={20} color="#00ff88" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.displayName}>{post.users?.display_name || 'Unknown'}</Text>
                {post.users?.is_premium && <Text style={{ fontSize: 14 }}>⭐</Text>}
              </View>
              <Text style={s.username}>@{post.users?.username}</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#444" />
          </TouchableOpacity>

          {/* Caption */}
          {post.caption ? (
            <Text style={s.caption}>{post.caption}</Text>
          ) : null}

          {/* Vibe badge */}
          {post.vibe_type ? (
            <View style={s.vibeBadge}>
              <Text style={s.vibeText}>
                {post.vibe_type === 'fire'     ? '🔥 Fire'
                : post.vibe_type === 'funny'   ? '😂 Funny'
                : post.vibe_type === 'shocking'? '😱 Shocking'
                : post.vibe_type === 'love'    ? '❤️ Love'
                : post.vibe_type === 'sad'     ? '😢 Sad'
                : post.vibe_type === 'hype'    ? '🚀 Hype'
                : post.vibe_type}
              </Text>
            </View>
          ) : null}

          {/* Stats + Like button */}
          <View style={s.statsRow}>
            {/* Like */}
            <TouchableOpacity style={s.statBtn} onPress={handleLike} disabled={liking}>
              <Feather
                name="heart"
                size={22}
                color={liked ? '#ff4d6d' : '#888'}
                style={{ opacity: liking ? 0.5 : 1 }}
              />
              <Text style={[s.statText, liked && { color: '#ff4d6d' }]}>
                {likesCount.toLocaleString()}
              </Text>
            </TouchableOpacity>

            {/* Comments */}
            <View style={s.statBtn}>
              <Feather name="message-circle" size={22} color="#888" />
              <Text style={s.statText}>{commentsCount.toLocaleString()}</Text>
            </View>

            {/* Views */}
            <View style={s.statBtn}>
              <Feather name="eye" size={22} color="#888" />
              <Text style={s.statText}>{viewsCount.toLocaleString()}</Text>
            </View>

            {/* Coins received */}
            {post.coins_received > 0 && (
              <View style={s.statBtn}>
                <Text style={{ fontSize: 16 }}>🪙</Text>
                <Text style={[s.statText, { color: '#ffd700' }]}>
                  {post.coins_received}
                </Text>
              </View>
            )}
          </View>

          {/* Date */}
          <Text style={s.date}>
            {new Date(post.created_at).toLocaleDateString('en-NG', {
              year: 'numeric', month: 'long', day: 'numeric',
            })}
          </Text>

          {/* Divider */}
          <View style={s.divider} />

          {/* Comments section */}
          <Text style={s.commentsTitle}>
            💬 Comments ({commentsCount})
          </Text>

          {comments.length === 0 ? (
            <View style={s.noComments}>
              <Text style={s.noCommentsText}>No comments yet. Be the first!</Text>
            </View>
          ) : (
            comments.map((comment: any) => (
              <View key={comment.id} style={s.commentItem}>
                <TouchableOpacity
                  onPress={() => router.push(`/user/${comment.users?.id}` as any)}
                >
                  {comment.users?.avatar_url ? (
                    <Image source={{ uri: comment.users.avatar_url }} style={s.commentAvatar} />
                  ) : (
                    <View style={[s.commentAvatar, s.avatarPlaceholder]}>
                      <Feather name="user" size={14} color="#00ff88" />
                    </View>
                  )}
                </TouchableOpacity>
                <View style={s.commentContent}>
                  <View style={s.commentHeader}>
                    <Text style={s.commentUser}>{comment.users?.display_name || 'Unknown'}</Text>
                    <Text style={s.commentUsername}>@{comment.users?.username}</Text>
                    <Text style={s.commentTime}>
                      {new Date(comment.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <Text style={s.commentText}>{comment.content || comment.text}</Text>
                </View>
              </View>
            ))
          )}

          <View style={{ height: 20 }} />
        </View>
      </ScrollView>

      {/* Comment input */}
      <View style={s.commentInputBar}>
        <TextInput
          style={s.commentInput}
          placeholder="Add a comment..."
          placeholderTextColor="#555"
          value={newComment}
          onChangeText={setNewComment}
          multiline
          maxLength={500}
          editable={!!user}
        />
        <TouchableOpacity
          style={[s.sendBtn, (!newComment.trim() || sendingComment) && s.sendBtnDisabled]}
          onPress={handleComment}
          disabled={!newComment.trim() || sendingComment || !user}
        >
          {sendingComment
            ? <ActivityIndicator size="small" color="#000" />
            : <Feather name="send" size={18} color="#000" />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#000' },
  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 15, backgroundColor: '#000', borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  headerTitle:     { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  center:          { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText:       { color: '#666', fontSize: 16, marginTop: 15 },
  media:           { width, aspectRatio: 1, backgroundColor: '#111' },
  mediaPlaceholder:{ justifyContent: 'center', alignItems: 'center' },
  content:         { padding: 16 },
  userRow:         { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 12 },
  avatar:          { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#00ff88' },
  avatarPlaceholder:{ backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  displayName:     { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  username:        { color: '#666', fontSize: 13, marginTop: 1 },
  caption:         { color: '#eee', fontSize: 15, lineHeight: 22, marginBottom: 12 },
  vibeBadge:       { alignSelf: 'flex-start', backgroundColor: '#1a1a1a', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 12, borderWidth: 1, borderColor: '#333' },
  vibeText:        { color: '#fff', fontSize: 12, fontWeight: '600' },
  statsRow:        { flexDirection: 'row', gap: 20, marginBottom: 12, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#1a1a1a' },
  statBtn:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statText:        { color: '#aaa', fontSize: 14, fontWeight: '600' },
  date:            { color: '#555', fontSize: 12, marginBottom: 16 },
  divider:         { height: 1, backgroundColor: '#1a1a1a', marginVertical: 4 },
  commentsTitle:   { color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 16, marginTop: 12 },
  noComments:      { paddingVertical: 20, alignItems: 'center' },
  noCommentsText:  { color: '#555', fontSize: 14 },
  commentItem:     { flexDirection: 'row', gap: 10, marginBottom: 16 },
  commentAvatar:   { width: 34, height: 34, borderRadius: 17 },
  commentContent:  { flex: 1 },
  commentHeader:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' },
  commentUser:     { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  commentUsername: { color: '#555', fontSize: 11 },
  commentTime:     { color: '#444', fontSize: 10, marginLeft: 'auto' },
  commentText:     { color: '#ccc', fontSize: 14, lineHeight: 20 },
  commentInputBar: { flexDirection: 'row', gap: 10, padding: 12, paddingBottom: Platform.OS === 'ios' ? 28 : 12, backgroundColor: '#0a0a0a', borderTopWidth: 1, borderTopColor: '#1a1a1a', alignItems: 'flex-end' },
  commentInput:    { flex: 1, backgroundColor: '#111', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#fff', fontSize: 14, maxHeight: 100, borderWidth: 1, borderColor: '#222' },
  sendBtn:         { width: 40, height: 40, borderRadius: 20, backgroundColor: '#00ff88', justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
}); 
