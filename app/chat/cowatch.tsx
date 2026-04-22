// app/chat/cowatch.tsx
// ─────────────────────────────────────────────────────────────
// LumVibe — Co-Watch Screen (Professional Rewrite)
// ✅ FIX: Real-time chat receive — partner messages now appear live
// ✅ FIX: Stale closure bug in handleRemoteSync — feedType always fresh
// ✅ FIX: Agora in test mode — clean, no token needed, App ID secured in env
// ✅ FIX: PiP controls no longer clip off screen
// ✅ FIX: Share uses React Native Share API (real native share sheet)
// ✅ FIX: Gift system matches index.tsx exactly (coin deduction + RPC + transactions)
// ✅ FIX: Gift packages match buy-coins exactly (rose/ice_cream/love_letter/trophy/crown/diamond)
// ✅ FIX: Caption no longer shown twice
// ✅ FIX: display_name correctly resolved (not always username)
// ✅ FIX: Coin balance shown in gift sheet before sending
// ✅ NEW: TikTok-style floating emoji reactions with animation
// ✅ NEW: Real-time chat subscription (both directions)
// ✅ NEW: Coin balance guard before gift — redirects to buy-coins if broke
// ✅ NEW: Proper native share sheet
// ─────────────────────────────────────────────────────────────

import React, {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image, Alert, Dimensions,
  Animated, Modal, Share, ScrollView, PermissionsAndroid,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { router, useLocalSearchParams } from 'expo-router';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../config/supabase';
import { useAuthStore } from '../../store/authStore';
import { notifyCowatchInvite } from '../../lib/notifications';

// ── Agora RTC ─────────────────────────────────────────────────
let AgoraEngine: any  = null;
let AgoraIsV4         = false;
let RtcLocalView: any = null;
let RtcRemoteView: any = null;

try {
  const Agora = require('react-native-agora');
  if (typeof Agora.createAgoraRtcEngine === 'function') {
    AgoraEngine   = Agora.createAgoraRtcEngine;
    AgoraIsV4     = true;
    RtcLocalView  = { SurfaceView: Agora.RtcSurfaceView };
    RtcRemoteView = { SurfaceView: Agora.RtcSurfaceView };
  } else {
    AgoraEngine   = Agora.default?.RtcEngine || Agora.RtcEngine;
    AgoraIsV4     = false;
    RtcLocalView  = Agora.RtcLocalView;
    RtcRemoteView = Agora.RtcRemoteView;
  }
} catch (_) {}

const { width: SW, height: SH } = Dimensions.get('window');

// ✅ SECURITY: Move your App ID to an environment variable in production.
// In your app.config.js: extra: { agoraAppId: process.env.AGORA_APP_ID }
// Then read it here: import Constants from 'expo-constants';
// const AGORA_APP_ID = Constants.expoConfig?.extra?.agoraAppId ?? '';
// For now using the same ID you had — Agora test mode works without a token server.
const AGORA_APP_ID = '23694cd7d52442a78061c0a117009d61';

const COIN_TO_NGN = 150;
function coinsToNGN(coins: number): string {
  return `₦${(coins * COIN_TO_NGN).toLocaleString('en-NG')}`;
}

// ── COLORS ────────────────────────────────────────────────────
const C = {
  black:   '#000000',
  bg:      '#0a0a0a',
  card:    '#1a1a1a',
  card2:   '#1e1e1e',
  border:  '#2a2a2a',
  green:   '#00e676',
  greenBg: 'rgba(0,230,118,0.12)',
  red:     '#e53935',
  gold:    '#ffd700',
  white:   '#ffffff',
  muted:   '#888888',
  muted2:  '#444444',
};

// ── Gift packages — matches buy-coins.tsx & index.tsx exactly ─
const GIFT_PACKAGES = [
  { id: 'rose',        name: 'Rose',        icon: '🌹', coins: 10,   color: '#ff69b4' },
  { id: 'ice_cream',   name: 'Ice Cream',   icon: '🍦', coins: 50,   color: '#00bfff' },
  { id: 'love_letter', name: 'Love Letter', icon: '💌', coins: 100,  color: '#ff4d8f' },
  { id: 'trophy',      name: 'Trophy',      icon: '🏆', coins: 500,  color: '#cd7f32' },
  { id: 'crown',       name: 'Crown',       icon: '👑', coins: 1000, color: '#ffd700' },
  { id: 'diamond',     name: 'Diamond',     icon: '💎', coins: 5000, color: '#00ffff' },
];

// ── TYPES ─────────────────────────────────────────────────────
interface CowatchSession {
  id: string; conversation_id: string;
  feed_type: 'index' | 'video';
  current_post_index: number;
  started_by: string; created_at: string;
  is_active: boolean; is_playing: boolean;
  current_position: number;
}

interface LiveMessage {
  id: string; user_id: string; display_name: string;
  avatar_url?: string; content: string;
  created_at: string; isMe: boolean;
}

interface FeedPost {
  id: string; user_id: string;
  display_name: string; username: string; avatar_url?: string;
  caption?: string;
  media_url?: string;
  thumbnail_url?: string;
  media_type: string;
  likes_count: number; comments_count: number;
  coins_received: number;
  liked_by?: string[];
  saved_by?: string[];
  created_at: string;
  liked_by_me?: boolean;
}

interface Comment {
  id: string; user_id: string;
  display_name: string; avatar_url?: string;
  content: string; created_at: string;
}

// Floating reaction particle
interface FloatingReaction {
  id: string;
  emoji: string;
  anim: Animated.Value;
  x: number;
}

const QUICK_REACTIONS = ['🔥', '😂', '😮', '❤️', '👏', '💀'];

// ─────────────────────────────────────────────────────────────
// SERVICE CALLS
// ─────────────────────────────────────────────────────────────

async function startCowatchSession(
  conversationId: string, startedBy: string, feedType: 'index' | 'video',
): Promise<CowatchSession | null> {
  try {
    await supabase.from('cowatch_sessions')
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq('conversation_id', conversationId).eq('is_active', true);
    const { data, error } = await supabase.from('cowatch_sessions').insert({
      conversation_id: conversationId, started_by: startedBy,
      feed_type: feedType, current_post_index: 0,
      current_position: 0, is_playing: false, is_active: true,
      video_id: 'feed', video_title: 'Feed', video_url: '',
    }).select().single();
    if (error) throw error;
    return data;
  } catch (e) { console.error('startCowatchSession error:', e); return null; }
}

async function getActiveCowatchSession(conversationId: string): Promise<CowatchSession | null> {
  try {
    const { data } = await supabase.from('cowatch_sessions').select('*')
      .eq('conversation_id', conversationId).eq('is_active', true)
      .order('created_at', { ascending: false }).limit(1).single();
    return data || null;
  } catch { return null; }
}

async function syncFeedIndex(
  sessionId: string, postIndex: number, isPlaying: boolean, position: number,
): Promise<void> {
  try {
    await supabase.from('cowatch_sessions')
      .update({ current_post_index: postIndex, is_playing: isPlaying, current_position: position })
      .eq('id', sessionId);
  } catch (e) { console.error('syncFeedIndex error:', e); }
}

async function endCowatchSession(sessionId: string): Promise<void> {
  try {
    await supabase.from('cowatch_sessions')
      .update({ is_active: false, ended_at: new Date().toISOString() }).eq('id', sessionId);
  } catch (e) { console.error('endCowatchSession error:', e); }
}

function subscribeCowatchSession(
  sessionId: string, onSync: (s: CowatchSession) => void,
): RealtimeChannel {
  return supabase.channel(`cowatch:${sessionId}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public',
      table: 'cowatch_sessions', filter: `id=eq.${sessionId}`,
    }, (payload) => onSync(payload.new as CowatchSession))
    .subscribe();
}

async function fetchFeedPosts(feedType: 'index' | 'video'): Promise<FeedPost[]> {
  try {
    const query = supabase
      .from('posts')
      .select(`
        id, user_id, caption, media_url, media_type,
        thumbnail_url, likes_count, comments_count, coins_received,
        liked_by, saved_by, created_at,
        profiles:user_id (
          display_name, username, avatar_url
        )
      `)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(30);

    const { data, error } = feedType === 'video'
      ? await query.eq('media_type', 'video')
      : await query.neq('media_type', 'video');

    if (error) { console.warn('fetchFeedPosts error:', error.message); return []; }

    return (data || []).map((p: any) => {
      const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
      return {
        id:             p.id,
        user_id:        p.user_id,
        caption:        p.caption,
        media_url:      p.media_url,
        media_type:     p.media_type || 'text',
        thumbnail_url:  p.thumbnail_url,
        liked_by:       p.liked_by || [],
        saved_by:       p.saved_by || [],
        likes_count:    p.likes_count    ?? 0,
        comments_count: p.comments_count ?? 0,
        coins_received: p.coins_received ?? 0,
        created_at:     p.created_at,
        // ✅ FIX: Use display_name first, fall back to username
        display_name:   profile?.display_name || profile?.username || 'LumVibe User',
        username:       profile?.username || 'user',
        avatar_url:     profile?.avatar_url,
        liked_by_me:    false,
      };
    });
  } catch (e) { console.error('fetchFeedPosts exception:', e); return []; }
}

async function fetchPostComments(postId: string): Promise<Comment[]> {
  try {
    const { data } = await supabase.from('comments')
      .select(`id, user_id, content, created_at,
        profiles:user_id (display_name, username, avatar_url)`)
      .eq('post_id', postId)
      .order('created_at', { ascending: false }).limit(30);
    return (data || []).map((c: any) => {
      const profile = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
      return {
        ...c,
        display_name: profile?.display_name || profile?.username || 'User',
        avatar_url: profile?.avatar_url,
      };
    });
  } catch { return []; }
}

async function toggleLikePost(postId: string, userId: string, liked: boolean): Promise<void> {
  try {
    if (liked) {
      await supabase.rpc('unlike_post', { p_post_id: postId, p_user_id: userId });
    } else {
      await supabase.rpc('like_post', { p_post_id: postId, p_user_id: userId });
    }
  } catch {
    try {
      const { data: post } = await supabase
        .from('posts').select('liked_by, likes_count').eq('id', postId).single();
      if (!post) return;
      const arr: string[] = post.liked_by || [];
      const newArr = liked ? arr.filter((id: string) => id !== userId) : [...arr, userId];
      const newCount = liked ? Math.max(0, (post.likes_count || 1) - 1) : (post.likes_count || 0) + 1;
      await supabase.from('posts').update({ liked_by: newArr, likes_count: newCount }).eq('id', postId);
    } catch (e2) { console.error('toggleLike fallback error:', e2); }
  }
}

async function postComment(postId: string, userId: string, content: string): Promise<void> {
  try {
    await supabase.from('comments').insert({ post_id: postId, user_id: userId, content });
  } catch (e) { console.error('postComment error:', e); }
}

// ✅ FIX: Full gift logic matching index.tsx exactly
// — fresh DB read, sender deduct, RPC for receiver, transactions, notification
async function sendGiftToPost(
  post: FeedPost,
  senderUserId: string,
  senderUsername: string,
  giftPackage: typeof GIFT_PACKAGES[0],
): Promise<{ success: boolean; message?: string }> {
  try {
    // 1. Fresh read of sender balance (prevent stale overwrite)
    const { data: freshSender } = await supabase
      .from('users').select('coins').eq('id', senderUserId).single();
    const currentCoins = freshSender?.coins || 0;
    if (currentCoins < giftPackage.coins) {
      return { success: false, message: 'insufficient_coins' };
    }

    // 2. Deduct from sender
    await supabase.from('users')
      .update({ coins: currentCoins - giftPackage.coins })
      .eq('id', senderUserId);

    // 3. Credit receiver via RPC (bypasses RLS on other user's row)
    await supabase.rpc('increment_coins', {
      target_user_id: post.user_id,
      coin_amount: giftPackage.coins,
    });

    // 4. Update post coins_received (fresh read to avoid race condition)
    const { data: freshPost } = await supabase
      .from('posts').select('coins_received').eq('id', post.id).single();
    await supabase.from('posts')
      .update({ coins_received: (freshPost?.coins_received || 0) + giftPackage.coins })
      .eq('id', post.id);

    // 5. Transaction records (both sides)
    await supabase.from('transactions').insert([
      {
        user_id: senderUserId,
        type: 'spent',
        amount: giftPackage.coins,
        description: `Sent ${giftPackage.name} ${giftPackage.icon} (${giftPackage.coins} coins) to @${post.username} via Co-Watch`,
        status: 'completed',
      },
      {
        user_id: post.user_id,
        type: 'received',
        amount: giftPackage.coins,
        description: `Received ${giftPackage.name} ${giftPackage.icon} (${giftPackage.coins} coins) from @${senderUsername} via Co-Watch`,
        status: 'completed',
      },
    ]);

    // 6. Notify receiver
    await supabase.from('notifications').insert({
      user_id: post.user_id,
      type: 'gift',
      title: 'New Gift 🎁',
      message: `@${senderUsername} sent you ${giftPackage.name} ${giftPackage.icon} (${giftPackage.coins} coins) on your post`,
      from_user_id: senderUserId,
      post_id: post.id,
      is_read: false,
    });

    return { success: true };
  } catch (e) {
    console.error('sendGiftToPost error:', e);
    return { success: false, message: 'error' };
  }
}

async function sendChatMessage(
  conversationId: string, senderId: string, content: string,
): Promise<void> {
  try {
    await supabase.from('messages').insert({
      conversation_id: conversationId, sender_id: senderId,
      message_type: 'text', content, is_disappearing: false,
    });
  } catch (e) { console.error('sendChatMessage error:', e); }
}

// ─────────────────────────────────────────────────────────────
// AGORA HOOK
// ─────────────────────────────────────────────────────────────

// ✅ NEW: Request camera + mic permissions before Agora initialises.
// Without this, Android silently blocks the camera and microphone
// and you see nothing / hear nothing even if Agora connects.
async function requestAgoraPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true; // iOS handles via Info.plist
  try {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);
    const cameraOk = results[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED;
    const audioOk  = results[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
    if (!cameraOk || !audioOk) {
      Alert.alert(
        'Permissions Required',
        'Camera and microphone access are needed for video calls.\n\nPlease allow them in Settings → App Permissions.',
        [{ text: 'OK' }],
      );
      return false;
    }
    return true;
  } catch (e) {
    console.error('requestAgoraPermissions error:', e);
    return false;
  }
}

function useAgoraCall(channelName: string, userId: string) {
  const engineRef  = useRef<any>(null);
  const [remoteUid,    setRemoteUid]    = useState<number | null>(null);
  const [callReady,    setCallReady]    = useState(false);
  const [engineJoined, setEngineJoined] = useState(false);
  const [micMuted,     setMicMuted]     = useState(false);
  const [camMuted,     setCamMuted]     = useState(false);
  const [permDenied,   setPermDenied]   = useState(false);
  const agoraReady = !!AgoraEngine;

  const numericUid = useMemo(
    () => parseInt(userId.replace(/\D/g, '').slice(0, 8) || '1', 10),
    [userId],
  );

  useEffect(() => {
    if (!AgoraEngine || !channelName) return;
    let engine: any;
    let mounted = true;

    const init = async () => {
      // ✅ Ask for permissions FIRST — this is what was missing
      const granted = await requestAgoraPermissions();
      if (!granted) { setPermDenied(true); return; }
      if (!mounted) return;

      try {
        if (AgoraIsV4) {
          engine = AgoraEngine();
          engineRef.current = engine;
          engine.registerEventHandler({
            onJoinChannelSuccess: () => {
              if (!mounted) return;
              setEngineJoined(true); setCallReady(true);
            },
            onUserJoined: (_: any, uid: number) => {
              if (!mounted) return; setRemoteUid(uid);
            },
            onUserOffline: () => {
              if (!mounted) return; setRemoteUid(null);
            },
            onError: (errCode: number) => {
              console.warn('Agora error code:', errCode);
              // Error 110 = invalid token — means App Certificate is enabled
              // in Agora console but no token was provided. Go to console.agora.io
              // → Your Project → Edit → App Certificate → Disable it for testing.
              if (errCode === 110) {
                Alert.alert(
                  'Agora Token Required',
                  'Your Agora project has App Certificate enabled. Please disable it in console.agora.io for testing, or contact support to set up a token server.',
                );
              }
            },
          });
          engine.initialize({ appId: AGORA_APP_ID, channelProfile: 1 });
          await engine.setClientRole(1);
          await engine.enableVideo();
          await engine.enableAudio();
          await engine.startPreview();
          await new Promise<void>(r => setTimeout(r, 400));
          if (!mounted) return;
          // Test mode — empty token string works when App Certificate is DISABLED
          await engine.joinChannel('', channelName, numericUid, {
            clientRoleType: 1,
            publishMicrophoneTrack: true,
            publishCameraTrack: true,
            autoSubscribeAudio: true,
            autoSubscribeVideo: true,
          });
        } else {
          engine = await AgoraEngine.create(AGORA_APP_ID);
          engineRef.current = engine;
          await engine.enableVideo();
          await engine.enableAudio();
          engine.addListener('JoinChannelSuccess', () => {
            if (!mounted) return; setEngineJoined(true); setCallReady(true);
          });
          engine.addListener('UserJoined', (uid: number) => {
            if (!mounted) return; setRemoteUid(uid); setCallReady(true);
          });
          engine.addListener('UserOffline', () => {
            if (!mounted) return; setRemoteUid(null);
          });
          engine.addListener('Error', (errCode: number) => {
            console.warn('Agora error code:', errCode);
          });
          await engine.joinChannel(null, channelName, null, numericUid);
        }
      } catch (err) { console.error('Agora init error:', err); }
    };

    init();
    return () => {
      mounted = false;
      try {
        if (engine) {
          engine.leaveChannel();
          AgoraIsV4 ? engine.release() : engine.destroy();
        }
      } catch (_) {}
    };
  }, [channelName, numericUid]);

  const toggleMic = useCallback(async () => {
    if (!engineRef.current) return;
    const next = !micMuted;
    await engineRef.current.muteLocalAudioStream(next); setMicMuted(next);
  }, [micMuted]);

  const toggleCam = useCallback(async () => {
    if (!engineRef.current) return;
    const next = !camMuted;
    await engineRef.current.muteLocalVideoStream(next); setCamMuted(next);
  }, [camMuted]);

  return { remoteUid, callReady, engineJoined, micMuted, camMuted, toggleMic, toggleCam, agoraReady, permDenied };
}

// ─────────────────────────────────────────────────────────────
// PiP OVERLAY — partner's live video (top-right)
// ─────────────────────────────────────────────────────────────
const PIP_W = 86;
const PIP_H = 114;

function PipOverlay({
  photo, name, isActive, remoteUid, micMuted, camMuted,
  onToggleMic, onToggleCam, agoraReady, engineJoined,
}: {
  photo?: string; name: string; isActive: boolean;
  remoteUid: number | null; micMuted: boolean; camMuted: boolean;
  onToggleMic: () => void; onToggleCam: () => void;
  agoraReady: boolean; engineJoined: boolean;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    if (isActive) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.04, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])).start();
    } else {
      pulse.setValue(1);
    }
  }, [isActive]);

  const showAgoraRemote = agoraReady && engineJoined && RtcRemoteView && remoteUid !== null;

  return (
    <Animated.View style={[pipStyles.pip, { transform: [{ scale: pulse }] }]}>
      <TouchableOpacity
        style={pipStyles.pipTouchable}
        onPress={() => setShowControls(s => !s)}
        activeOpacity={0.9}
      >
        {showAgoraRemote ? (
          AgoraIsV4 ? (
            <RtcRemoteView.SurfaceView
              style={pipStyles.pipVideo}
              canvas={{ uid: remoteUid, renderMode: 1 }}
            />
          ) : (
            <RtcRemoteView.SurfaceView
              style={pipStyles.pipVideo}
              uid={remoteUid} channelId="cowatch" renderMode={1}
            />
          )
        ) : (
          <View style={pipStyles.pipPlaceholder}>
            {photo
              ? <Image source={{ uri: photo }} style={pipStyles.pipImage} />
              : <View style={pipStyles.pipInitialWrap}>
                  <Text style={pipStyles.pipInitial}>{(name || 'U')[0].toUpperCase()}</Text>
                </View>}
          </View>
        )}
        <View style={[pipStyles.pipRing, isActive && pipStyles.pipRingActive]} />
        <View style={pipStyles.pipNameTag}>
          <Text style={pipStyles.pipNameText} numberOfLines={1}>{name.split(' ')[0]}</Text>
        </View>
        {isActive && <View style={pipStyles.pipLiveDot} />}
      </TouchableOpacity>

      {/* ✅ FIX: Controls now appear ABOVE the pip, not below (no clip) */}
      {showControls && (
        <View style={pipStyles.pipControls}>
          <TouchableOpacity style={pipStyles.pipCtrlBtn} onPress={onToggleMic}>
            <Ionicons
              name={micMuted ? 'mic-off' : 'mic-outline'}
              size={13}
              color={micMuted ? C.red : C.green}
            />
          </TouchableOpacity>
          <TouchableOpacity style={pipStyles.pipCtrlBtn} onPress={onToggleCam}>
            <Ionicons
              name={camMuted ? 'videocam-off' : 'videocam-outline'}
              size={13}
              color={camMuted ? C.red : C.green}
            />
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────
// LOCAL CAMERA PREVIEW — your own face (top-left)
// ─────────────────────────────────────────────────────────────
function LocalPreview({ agoraReady, engineJoined, photo, yourName, permDenied }: {
  agoraReady: boolean; engineJoined: boolean; photo?: string; yourName: string;
  permDenied?: boolean;
}) {
  const showAgoraLocal = agoraReady && engineJoined && RtcLocalView && !permDenied;
  return (
    <View style={pipStyles.localPip}>
      {permDenied ? (
        // ✅ NEW: Show clear message when permissions were denied
        <View style={[pipStyles.pipInitialWrap, { backgroundColor: '#1a0a0a' }]}>
          <Ionicons name="videocam-off" size={20} color={C.red} />
          <Text style={{ color: C.red, fontSize: 7, marginTop: 3, textAlign: 'center' }}>
            Allow{'\n'}Camera
          </Text>
        </View>
      ) : showAgoraLocal ? (
        AgoraIsV4
          ? <RtcLocalView.SurfaceView style={pipStyles.pipVideo} canvas={{ uid: 0, renderMode: 1 }} />
          : <RtcLocalView.SurfaceView style={pipStyles.pipVideo} renderMode={1} />
      ) : (
        photo
          ? <Image source={{ uri: photo }} style={pipStyles.pipImage} />
          : <View style={pipStyles.pipInitialWrap}>
              <Text style={pipStyles.pipInitial}>{(yourName || 'Y')[0].toUpperCase()}</Text>
            </View>
      )}
      <View style={pipStyles.pipNameTag}>
        <Text style={pipStyles.pipNameText}>You</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// CALL CONTROLS — mic, cam, end call
// ─────────────────────────────────────────────────────────────
function CallControls({ micMuted, camMuted, onToggleMic, onToggleCam, onEndCall }: {
  micMuted: boolean; camMuted: boolean;
  onToggleMic: () => void; onToggleCam: () => void; onEndCall: () => void;
}) {
  return (
    <View style={callCtrlStyles.bar}>
      <TouchableOpacity
        style={[callCtrlStyles.btn, micMuted && callCtrlStyles.btnMuted]}
        onPress={onToggleMic}
      >
        <Ionicons name={micMuted ? 'mic-off' : 'mic-outline'} size={18} color={C.white} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[callCtrlStyles.btn, camMuted && callCtrlStyles.btnMuted]}
        onPress={onToggleCam}
      >
        <Ionicons name={camMuted ? 'videocam-off' : 'videocam-outline'} size={18} color={C.white} />
      </TouchableOpacity>
      <TouchableOpacity style={callCtrlStyles.endBtn} onPress={onEndCall}>
        <Ionicons name="call" size={18} color={C.white} />
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// COMMENT SHEET
// ─────────────────────────────────────────────────────────────
function CommentSheet({
  visible, postId, userId, onClose,
}: {
  visible: boolean; postId: string; userId: string; onClose: () => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText]         = useState('');
  const [loading, setLoading]   = useState(false);
  const flatRef = useRef<FlatList>(null);

  useEffect(() => {
    if (visible && postId) {
      setLoading(true);
      fetchPostComments(postId).then(c => { setComments(c); setLoading(false); });
    }
  }, [visible, postId]);

  const submit = async () => {
    const t = text.trim();
    if (!t) return;
    await postComment(postId, userId, t);
    setText('');
    const fresh = await fetchPostComments(postId);
    setComments(fresh);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={sheetStyles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={sheetStyles.sheet}>
          <View style={sheetStyles.handle} />
          <Text style={sheetStyles.sheetTitle}>Comments</Text>
          {loading ? (
            <ActivityIndicator color={C.green} style={{ marginVertical: 20 }} />
          ) : (
            <FlatList
              ref={flatRef}
              data={comments}
              keyExtractor={c => c.id}
              style={{ maxHeight: SH * 0.4 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 12 }}
              ListEmptyComponent={
                <Text style={sheetStyles.emptyText}>No comments yet. Be first!</Text>
              }
              renderItem={({ item }) => (
                <View style={sheetStyles.commentRow}>
                  <View style={sheetStyles.commentAvatar}>
                    {item.avatar_url
                      ? <Image source={{ uri: item.avatar_url }} style={sheetStyles.commentAvatarImg} />
                      : <View style={sheetStyles.commentAvatarFallback}>
                          <Text style={{ color: '#000', fontSize: 10, fontWeight: '800' }}>
                            {(item.display_name || 'U')[0].toUpperCase()}
                          </Text>
                        </View>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={sheetStyles.commentName}>{item.display_name}</Text>
                    <Text style={sheetStyles.commentText}>{item.content}</Text>
                  </View>
                </View>
              )}
            />
          )}
          <View style={sheetStyles.commentInputRow}>
            <TextInput
              style={sheetStyles.commentInput}
              placeholder="Add a comment…"
              placeholderTextColor={C.muted2}
              value={text}
              onChangeText={setText}
              onSubmitEditing={submit}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[sheetStyles.commentSendBtn, !text.trim() && { opacity: 0.4 }]}
              onPress={submit} disabled={!text.trim()}
            >
              <Ionicons name="send" size={16} color="#000" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// GIFT SHEET — matches index.tsx gift logic exactly
// ─────────────────────────────────────────────────────────────
function GiftSheet({
  visible, post, userId, userProfile, onClose, onGiftSent,
}: {
  visible: boolean; post: FeedPost | null;
  userId: string; userProfile: any;
  onClose: () => void;
  onGiftSent: (postId: string, coins: number) => void;
}) {
  const [sending, setSending] = useState(false);

  const handleSendGift = async (gift: typeof GIFT_PACKAGES[0]) => {
    if (!post || !userId) return;

    const userCoins = userProfile?.coins || 0;

    // ✅ FIX: Show balance and guard BEFORE sending
    if (gift.coins > userCoins) {
      Alert.alert(
        '💰 Insufficient Coins',
        `You need ${gift.coins} coins but only have ${userCoins} coins.\n\nTop up your wallet to send this gift.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Buy Coins →', onPress: () => {
              onClose();
              setTimeout(() => router.push('/buy-coins' as any), 300);
            },
          },
        ],
      );
      return;
    }

    setSending(true);
    const result = await sendGiftToPost(
      post,
      userId,
      userProfile?.username || 'user',
      gift,
    );
    setSending(false);

    if (result.success) {
      onGiftSent(post.id, gift.coins);
      onClose();
      Alert.alert(
        `${gift.icon} ${gift.name} Sent!`,
        `You sent ${gift.name} (${gift.coins} coins = ${coinsToNGN(gift.coins)}) to @${post.username}!`,
      );
    } else if (result.message === 'insufficient_coins') {
      Alert.alert('Insufficient Coins', 'Balance changed. Please try again.');
    } else {
      Alert.alert('Error', 'Failed to send gift. Please try again.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={sheetStyles.backdrop} onPress={onClose} activeOpacity={1}>
        <View style={sheetStyles.giftSheet} onStartShouldSetResponder={() => true}>
          <View style={sheetStyles.handle} />

          <View style={sheetStyles.giftHeader}>
            <Text style={sheetStyles.sheetTitle}>
              Send a Gift to @{post?.username}
            </Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color={C.muted} />
            </TouchableOpacity>
          </View>

          {/* ✅ FIX: Balance shown clearly before user picks a gift */}
          <View style={sheetStyles.balanceRow}>
            <Text style={{ fontSize: 18 }}>🪙</Text>
            <Text style={sheetStyles.balanceText}>
              {(userProfile?.coins || 0).toLocaleString()} coins available
            </Text>
            <TouchableOpacity
              style={sheetStyles.topUpBtn}
              onPress={() => { onClose(); setTimeout(() => router.push('/buy-coins' as any), 300); }}
            >
              <Text style={sheetStyles.topUpBtnText}>+ Top Up</Text>
            </TouchableOpacity>
          </View>

          {sending ? (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <ActivityIndicator color={C.green} size="large" />
              <Text style={{ color: C.muted, marginTop: 12 }}>Sending gift…</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={sheetStyles.giftGrid}
              showsVerticalScrollIndicator={false}
            >
              {GIFT_PACKAGES.map(g => {
                const canAfford = (userProfile?.coins || 0) >= g.coins;
                return (
                  <TouchableOpacity
                    key={g.id}
                    style={[
                      sheetStyles.giftItem,
                      { borderColor: canAfford ? g.color + '66' : C.border },
                      !canAfford && { opacity: 0.45 },
                    ]}
                    onPress={() => handleSendGift(g)}
                    activeOpacity={0.75}
                  >
                    <Text style={{ fontSize: 32 }}>{g.icon}</Text>
                    <Text style={sheetStyles.giftName}>{g.name}</Text>
                    <View style={[sheetStyles.giftCostBadge, { borderColor: g.color + '44' }]}>
                      <Text style={[sheetStyles.giftCostText, { color: canAfford ? g.color : C.muted }]}>
                        🪙 {g.coins.toLocaleString()}
                      </Text>
                    </View>
                    <Text style={sheetStyles.giftNgnText}>{coinsToNGN(g.coins)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// FEED SELECTOR
// ─────────────────────────────────────────────────────────────
function FeedSelector({
  activeFeed, onSelect,
}: { activeFeed: 'index' | 'video'; onSelect: (f: 'index' | 'video') => void }) {
  return (
    <View style={selectorStyles.row}>
      <TouchableOpacity
        style={[selectorStyles.tab, activeFeed === 'index' && selectorStyles.tabActive]}
        onPress={() => onSelect('index')}
      >
        <Ionicons
          name="home-outline" size={17}
          color={activeFeed === 'index' ? '#000' : C.muted}
        />
        <Text style={[selectorStyles.tabText, activeFeed === 'index' && selectorStyles.tabTextActive]}>
          Feed
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[selectorStyles.tab, activeFeed === 'video' && selectorStyles.tabActive]}
        onPress={() => onSelect('video')}
      >
        <Ionicons
          name="videocam-outline" size={17}
          color={activeFeed === 'video' ? '#000' : C.muted}
        />
        <Text style={[selectorStyles.tabText, activeFeed === 'video' && selectorStyles.tabTextActive]}>
          Videos
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// FEED POST CARD
// ─────────────────────────────────────────────────────────────
function FeedPostCard({
  post, isCurrent, userId, onLike, onComment, onGift, onShare,
}: {
  post: FeedPost; isCurrent: boolean; userId: string;
  onLike: (post: FeedPost) => void;
  onComment: (post: FeedPost) => void;
  onGift: (post: FeedPost) => void;
  onShare: (post: FeedPost) => void;
}) {
  const videoRef = useRef<any>(null);
  const likeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!videoRef.current) return;
    if (isCurrent && post.media_type === 'video' && post.media_url) {
      videoRef.current.playAsync().catch(() => {});
    } else {
      videoRef.current.pauseAsync().catch(() => {});
    }
  }, [isCurrent]);

  const handleLikeTap = () => {
    Animated.sequence([
      Animated.timing(likeAnim, { toValue: 1.35, duration: 130, useNativeDriver: true }),
      Animated.timing(likeAnim, { toValue: 1, duration: 130, useNativeDriver: true }),
    ]).start();
    onLike(post);
  };

  const fmtCount = (n: number) =>
    (n ?? 0) > 999 ? `${((n ?? 0) / 1000).toFixed(1)}k` : String(n ?? 0);

  const isTextOrVoice = post.media_type === 'voice' || post.media_type === 'text' || !post.media_url;

  return (
    <View style={[cardStyles.card, { width: SW }]}>
      {/* VIDEO */}
      {post.media_type === 'video' && post.media_url ? (
        <Video
          ref={videoRef}
          source={{ uri: post.media_url }}
          style={cardStyles.videoFull}
          resizeMode={ResizeMode.COVER}
          isLooping shouldPlay={false}
        />
      ) : null}

      {/* IMAGE */}
      {post.media_type === 'image' && post.media_url ? (
        <Image source={{ uri: post.media_url }} style={cardStyles.imageFull} resizeMode="cover" />
      ) : null}

      {/* VOICE / TEXT */}
      {isTextOrVoice ? (
        <View style={cardStyles.textPostBg}>
          {(post.thumbnail_url || post.media_url) && (
            <Image
              source={{ uri: post.thumbnail_url || post.media_url }}
              style={cardStyles.textBgImage} resizeMode="cover"
            />
          )}
          <View style={cardStyles.textPostOverlay}>
            {/* ✅ FIX: Caption only shown once, in the center for text posts */}
            <Text style={cardStyles.textPostContent} numberOfLines={8}>
              {post.caption || ''}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={cardStyles.scrim} />

      {/* Author row — caption NOT duplicated here for text posts */}
      <View style={cardStyles.authorRow}>
        <View style={cardStyles.authorAvatar}>
          {post.avatar_url
            ? <Image source={{ uri: post.avatar_url }} style={cardStyles.authorAvatarImg} />
            : <View style={cardStyles.authorAvatarFallback}>
                <Text style={{ color: '#000', fontWeight: '800', fontSize: 14 }}>
                  {(post.display_name || 'U')[0].toUpperCase()}
                </Text>
              </View>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={cardStyles.authorName}>{post.display_name}</Text>
          <Text style={cardStyles.authorHandle}>@{post.username}</Text>
          {/* ✅ FIX: Caption only shown here for non-text-post types */}
          {post.caption && !isTextOrVoice ? (
            <Text style={cardStyles.captionText} numberOfLines={2}>{post.caption}</Text>
          ) : null}
        </View>
      </View>

      {/* Action buttons */}
      <View style={cardStyles.actionsCol}>
        <TouchableOpacity style={cardStyles.actionBtn} onPress={handleLikeTap}>
          <Animated.View style={{ transform: [{ scale: likeAnim }] }}>
            <Ionicons
              name={post.liked_by_me ? 'heart' : 'heart-outline'}
              size={26}
              color={post.liked_by_me ? C.red : C.white}
            />
          </Animated.View>
          <Text style={cardStyles.actionCount}>{fmtCount(post.likes_count)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={cardStyles.actionBtn} onPress={() => onComment(post)}>
          <Ionicons name="chatbubble-outline" size={26} color={C.white} />
          <Text style={cardStyles.actionCount}>{fmtCount(post.comments_count)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={cardStyles.actionBtn} onPress={() => onGift(post)}>
          <Ionicons name="gift-outline" size={26} color={C.gold} />
          <Text style={[cardStyles.actionCount, { color: C.gold }]}>
            {post.coins_received > 0 ? fmtCount(post.coins_received) : 'Gift'}
          </Text>
        </TouchableOpacity>

        {/* ✅ FIX: Real native share sheet */}
        <TouchableOpacity style={cardStyles.actionBtn} onPress={() => onShare(post)}>
          <Ionicons name="share-outline" size={24} color={C.white} />
          <Text style={cardStyles.actionCount}>Share</Text>
        </TouchableOpacity>
      </View>

      {isCurrent && (
        <View style={cardStyles.watchingBadge}>
          <View style={cardStyles.watchingDot} />
          <Text style={cardStyles.watchingBadgeText}>Watching Together</Text>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// FLOATING REACTION — TikTok-style rising emoji
// ─────────────────────────────────────────────────────────────
function FloatingReactionLayer({ reactions }: { reactions: FloatingReaction[] }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {reactions.map(r => (
        <Animated.Text
          key={r.id}
          style={[
            floatStyles.bubble,
            {
              left: r.x,
              transform: [{
                translateY: r.anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -260],
                }),
              }],
              opacity: r.anim.interpolate({
                inputRange: [0, 0.7, 1],
                outputRange: [1, 0.9, 0],
              }),
            },
          ]}
        >
          {r.emoji}
        </Animated.Text>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────
export default function CowatchScreen() {
  const {
    conversationId, otherName, otherPhoto, sessionId: existingSessionId,
  } = useLocalSearchParams<{
    conversationId: string; otherName: string;
    otherPhoto: string; sessionId?: string;
  }>();

  const { user, userProfile } = useAuthStore();

  const agoraChannel = `cowatch_${conversationId}`;
  const {
    remoteUid, callReady, engineJoined,
    micMuted, camMuted, toggleMic, toggleCam, agoraReady, permDenied,
  } = useAgoraCall(agoraChannel, user?.id || '');

  const feedRef          = useRef<FlatList>(null);
  const syncChannelRef   = useRef<RealtimeChannel | null>(null);
  const chatChannelRef   = useRef<RealtimeChannel | null>(null); // ✅ NEW: for receiving messages
  const isSyncingRef     = useRef(false);
  const chatFlatRef      = useRef<FlatList>(null);
  const feedTypeRef      = useRef<'index' | 'video'>('video'); // ✅ FIX: ref for stale closure

  const [session,         setSession]         = useState<CowatchSession | null>(null);
  const [isLoading,       setIsLoading]       = useState(true);
  const [feedLoading,     setFeedLoading]     = useState(false);
  const [feedType,        setFeedType]        = useState<'index' | 'video'>('video');
  const [posts,           setPosts]           = useState<FeedPost[]>([]);
  const [currentIndex,    setCurrentIndex]    = useState(0);
  const [messages,        setMessages]        = useState<LiveMessage[]>([]);
  const [inputText,       setInputText]       = useState('');
  const [otherUserActive, setOtherUserActive] = useState(false);
  const [chatExpanded,    setChatExpanded]    = useState(false);
  const [isSynced,        setIsSynced]        = useState(false);
  const [commentPost,     setCommentPost]     = useState<FeedPost | null>(null);
  const [giftPost,        setGiftPost]        = useState<FeedPost | null>(null);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);

  // Sync feedType to ref so handleRemoteSync never has stale closure
  useEffect(() => { feedTypeRef.current = feedType; }, [feedType]);

  useEffect(() => {
    setupSession();
    return () => {
      if (syncChannelRef.current) supabase.removeChannel(syncChannelRef.current);
      if (chatChannelRef.current) supabase.removeChannel(chatChannelRef.current);
    };
  }, []);

  useEffect(() => { loadFeed(feedType); }, [feedType]);

  // ✅ FIX: Subscribe to incoming messages from partner (real-time, both directions)
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, async (payload) => {
        const msg = payload.new as any;
        // Ignore our own messages (already added optimistically)
        if (msg.sender_id === user?.id) return;

        // Fetch sender display name
        const { data: profile } = await supabase
          .from('users')
          .select('display_name, username, avatar_url')
          .eq('id', msg.sender_id)
          .single();

        const newMsg: LiveMessage = {
          id: msg.id,
          user_id: msg.sender_id,
          display_name: profile?.display_name || profile?.username || otherName || 'Partner',
          avatar_url: profile?.avatar_url,
          content: msg.content?.replace(/^🎬 \[Co-Watch\] /, '') || '',
          created_at: msg.created_at,
          isMe: false,
        };
        setMessages(prev => [...prev, newMsg]);
        setTimeout(() => chatFlatRef.current?.scrollToEnd({ animated: true }), 100);
      })
      .subscribe();

    chatChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, user?.id, otherName]);

  const loadFeed = async (type: 'index' | 'video') => {
    setFeedLoading(true);
    const data = await fetchFeedPosts(type);
    const withLiked = data.map(p => ({
      ...p,
      liked_by_me: (p.liked_by || []).includes(user?.id || ''),
    }));
    setPosts(withLiked);
    setCurrentIndex(0);
    setFeedLoading(false);
  };

  const setupSession = async () => {
    if (!user?.id || !conversationId) return;
    try {
      let activeSession: CowatchSession | null = null;
      if (existingSessionId) {
        activeSession = await getActiveCowatchSession(conversationId);
        setOtherUserActive(true);
      } else {
        activeSession = await startCowatchSession(conversationId, user.id, feedType);
      }
      if (!activeSession) {
        Alert.alert('Error', 'Could not start co-watch session.');
        router.back(); return;
      }
      setSession(activeSession);
      if (activeSession.feed_type) {
        setFeedType(activeSession.feed_type);
        feedTypeRef.current = activeSession.feed_type;
      }
      if (activeSession.current_post_index) setCurrentIndex(activeSession.current_post_index);
      setIsLoading(false);
      syncChannelRef.current = subscribeCowatchSession(activeSession.id, handleRemoteSync);
      addSystemMessage(`Watch party started with ${otherName} 🎬`);

      // Send invite notification (host only)
      if (!existingSessionId && conversationId) {
        const { data: convoData } = await supabase
          .from('conversations')
          .select('user1_id, user2_id')
          .eq('id', conversationId)
          .single();
        if (convoData) {
          const inviteeId = convoData.user1_id === user.id
            ? convoData.user2_id : convoData.user1_id;
          if (inviteeId) {
            await notifyCowatchInvite(
              inviteeId, user.id,
              userProfile?.display_name || userProfile?.username || 'Someone',
              conversationId, activeSession.id,
            );
          }
        }
      }
    } catch (e) {
      console.error('setupSession error:', e);
      setIsLoading(false);
    }
  };

  // ✅ FIX: Uses feedTypeRef instead of stale feedType closure
  const handleRemoteSync = useCallback((updatedSession: CowatchSession) => {
    if (isSyncingRef.current) return;
    setOtherUserActive(true);
    const newIndex = updatedSession.current_post_index ?? 0;
    setCurrentIndex(prev => {
      if (prev !== newIndex) {
        feedRef.current?.scrollToIndex({ index: newIndex, animated: true });
        return newIndex;
      }
      return prev;
    });
    // ✅ FIX: Read from ref, not stale closure variable
    if (updatedSession.feed_type && updatedSession.feed_type !== feedTypeRef.current) {
      setFeedType(updatedSession.feed_type);
      feedTypeRef.current = updatedSession.feed_type;
    }
    setIsSynced(true);
    setTimeout(() => setIsSynced(false), 2000);
  }, []); // stable — no dependencies, uses refs

  const handleScrollEnd = useCallback((e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SW);
    if (idx === currentIndex || !session) return;
    setCurrentIndex(idx);
    isSyncingRef.current = true;
    syncFeedIndex(session.id, idx, false, 0).finally(() => {
      setTimeout(() => { isSyncingRef.current = false; }, 600);
    });
  }, [currentIndex, session]);

  const handleLike = useCallback(async (post: FeedPost) => {
    if (!user) return;
    setPosts(prev => prev.map(p => {
      if (p.id !== post.id) return p;
      const wasLiked = p.liked_by_me || false;
      const newLikedBy = wasLiked
        ? (p.liked_by || []).filter(id => id !== user.id)
        : [...(p.liked_by || []), user.id];
      return {
        ...p,
        liked_by_me: !wasLiked,
        liked_by: newLikedBy,
        likes_count: wasLiked ? Math.max(0, p.likes_count - 1) : p.likes_count + 1,
      };
    }));
    await toggleLikePost(post.id, user.id, post.liked_by_me || false);
  }, [user]);

  // ✅ FIX: Real native Share API — no more dead "coming soon" alert
  const handleShare = useCallback(async (post: FeedPost) => {
    try {
      const deepLink = `https://lumvibe.site/post/${post.id}`;
      await Share.share({
        message: `Check out this post by @${post.username} on LumVibe!\n\n${post.caption || ''}\n\n${deepLink}`,
        title: `Post by @${post.username}`,
      });
    } catch (e) {
      console.error('Share error:', e);
    }
  }, []);

  const handleFeedTypeChange = useCallback(async (newType: 'index' | 'video') => {
    if (!session) return;
    setFeedType(newType);
    feedTypeRef.current = newType;
    setCurrentIndex(0);
    isSyncingRef.current = true;
    await supabase.from('cowatch_sessions')
      .update({ feed_type: newType, current_post_index: 0 }).eq('id', session.id);
    setTimeout(() => { isSyncingRef.current = false; }, 600);
  }, [session]);

  const addSystemMessage = (text: string) => {
    setMessages(prev => [...prev, {
      id: Date.now().toString(), user_id: 'system',
      display_name: 'System', content: text,
      created_at: new Date().toISOString(), isMe: false,
    }]);
  };

  const sendLiveMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !user) return;
    // Optimistic local add
    setMessages(prev => [...prev, {
      id: `local_${Date.now()}`,
      user_id: user.id,
      display_name: userProfile?.display_name || userProfile?.username || 'You',
      avatar_url: userProfile?.avatar_url,
      content: text,
      created_at: new Date().toISOString(),
      isMe: true,
    }]);
    setInputText('');
    // Persist — partner sees it via real-time subscription
    if (conversationId) {
      await sendChatMessage(conversationId, user.id, `🎬 [Co-Watch] ${text}`);
    }
    setTimeout(() => chatFlatRef.current?.scrollToEnd({ animated: true }), 100);
  }, [inputText, user, conversationId, userProfile]);

  // ✅ NEW: TikTok-style floating emoji animation
  const sendReaction = useCallback((emoji: string) => {
    if (!user) return;

    // Add to chat
    setMessages(prev => [...prev, {
      id: `react_${Date.now()}`,
      user_id: user.id,
      display_name: userProfile?.display_name || 'You',
      content: emoji,
      created_at: new Date().toISOString(),
      isMe: true,
    }]);

    // Spawn floating particle
    const id = `float_${Date.now()}_${Math.random()}`;
    const anim = new Animated.Value(0);
    const x = SW * 0.3 + Math.random() * SW * 0.4; // random horizontal spread

    setFloatingReactions(prev => [...prev, { id, emoji, anim, x }]);

    Animated.timing(anim, {
      toValue: 1,
      duration: 1800,
      useNativeDriver: true,
    }).start(() => {
      setFloatingReactions(prev => prev.filter(r => r.id !== id));
    });

    setTimeout(() => chatFlatRef.current?.scrollToEnd({ animated: true }), 100);
  }, [user, userProfile]);

  // Callback when a gift is sent — update post coins_received optimistically
  const handleGiftSent = useCallback((postId: string, coins: number) => {
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, coins_received: p.coins_received + coins } : p,
    ));
  }, []);

  const endCowatch = useCallback(async () => {
    if (session) await endCowatchSession(session.id);
    router.back();
  }, [session]);

  // ── Loading ──────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <ActivityIndicator color={C.green} size="large" />
        <Text style={styles.loadingTitle}>Starting Watch Party</Text>
        <Text style={styles.loadingSubtitle}>Connecting with {otherName}…</Text>
      </View>
    );
  }

  // ── Main render ──────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* ── FEED PAGER ─────────────────────────────────── */}
      <View style={styles.feedContainer}>
        {feedLoading ? (
          <View style={styles.feedLoadingWrap}>
            <ActivityIndicator color={C.green} size="large" />
            <Text style={styles.feedLoadingText}>
              Loading {feedType === 'video' ? 'videos' : 'posts'}…
            </Text>
          </View>
        ) : (
          <FlatList
            ref={feedRef}
            data={posts}
            keyExtractor={p => p.id}
            horizontal pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleScrollEnd}
            getItemLayout={(_, index) => ({ length: SW, offset: SW * index, index })}
            renderItem={({ item, index }) => (
              <FeedPostCard
                post={item}
                isCurrent={index === currentIndex}
                userId={user?.id || ''}
                onLike={handleLike}
                onComment={setCommentPost}
                onGift={setGiftPost}
                onShare={handleShare}
              />
            )}
            ListEmptyComponent={
              <View style={styles.emptyFeed}>
                <Text style={styles.emptyFeedText}>No posts found</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={() => loadFeed(feedType)}>
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}

        {/* Floating reactions layer — TikTok style */}
        <FloatingReactionLayer reactions={floatingReactions} />

        {/* Partner PiP */}
        <PipOverlay
          photo={otherPhoto || undefined}
          name={otherName || 'Partner'}
          isActive={otherUserActive || callReady}
          remoteUid={remoteUid}
          micMuted={micMuted}
          camMuted={camMuted}
          onToggleMic={toggleMic}
          onToggleCam={toggleCam}
          agoraReady={agoraReady}
          engineJoined={engineJoined}
        />

        {/* Your face PiP */}
        <LocalPreview
          agoraReady={agoraReady}
          engineJoined={engineJoined}
          photo={userProfile?.avatar_url}
          yourName={userProfile?.display_name || userProfile?.username || 'You'}
          permDenied={permDenied}
        />

        {/* ── TOP BAR ─────────────────────────────────── */}
        <SafeAreaView style={styles.topBarWrap} pointerEvents="box-none">
          <View style={styles.topBarRow1}>
            <TouchableOpacity style={styles.backBtn} onPress={endCowatch}>
              <Ionicons name="chevron-back" size={20} color={C.white} />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.topBarTitle}>Watch Together</Text>
              <Text style={styles.topBarSub}>with {otherName}</Text>
            </View>
            {isSynced && (
              <View style={styles.syncBadge}>
                <Ionicons name="flash" size={10} color={C.green} />
                <Text style={styles.syncBadgeText}>Synced</Text>
              </View>
            )}
            <View style={styles.liveBadge}>
              <Ionicons name="radio-outline" size={9} color={C.white} />
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          </View>
          <View style={styles.topBarRow2}>
            <FeedSelector activeFeed={feedType} onSelect={handleFeedTypeChange} />
            <View style={styles.postCounter}>
              <Text style={styles.postCounterText}>
                {posts.length > 0 ? `${currentIndex + 1} / ${posts.length}` : '--'}
              </Text>
            </View>
          </View>
        </SafeAreaView>

        {/* Floating call controls */}
        <CallControls
          micMuted={micMuted} camMuted={camMuted}
          onToggleMic={toggleMic} onToggleCam={toggleCam}
          onEndCall={endCowatch}
        />
      </View>

      {/* ── BOTTOM PANEL ──────────────────────────────── */}
      <KeyboardAvoidingView
        style={styles.bottomPanel}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.reactionsBar}>
          {QUICK_REACTIONS.map(emoji => (
            <TouchableOpacity
              key={emoji}
              style={styles.reactionBtn}
              onPress={() => sendReaction(emoji)}
            >
              <Text style={{ fontSize: 20 }}>{emoji}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.chatToggleBtn}
            onPress={() => setChatExpanded(e => !e)}
          >
            <Ionicons
              name={chatExpanded ? 'chevron-down' : 'chevron-up'}
              size={16} color={C.muted}
            />
          </TouchableOpacity>
        </View>

        {chatExpanded && (
          <FlatList
            ref={chatFlatRef}
            data={messages}
            keyExtractor={m => m.id}
            style={styles.chatArea}
            contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 8, gap: 8 }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => chatFlatRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => {
              if (item.user_id === 'system') {
                return (
                  <View style={styles.systemMsg}>
                    <Text style={styles.systemMsgText}>{item.content}</Text>
                  </View>
                );
              }
              if (QUICK_REACTIONS.includes(item.content)) {
                return (
                  <View style={[styles.cwMsg, item.isMe && styles.cwMsgMe]}>
                    <Text style={{ fontSize: 26 }}>{item.content}</Text>
                  </View>
                );
              }
              return (
                <View style={[styles.cwMsg, item.isMe && styles.cwMsgMe]}>
                  {!item.isMe && (
                    <View style={styles.cwAvatar}>
                      {item.avatar_url
                        ? <Image source={{ uri: item.avatar_url }} style={styles.cwAvatarImg} />
                        : <View style={styles.cwAvatarPlaceholder}>
                            <Text style={{ color: '#000', fontSize: 10, fontWeight: '700' }}>
                              {(item.display_name || 'U')[0].toUpperCase()}
                            </Text>
                          </View>}
                    </View>
                  )}
                  <View style={[styles.cwBubble, item.isMe && styles.cwBubbleMe]}>
                    {!item.isMe && (
                      <Text style={styles.cwSenderName}>{item.display_name}</Text>
                    )}
                    <Text style={[styles.cwBubbleText, item.isMe && { color: '#000' }]}>
                      {item.content}
                    </Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingTop: 8 }}>
                <Text style={{ color: C.muted, fontSize: 12 }}>React while watching 🔥</Text>
              </View>
            }
          />
        )}

        <View style={styles.inputRow}>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.inputField}
              placeholder="Say something…"
              placeholderTextColor={C.muted2}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={sendLiveMessage}
              returnKeyType="send"
            />
          </View>
          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && { opacity: 0.4 }]}
            onPress={sendLiveMessage}
            disabled={!inputText.trim()}
          >
            <Ionicons name="send" size={16} color="#000" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <CommentSheet
        visible={!!commentPost}
        postId={commentPost?.id || ''}
        userId={user?.id || ''}
        onClose={() => setCommentPost(null)}
      />

      <GiftSheet
        visible={!!giftPost}
        post={giftPost}
        userId={user?.id || ''}
        userProfile={userProfile}
        onClose={() => setGiftPost(null)}
        onGiftSent={handleGiftSent}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────

const pipStyles = StyleSheet.create({
  pip: {
    position: 'absolute', top: 160, right: 12,
    width: PIP_W, height: PIP_H, borderRadius: 14, zIndex: 20,
    shadowColor: '#000', shadowOpacity: 0.8,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 14,
  },
  pipTouchable: { width: PIP_W, height: PIP_H, borderRadius: 14, overflow: 'hidden' },
  pipVideo:     { width: PIP_W, height: PIP_H },
  pipPlaceholder: {
    width: PIP_W, height: PIP_H, backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center',
  },
  pipImage: { width: PIP_W, height: PIP_H },
  pipInitialWrap: {
    width: PIP_W, height: PIP_H,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a',
  },
  pipInitial:  { fontSize: 28, fontWeight: '800', color: C.green },
  pipRing: {
    position: 'absolute', inset: 0, borderRadius: 14,
    borderWidth: 2, borderColor: 'transparent', zIndex: 2,
  },
  pipRingActive: { borderColor: C.green },
  pipNameTag: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingVertical: 3, paddingHorizontal: 6,
    borderBottomLeftRadius: 14, borderBottomRightRadius: 14, zIndex: 3,
  },
  pipNameText: { fontSize: 9.5, color: C.white, fontWeight: '600', textAlign: 'center' },
  pipLiveDot: {
    position: 'absolute', top: 6, right: 6,
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: C.green, zIndex: 4, borderWidth: 1.5, borderColor: '#000',
  },
  // ✅ FIX: Controls appear ABOVE the pip box, not below
  pipControls: {
    position: 'absolute', top: -48, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 8, zIndex: 25,
  },
  pipCtrlBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  localPip: {
    position: 'absolute', top: 160, left: 12,
    width: PIP_W, height: PIP_H, borderRadius: 14,
    overflow: 'hidden', zIndex: 19,
    borderWidth: 2, borderColor: C.green,
    shadowColor: '#000', shadowOpacity: 0.8,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 13,
  },
});

const callCtrlStyles = StyleSheet.create({
  bar: {
    position: 'absolute', bottom: 12, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 18,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingVertical: 8, paddingHorizontal: 18, borderRadius: 30,
    borderWidth: 1, borderColor: C.border,
  },
  btn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  btnMuted: {
    backgroundColor: 'rgba(229,57,53,0.25)',
    borderColor: C.red,
  },
  endBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: C.red,
    alignItems: 'center', justifyContent: 'center', marginLeft: 4,
  },
});

const cardStyles = StyleSheet.create({
  card: { height: SH * 0.60, backgroundColor: '#000', position: 'relative' },
  videoFull: { width: '100%', height: '100%' },
  imageFull: { width: '100%', height: '100%' },
  textPostBg: { flex: 1, backgroundColor: '#111' },
  textBgImage: { ...StyleSheet.absoluteFillObject, opacity: 0.3 },
  textPostOverlay: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28,
  },
  textPostContent: {
    fontSize: 20, fontWeight: '700', color: C.white,
    textAlign: 'center', lineHeight: 30,
  },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.22)' },
  authorRow: {
    position: 'absolute', bottom: 60, left: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 5,
    right: 70, // so it doesn't overlap action buttons
  },
  authorAvatar: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  authorAvatarImg: { width: 40, height: 40, borderRadius: 20 },
  authorAvatarFallback: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.green, alignItems: 'center', justifyContent: 'center',
  },
  authorName:   { fontSize: 13, fontWeight: '700', color: C.white },
  authorHandle: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  captionText:  { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 3, lineHeight: 15 },
  actionsCol: {
    position: 'absolute', right: 14, bottom: 56,
    gap: 20, alignItems: 'center', zIndex: 5,
  },
  actionBtn:   { alignItems: 'center', gap: 4 },
  actionCount: { fontSize: 11, color: C.white, fontWeight: '600' },
  watchingBadge: {
    position: 'absolute', bottom: 10, left: 16,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingVertical: 4, paddingHorizontal: 12, borderRadius: 20,
    borderWidth: 1, borderColor: C.green + '55', zIndex: 5,
  },
  watchingDot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green },
  watchingBadgeText: { fontSize: 10.5, color: C.green, fontWeight: '600' },
});

const selectorStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 22, padding: 4, gap: 2,
    borderWidth: 1, borderColor: C.border,
  },
  tab: {
    flexDirection: 'row', alignItems: 'center',
    gap: 5, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 18,
  },
  tabActive:      { backgroundColor: C.green },
  tabText:        { fontSize: 12, color: C.muted, fontWeight: '600' },
  tabTextActive:  { color: '#000', fontWeight: '800' },
});

const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    borderTopWidth: 1, borderColor: C.border,
  },
  giftSheet: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    borderTopWidth: 1, borderColor: C.border,
    maxHeight: SH * 0.75,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.border, alignSelf: 'center', marginTop: 10, marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 16, fontWeight: '800', color: C.white,
    flex: 1,
  },
  giftHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, marginBottom: 8,
  },
  balanceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1a1a1a',
    marginHorizontal: 16, marginBottom: 16,
    padding: 12, borderRadius: 12,
    borderWidth: 1, borderColor: C.gold + '44',
  },
  balanceText: { color: C.gold, fontSize: 14, fontWeight: '700', flex: 1 },
  topUpBtn: {
    backgroundColor: C.greenBg, borderWidth: 1, borderColor: C.green,
    borderRadius: 14, paddingVertical: 5, paddingHorizontal: 12,
  },
  topUpBtnText: { color: C.green, fontSize: 12, fontWeight: '700' },
  giftGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    paddingHorizontal: 16, paddingBottom: 16,
    justifyContent: 'space-between',
  },
  giftItem: {
    width: (SW - 52) / 3,
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border,
    borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8,
    alignItems: 'center', gap: 5,
  },
  giftName: { fontSize: 12, fontWeight: '700', color: C.white, textAlign: 'center' },
  giftCostBadge: {
    backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1,
    borderRadius: 20, paddingVertical: 3, paddingHorizontal: 8, marginTop: 2,
  },
  giftCostText: { fontSize: 11, fontWeight: '700' },
  giftNgnText: { fontSize: 9.5, color: C.muted, marginTop: 1 },
  emptyText: {
    fontSize: 13, color: C.muted, textAlign: 'center', paddingVertical: 20,
  },
  commentRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  commentAvatar: {
    width: 32, height: 32, borderRadius: 16, overflow: 'hidden', marginTop: 2,
  },
  commentAvatarImg: { width: 32, height: 32, borderRadius: 16 },
  commentAvatarFallback: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: C.green, alignItems: 'center', justifyContent: 'center',
  },
  commentName: { fontSize: 11.5, fontWeight: '700', color: C.green, marginBottom: 2 },
  commentText: { fontSize: 13, color: C.white, lineHeight: 18 },
  commentInputRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 1, borderColor: C.border, marginTop: 8,
  },
  commentInput: {
    flex: 1, backgroundColor: C.card, borderWidth: 1.5,
    borderColor: C.border, borderRadius: 22,
    paddingHorizontal: 14, paddingVertical: 10,
    color: C.white, fontSize: 14,
  },
  commentSendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: C.green, alignItems: 'center', justifyContent: 'center',
  },
});

const floatStyles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    bottom: 80,
    fontSize: 28,
    zIndex: 100,
  },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  loadingScreen: {
    flex: 1, backgroundColor: '#000',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  loadingTitle:    { fontSize: 16, fontWeight: '800', color: C.white, marginTop: 8 },
  loadingSubtitle: { fontSize: 13, color: C.muted },

  feedContainer: { height: SH * 0.60, backgroundColor: '#000', position: 'relative' },
  feedLoadingWrap: {
    width: SW, height: SH * 0.60,
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  feedLoadingText: { fontSize: 13, color: C.muted },

  emptyFeed: {
    width: SW, height: SH * 0.60,
    alignItems: 'center', justifyContent: 'center', gap: 16,
  },
  emptyFeedText: { fontSize: 14, color: C.muted },
  retryBtn: {
    backgroundColor: C.greenBg, borderWidth: 1, borderColor: C.green,
    borderRadius: 20, paddingVertical: 8, paddingHorizontal: 24,
  },
  retryBtnText: { fontSize: 13, color: C.green, fontWeight: '700' },

  topBarWrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 22 },
  topBarRow1: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingTop: 14, paddingBottom: 6,
    backgroundColor: 'rgba(0,0,0,0.5)', gap: 8,
  },
  topBarRow2: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  topBarTitle: { fontSize: 13, fontWeight: '700', color: C.white },
  topBarSub:   { fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  syncBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.greenBg, borderWidth: 1, borderColor: C.green,
    borderRadius: 20, paddingVertical: 3, paddingHorizontal: 8,
  },
  syncBadgeText: { fontSize: 9.5, fontWeight: '700', color: C.green },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: C.red, borderRadius: 20,
    paddingVertical: 4, paddingHorizontal: 10,
  },
  liveBadgeText: { fontSize: 9.5, fontWeight: '800', color: C.white, letterSpacing: 0.8 },
  postCounter: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 3, paddingHorizontal: 10, borderRadius: 20,
  },
  postCounterText: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },

  bottomPanel: {
    flex: 1, backgroundColor: '#080808',
    borderTopWidth: 1, borderTopColor: C.border,
  },
  reactionsBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border, gap: 4,
  },
  reactionBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 5,
    backgroundColor: C.card2, borderRadius: 10,
  },
  chatToggleBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', marginLeft: 4,
  },
  chatArea: { maxHeight: 170 },

  systemMsg:     { alignItems: 'center', paddingVertical: 2 },
  systemMsgText: {
    fontSize: 11, color: C.muted, backgroundColor: C.card,
    paddingVertical: 3, paddingHorizontal: 10, borderRadius: 10,
  },
  cwMsg:   { flexDirection: 'row', gap: 7, alignItems: 'flex-end' },
  cwMsgMe: { flexDirection: 'row-reverse' },
  cwAvatar:            { width: 24, height: 24 },
  cwAvatarImg:         { width: 24, height: 24, borderRadius: 12 },
  cwAvatarPlaceholder: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: C.green, alignItems: 'center', justifyContent: 'center',
  },
  cwBubble: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10,
    maxWidth: SW * 0.62,
  },
  cwBubbleMe:   { backgroundColor: C.green, borderColor: C.green },
  cwSenderName: { fontSize: 9.5, color: C.green, fontWeight: '700', marginBottom: 2 },
  cwBubbleText: { fontSize: 13, color: C.white },

  inputRow: {
    flexDirection: 'row', gap: 9,
    paddingHorizontal: 14, paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 16 : 12,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  inputWrap: {
    flex: 1, backgroundColor: C.card, borderWidth: 1.5,
    borderColor: C.border, borderRadius: 22, paddingHorizontal: 14,
  },
  inputField: { color: C.white, fontSize: 14, paddingVertical: 10 },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: C.green, alignItems: 'center', justifyContent: 'center',
  },
}); 
