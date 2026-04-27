// app/chat/cowatch.tsx
// ─────────────────────────────────────────────────────────────
// LumVibe — Co-Watch Screen (Full Production Build)
//
// ✅ ORIGINAL FIXES (from previous version):
//   Agora App ID from env, scrollToIndex bounds-checked, UUID 9-digit uid,
//   full-screen feed, SafeAreaView root, pointerEvents in style, flex chat,
//   send button loading state, bottom panel overlay, CallControls left-side,
//   unified Avatar, real-time chat, stale closure fix, PiP controls above pip,
//   native Share API, gift system with RPC, floating emoji reactions,
//   coin balance in gift sheet, display_name resolved
//
// ✅ NEW FIXES (this version):
//   [FEED]     Pull-to-refresh with RefreshControl on feed FlatList
//   [FEED]     useFocusEffect refreshes coin balance when returning to screen
//   [FEED]     Real-time posts subscription — live like/coin updates from partner
//   [FEED]     onViewableItemsChanged → view count tracking + owner points
//   [FEED]     memo() on FeedPostCard — no re-render on chat/reaction state changes
//   [FEED]     Card height is explicit SH (not '100%') — bulletproof on all devices
//   [FEED]     Pagination: load more posts on reaching end of list
//   [FEED]     LumVibe watermark overlay on posts (matches main feeds)
//   [VIDEO]    Tap-to-pause/play on video cards
//   [VIDEO]    Progress bar shown during video playback
//   [GIFT]     Local currency shown alongside ₦ (timezone-detected, matches index.tsx)
//   [GIFT]     Custom gift amount option (min 10, max 5000 coins)
//   [GIFT]     Points awarded to post owner on gift
//   [COMMENTS] Reply-to-comment support
//   [ADS]      Native ad injection every 8 posts (LumVibe-branded, matches index.tsx)
//   [ADS]      Hidden BannerAd for AdMob revenue inside native ad card
//   [POINTS]   getOwnerBadgeMultipliers — badge-aware point awards on view/like/comment
//   [BRAND]    File header updated from Kinsta → LumVibe throughout
// ─────────────────────────────────────────────────────────────

import React, {
  useState, useEffect, useRef, useCallback, useMemo, memo,
} from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image, Alert, Dimensions,
  Animated, Modal, Share, ScrollView, PermissionsAndroid,
  RefreshControl,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { supabase } from '../../config/supabase';
import { useAuthStore } from '../../store/authStore';
import { notifyCowatchInvite } from '../../lib/notifications';

// ── Agora RTC ─────────────────────────────────────────────────
let AgoraEngine: any   = null;
let AgoraIsV4          = false;
let RtcLocalView: any  = null;
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

// ─────────────────────────────────────────────────────────────
// AGORA APP ID — READ FROM ENV
// ─────────────────────────────────────────────────────────────
// HOW TO SET UP (one-time):
//
//  1. In your .env file (project root):
//       AGORA_APP_ID=your_actual_agora_app_id_here
//
//  2. In app.config.js → extra section:
//       extra: {
//         agoraAppId: process.env.AGORA_APP_ID,
//         // ... other keys
//       }
//
//  3. Rebuild the app (expo prebuild / eas build).
//     The DEV warning below will disappear and Agora calls will work.
//
// NOTE: The warning you see in DEV ("AGORA_APP_ID is not set") simply means
// the key hasn't been wired through app.config.js → extra yet.
// Video/audio calls will NOT connect until the real App ID is present.
// Agora never connects on an empty string — it silently refuses.
// Once the real ID is in .env + app.config.js, video calls will work.
// ─────────────────────────────────────────────────────────────
const AGORA_APP_ID: string =
  (Constants.expoConfig?.extra as any)?.agoraAppId ?? '';

if (__DEV__ && !AGORA_APP_ID) {
  console.warn(
    '[LumVibe] AGORA_APP_ID is not set.\n' +
    'Steps:\n' +
    '  1. Add AGORA_APP_ID=your_id to .env\n' +
    '  2. Add agoraAppId: process.env.AGORA_APP_ID to app.config.js → extra\n' +
    '  3. Rebuild with expo prebuild\n' +
    'Video calls will not connect until this is done.',
  );
}

// ── AdMob ─────────────────────────────────────────────────────
const BANNER_AD_UNIT_ID = __DEV__
  ? TestIds.BANNER
  : 'ca-app-pub-8235065812461074/4176727692';

const COIN_TO_NGN = 150;
function coinsToNGN(coins: number): string {
  return `₦${(coins * COIN_TO_NGN).toLocaleString('en-NG')}`;
}

// ── Local Currency Detection (matches index.tsx) ───────────────
const CURRENCY_BY_TIMEZONE: Record<string, { code: string; symbol: string; rateFromNgn: number; decimals: number }> = {
  'Africa/Lagos':        { code: 'NGN', symbol: '₦',   rateFromNgn: 1,        decimals: 0 },
  'Africa/Abuja':        { code: 'NGN', symbol: '₦',   rateFromNgn: 1,        decimals: 0 },
  'Africa/Accra':        { code: 'GHS', symbol: 'GH₵', rateFromNgn: 0.0067,   decimals: 2 },
  'Africa/Nairobi':      { code: 'KES', symbol: 'KSh', rateFromNgn: 0.087,    decimals: 0 },
  'Africa/Johannesburg': { code: 'ZAR', symbol: 'R',   rateFromNgn: 0.012,    decimals: 2 },
  'Africa/Cairo':        { code: 'EGP', symbol: 'E£',  rateFromNgn: 0.033,    decimals: 2 },
  'Europe/London':       { code: 'GBP', symbol: '£',   rateFromNgn: 0.000533, decimals: 2 },
  'Europe/Paris':        { code: 'EUR', symbol: '€',   rateFromNgn: 0.000617, decimals: 2 },
  'America/New_York':    { code: 'USD', symbol: '$',   rateFromNgn: 0.000667, decimals: 2 },
  'America/Los_Angeles': { code: 'USD', symbol: '$',   rateFromNgn: 0.000667, decimals: 2 },
  'America/Toronto':     { code: 'CAD', symbol: 'CA$', rateFromNgn: 0.000917, decimals: 2 },
  'Asia/Dubai':          { code: 'AED', symbol: 'د.إ', rateFromNgn: 0.00245,  decimals: 2 },
  'Asia/Kolkata':        { code: 'INR', symbol: '₹',   rateFromNgn: 0.0557,   decimals: 0 },
  'Asia/Tokyo':          { code: 'JPY', symbol: '¥',   rateFromNgn: 0.10,     decimals: 0 },
  'Asia/Singapore':      { code: 'SGD', symbol: 'S$',  rateFromNgn: 0.000894, decimals: 2 },
  'Australia/Sydney':    { code: 'AUD', symbol: 'A$',  rateFromNgn: 0.001033, decimals: 2 },
};
const DEFAULT_GIFT_CURRENCY = { code: 'USD', symbol: '$', rateFromNgn: 0.000667, decimals: 2 };

function detectGiftCurrency() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (CURRENCY_BY_TIMEZONE[tz]) return CURRENCY_BY_TIMEZONE[tz];
    const continent = tz.split('/')[0];
    const match = Object.entries(CURRENCY_BY_TIMEZONE).find(([k]) => k.startsWith(continent));
    if (match) return match[1];
  } catch {}
  return DEFAULT_GIFT_CURRENCY;
}

function giftLocalPrice(ngnAmount: number): string {
  const cur = detectGiftCurrency();
  const local = ngnAmount * cur.rateFromNgn;
  if (cur.decimals === 0) return `${cur.symbol}${Math.round(local).toLocaleString()}`;
  return `${cur.symbol}${local.toLocaleString(undefined, {
    minimumFractionDigits: cur.decimals,
    maximumFractionDigits: cur.decimals,
  })}`;
}

// ── Points ─────────────────────────────────────────────────────
const POINTS_PER_VIEW    = 2;
const POINTS_PER_LIKE    = 10;
const POINTS_PER_COMMENT = 15;

async function getOwnerBadgeMultipliers(ownerId: string) {
  try {
    const { data } = await supabase.from('user_badges').select('badge_id').eq('user_id', ownerId);
    const badges = new Set(data?.map((b: any) => b.badge_id) || []);
    return {
      viewPoints:    badges.has('early_adopter') ? 4  : POINTS_PER_VIEW,
      likePoints:    badges.has('followers_100') ? 15 : POINTS_PER_LIKE,
      commentPoints: badges.has('streak_30')     ? 20 : POINTS_PER_COMMENT,
    };
  } catch {
    return { viewPoints: POINTS_PER_VIEW, likePoints: POINTS_PER_LIKE, commentPoints: POINTS_PER_COMMENT };
  }
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
  overlay: 'rgba(0,0,0,0.55)',
};

// ── Gift packages ─────────────────────────────────────────────
const GIFT_PACKAGES = [
  { id: 'rose',        name: 'Rose',        icon: '🌹', coins: 10,   ngn: 1_500,   color: '#ff69b4' },
  { id: 'ice_cream',   name: 'Ice Cream',   icon: '🍦', coins: 50,   ngn: 7_500,   color: '#00bfff' },
  { id: 'love_letter', name: 'Love Letter', icon: '💌', coins: 100,  ngn: 15_000,  color: '#ff4d8f' },
  { id: 'trophy',      name: 'Trophy',      icon: '🏆', coins: 500,  ngn: 75_000,  color: '#cd7f32' },
  { id: 'crown',       name: 'Crown',       icon: '👑', coins: 1000, ngn: 150_000, color: '#ffd700' },
  { id: 'diamond',     name: 'Diamond',     icon: '💎', coins: 5000, ngn: 750_000, color: '#00ffff' },
];

// ── Native Ad Slots (LumVibe branded) ─────────────────────────
const NATIVE_AD_SLOTS = [
  {
    advertiser:  'LumVibe Premium',
    caption:     '🚀 Go Premium — zero ads, exclusive creator badges, and priority support. Upgrade now!',
    gradient:    ['#001a0d', '#0d1a0d', '#001a0d'] as const,
    accentColor: C.green,
    ctaLabel:    'Get Premium',
    ctaRoute:    '/buy-coins',
    bgEmoji:     '💎',
    tagline:     'Unlock the full LumVibe experience',
  },
  {
    advertiser:  'LumVibe Coins',
    caption:     '🪙 Top up your wallet and show your favourite creators some love with gifts!',
    gradient:    ['#1a1200', '#1a1000', '#1a1200'] as const,
    accentColor: C.gold,
    ctaLabel:    'Buy Coins',
    ctaRoute:    '/buy-coins',
    bgEmoji:     '🪙',
    tagline:     'Support creators with real value',
  },
  {
    advertiser:  'LumVibe Creator Fund',
    caption:     '🎬 Turn your creativity into income. Start posting on LumVibe and earn today!',
    gradient:    ['#0d001a', '#160d1a', '#0d001a'] as const,
    accentColor: '#a855f7',
    ctaLabel:    'Start Creating',
    ctaRoute:    '/(tabs)/create',
    bgEmoji:     '🎬',
    tagline:     'Creators earn real money here',
  },
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
  views_count: number;
  liked_by?: string[];
  saved_by?: string[];
  created_at: string;
  liked_by_me?: boolean;
}

interface AdItem { id: string; isAd: true; adIndex: number; }
type FeedItem = FeedPost | AdItem;
function isAd(item: FeedItem): item is AdItem { return 'isAd' in item && (item as AdItem).isAd === true; }

interface Comment {
  id: string; user_id: string;
  display_name: string; avatar_url?: string;
  content: string; created_at: string;
  parent_comment_id?: string | null;
  likes_count?: number;
  liked_by?: string[];
}

interface FloatingReaction {
  id: string; emoji: string; anim: Animated.Value; x: number;
}

const QUICK_REACTIONS = ['🔥', '😂', '😮', '❤️', '👏', '💀'];

// ─────────────────────────────────────────────────────────────
// AVATAR — unified
// ─────────────────────────────────────────────────────────────
function Avatar({ uri, name, size, borderColor }: {
  uri?: string; name: string; size: number; borderColor?: string;
}) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, overflow: 'hidden',
      borderWidth: borderColor ? 2 : 0, borderColor: borderColor || 'transparent',
    }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} />
      ) : (
        <View style={{ width: size, height: size, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#000', fontWeight: '800', fontSize: size * 0.38 }}>
            {(name || 'U')[0].toUpperCase()}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// NATIVE AD CARD (LumVibe branded, matches index.tsx pattern)
// ─────────────────────────────────────────────────────────────
const NativeAdCard = memo(function NativeAdCard({ adIndex }: { adIndex: number }) {
  const slot = NATIVE_AD_SLOTS[adIndex % NATIVE_AD_SLOTS.length];
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.05, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View style={[adStyles.card, { width: SW, height: SH }]}>
      <LinearGradient
        colors={slot.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Big faded background emoji */}
      <Animated.Text style={[adStyles.bgEmoji, { transform: [{ scale: pulse }] }]}>
        {slot.bgEmoji}
      </Animated.Text>

      {/* Sponsored pill top-right */}
      <View style={adStyles.sponsoredPill}>
        <MaterialCommunityIcons name="shield-check" size={11} color={slot.accentColor} />
        <Text style={[adStyles.sponsoredText, { color: slot.accentColor }]}>Sponsored</Text>
      </View>

      {/* Center content */}
      <View style={adStyles.center}>
        <Text style={[adStyles.tagline, { color: slot.accentColor }]}>{slot.tagline}</Text>
        <Text style={adStyles.caption}>{slot.caption}</Text>
        <TouchableOpacity
          style={[adStyles.cta, { backgroundColor: slot.accentColor }]}
          onPress={() => router.push(slot.ctaRoute as any)}
          activeOpacity={0.85}
        >
          <Text style={adStyles.ctaText}>{slot.ctaLabel}</Text>
        </TouchableOpacity>
      </View>

      {/* LumVibe watermark */}
      <View style={adStyles.watermark}>
        <MaterialCommunityIcons name="shield-check" size={13} color={slot.accentColor} />
        <Text style={[adStyles.watermarkText, { color: slot.accentColor }]}>LumVibe</Text>
      </View>

      {/* Hidden BannerAd for AdMob revenue */}
      <View style={{ position: 'absolute', bottom: -100, opacity: 0 }}>
        <BannerAd unitId={BANNER_AD_UNIT_ID} size={BannerAdSize.BANNER} />
      </View>
    </View>
  );
});

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
  } catch (e) { console.error('startCowatchSession:', e); return null; }
}

async function getActiveCowatchSession(conversationId: string): Promise<CowatchSession | null> {
  try {
    const { data } = await supabase.from('cowatch_sessions').select('*')
      .eq('conversation_id', conversationId).eq('is_active', true)
      .order('created_at', { ascending: false }).limit(1).single();
    return data || null;
  } catch { return null; }
}

async function syncFeedIndex(sessionId: string, postIndex: number, isPlaying: boolean, position: number) {
  try {
    await supabase.from('cowatch_sessions')
      .update({ current_post_index: postIndex, is_playing: isPlaying, current_position: position })
      .eq('id', sessionId);
  } catch (e) { console.error('syncFeedIndex:', e); }
}

async function endCowatchSession(sessionId: string) {
  try {
    await supabase.from('cowatch_sessions')
      .update({ is_active: false, ended_at: new Date().toISOString() }).eq('id', sessionId);
  } catch (e) { console.error('endCowatchSession:', e); }
}

function subscribeCowatchSession(sessionId: string, onSync: (s: CowatchSession) => void): RealtimeChannel {
  return supabase.channel(`cowatch:${sessionId}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public',
      table: 'cowatch_sessions', filter: `id=eq.${sessionId}`,
    }, (payload) => onSync(payload.new as CowatchSession))
    .subscribe();
}

async function fetchFeedPosts(feedType: 'index' | 'video', page = 0): Promise<FeedPost[]> {
  try {
    const PAGE_SIZE = 30;
    const query = supabase
      .from('posts')
      .select(`
        id, user_id, caption, media_url, media_type,
        thumbnail_url, likes_count, comments_count, coins_received,
        views_count, liked_by, saved_by, created_at,
        users:user_id ( display_name, username, avatar_url )
      `)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    const { data, error } = feedType === 'video'
      ? await query.eq('media_type', 'video')
      : await query.neq('media_type', 'video');

    if (error) { console.warn('fetchFeedPosts error:', error.message); return []; }
    return (data || []).map((p: any) => {
      const profile = Array.isArray(p.users) ? p.users[0] : p.users;
      return {
        id: p.id, user_id: p.user_id,
        caption: p.caption, media_url: p.media_url,
        media_type: p.media_type || 'text',
        thumbnail_url: p.thumbnail_url,
        liked_by: p.liked_by || [], saved_by: p.saved_by || [],
        likes_count: p.likes_count ?? 0,
        comments_count: p.comments_count ?? 0,
        coins_received: p.coins_received ?? 0,
        views_count: p.views_count ?? 0,
        created_at: p.created_at,
        display_name: profile?.display_name || profile?.username || 'LumVibe User',
        username: profile?.username || 'user',
        avatar_url: profile?.avatar_url,
        liked_by_me: false,
      };
    });
  } catch (e) { console.error('fetchFeedPosts exception:', e); return []; }
}

async function fetchPostComments(postId: string): Promise<Comment[]> {
  try {
    const { data } = await supabase.from('comments')
      .select(`id, user_id, text, created_at, parent_comment_id,
        likes_count, liked_by,
        users:user_id ( display_name, username, avatar_url )`)
      .eq('post_id', postId)
      .order('created_at', { ascending: true }).limit(50);
    return (data || []).map((c: any) => {
      const profile = Array.isArray(c.users) ? c.users[0] : c.users;
      return {
        id: c.id,
        user_id: c.user_id,
        content: c.text || '',   // ← your column is 'text'
        created_at: c.created_at,
        parent_comment_id: c.parent_comment_id || null,
        likes_count: c.likes_count || 0,
        liked_by: c.liked_by || [],
        display_name: profile?.display_name || profile?.username || 'User',
        avatar_url: profile?.avatar_url,
      };
    });
  } catch (e) { console.error('fetchPostComments:', e); return []; }
}

async function toggleLikePost(postId: string, userId: string, liked: boolean) {
  try {
    // Fetch fresh data first to avoid stale count
    const { data: post } = await supabase
      .from('posts')
      .select('liked_by, likes_count')
      .eq('id', postId)
      .single();
    if (!post) return;

    const arr: string[] = post.liked_by || [];
    const alreadyLiked  = arr.includes(userId);

    // Prevent double-like or double-unlike
    if (liked && !alreadyLiked) return; // already unliked on server
    if (!liked && alreadyLiked) return; // already liked on server — shouldn't unlike

    const newArr   = liked
      ? arr.filter((id: string) => id !== userId)   // unlike: remove user
      : [...arr, userId];                            // like: add user
    const newCount = liked
      ? Math.max(0, (post.likes_count || 1) - 1)
      : (post.likes_count || 0) + 1;

    await supabase
      .from('posts')
      .update({ liked_by: newArr, likes_count: newCount })
      .eq('id', postId);
  } catch (e) { console.error('toggleLikePost error:', e); }
}

async function postComment(postId: string, userId: string, content: string, parentCommentId?: string | null) {
  try {
    const { error } = await supabase.from('comments').insert({
      post_id: postId,
      user_id: userId,
      text: content,            // ← your column is 'text'
      ...(parentCommentId ? { parent_comment_id: parentCommentId } : {}),
    });
    if (error) throw error;

    // Increment comments_count on post
    const { data: postRow } = await supabase
      .from('posts').select('comments_count, user_id').eq('id', postId).single();
    if (postRow) {
      await supabase.from('posts')
        .update({ comments_count: (postRow.comments_count || 0) + 1 })
        .eq('id', postId);
      // Award points to post owner
      if (postRow.user_id && postRow.user_id !== userId) {
        const multipliers = await getOwnerBadgeMultipliers(postRow.user_id);
        const { data: ownerData } = await supabase
          .from('users').select('points').eq('id', postRow.user_id).single();
        if (ownerData) {
          await supabase.from('users')
            .update({ points: (ownerData.points || 0) + multipliers.commentPoints })
            .eq('id', postRow.user_id);
        }
      }
    }
  } catch (e) { console.error('postComment error:', e); }
}

async function trackView(postId: string, userId: string) {
  try {
    // Atomic RPC preferred; fallback to direct update
    const rpcResult = await supabase.rpc('increment_views', { p_post_id: postId });
    if (rpcResult.error) {
      await supabase.from('posts')
        .update({ views_count: supabase.rpc('increment_views', { p_post_id: postId }) as any })
        .eq('id', postId);
    }
    // Award points to post owner
    const { data: postData } = await supabase.from('posts').select('user_id').eq('id', postId).single();
    if (postData?.user_id && postData.user_id !== userId) {
      const multipliers = await getOwnerBadgeMultipliers(postData.user_id);
      const { data: ownerData } = await supabase.from('users').select('points').eq('id', postData.user_id).single();
      if (ownerData) {
        await supabase.from('users')
          .update({ points: (ownerData.points || 0) + multipliers.viewPoints })
          .eq('id', postData.user_id);
      }
    }
  } catch (_) {}
}

async function sendGiftToPost(
  post: FeedPost, senderUserId: string, senderUsername: string,
  giftPackage: typeof GIFT_PACKAGES[0],
): Promise<{ success: boolean; message?: string }> {
  try {
    const { data: freshSender } = await supabase.from('users').select('coins').eq('id', senderUserId).single();
    if ((freshSender?.coins || 0) < giftPackage.coins) return { success: false, message: 'insufficient_coins' };

    await supabase.from('users').update({ coins: (freshSender?.coins || 0) - giftPackage.coins }).eq('id', senderUserId);
    await supabase.rpc('increment_coins', { target_user_id: post.user_id, coin_amount: giftPackage.coins });

    const { data: freshPost } = await supabase.from('posts').select('coins_received').eq('id', post.id).single();
    await supabase.from('posts')
      .update({ coins_received: (freshPost?.coins_received || 0) + giftPackage.coins })
      .eq('id', post.id);

    await supabase.from('transactions').insert([
      { user_id: senderUserId, type: 'spent', amount: giftPackage.coins, description: `Sent ${giftPackage.name} ${giftPackage.icon} (${giftPackage.coins} coins) to @${post.username} via Co-Watch`, status: 'completed' },
      { user_id: post.user_id, type: 'received', amount: giftPackage.coins, description: `Received ${giftPackage.name} ${giftPackage.icon} (${giftPackage.coins} coins) from @${senderUsername} via Co-Watch`, status: 'completed' },
    ]);
    await supabase.from('notifications').insert({
      user_id: post.user_id, type: 'gift', title: 'New Gift 🎁',
      message: `@${senderUsername} sent you ${giftPackage.name} ${giftPackage.icon} (${giftPackage.coins} coins) on your post`,
      from_user_id: senderUserId, post_id: post.id, is_read: false,
    });

    // Award gift-sender points to post owner
    const multipliers = await getOwnerBadgeMultipliers(post.user_id);
    const { data: ownerData } = await supabase.from('users').select('points').eq('id', post.user_id).single();
    if (ownerData) {
      await supabase.from('users')
        .update({ points: (ownerData.points || 0) + Math.min(giftPackage.coins * 2, 500) })
        .eq('id', post.user_id);
    }

    return { success: true };
  } catch (e) { console.error('sendGiftToPost error:', e); return { success: false, message: 'error' }; }
}

async function sendCustomGift(
  post: FeedPost, senderUserId: string, senderUsername: string, coins: number,
): Promise<{ success: boolean; message?: string }> {
  try {
    const { data: freshSender } = await supabase.from('users').select('coins').eq('id', senderUserId).single();
    if ((freshSender?.coins || 0) < coins) return { success: false, message: 'insufficient_coins' };

    await supabase.from('users').update({ coins: (freshSender?.coins || 0) - coins }).eq('id', senderUserId);
    await supabase.rpc('increment_coins', { target_user_id: post.user_id, coin_amount: coins });

    const { data: freshPost } = await supabase.from('posts').select('coins_received').eq('id', post.id).single();
    await supabase.from('posts').update({ coins_received: (freshPost?.coins_received || 0) + coins }).eq('id', post.id);

    await supabase.from('transactions').insert([
      { user_id: senderUserId, type: 'spent', amount: coins, description: `Custom gift (${coins} coins = ${coinsToNGN(coins)}) to @${post.username} via Co-Watch`, status: 'completed' },
      { user_id: post.user_id, type: 'received', amount: coins, description: `Custom gift (${coins} coins = ${coinsToNGN(coins)}) from @${senderUsername} via Co-Watch`, status: 'completed' },
    ]);
    await supabase.from('notifications').insert({
      user_id: post.user_id, type: 'gift', title: 'New Gift 🎁',
      message: `@${senderUsername} sent you a custom gift (${coins} coins) on your post`,
      from_user_id: senderUserId, post_id: post.id, is_read: false,
    });
    return { success: true };
  } catch (e) { return { success: false, message: 'error' }; }
}

async function sendChatMessage(conversationId: string, senderId: string, content: string) {
  try {
    await supabase.from('messages').insert({
      conversation_id: conversationId, sender_id: senderId,
      message_type: 'text', content, is_disappearing: false,
    });
  } catch (e) { console.error('sendChatMessage:', e); }
}

// ─────────────────────────────────────────────────────────────
// AGORA PERMISSIONS
// ─────────────────────────────────────────────────────────────
async function requestAgoraPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);
    const ok = results[PermissionsAndroid.PERMISSIONS.CAMERA]      === PermissionsAndroid.RESULTS.GRANTED
            && results[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
    if (!ok) Alert.alert('Permissions Required', 'Camera and microphone access are needed for video calls.\n\nPlease allow them in Settings → App Permissions.');
    return ok;
  } catch (e) { console.error('requestAgoraPermissions:', e); return false; }
}

// ─────────────────────────────────────────────────────────────
// AGORA HOOK
// ─────────────────────────────────────────────────────────────
function useAgoraCall(channelName: string, userId: string) {
  const engineRef   = useRef<any>(null);
  const [remoteUid,    setRemoteUid]    = useState<number | null>(null);
  const [callReady,    setCallReady]    = useState(false);
  const [engineJoined, setEngineJoined] = useState(false);
  const [micMuted,     setMicMuted]     = useState(false);
  const [camMuted,     setCamMuted]     = useState(false);
  const [speakerOn,    setSpeakerOn]    = useState(true);
  const [permDenied,   setPermDenied]   = useState(false);
  const agoraReady = !!AgoraEngine;

  const numericUid = useMemo(() => {
    const digits = userId.replace(/\D/g, '').slice(0, 9);
    return parseInt(digits || '1', 10);
  }, [userId]);

  useEffect(() => {
    if (!AgoraEngine || !channelName) return;
    let engine: any; let mounted = true;
    const init = async () => {
      const granted = await requestAgoraPermissions();
      if (!granted) { setPermDenied(true); return; }
      if (!mounted) return;
      try {
        if (AgoraIsV4) {
          engine = AgoraEngine(); engineRef.current = engine;
          engine.registerEventHandler({
            onJoinChannelSuccess: () => { if (!mounted) return; setEngineJoined(true); setCallReady(true); },
            onUserJoined: (_: any, uid: number) => { if (!mounted) return; setRemoteUid(uid); },
            onUserOffline: () => { if (!mounted) return; setRemoteUid(null); },
            onError: (errCode: number) => {
              console.warn('Agora error code:', errCode);
              if (errCode === 110) Alert.alert('Agora Token Required', 'Your Agora project has App Certificate enabled. Disable it in console.agora.io for testing, or set up a token server.');
            },
          });
          engine.initialize({ appId: AGORA_APP_ID, channelProfile: 1 });
          await engine.setClientRole(1);
          await engine.enableVideo(); await engine.enableAudio(); await engine.startPreview();
          await new Promise<void>(r => setTimeout(r, 100));
          if (!mounted) return;
          await engine.joinChannel('', channelName, numericUid, {
            clientRoleType: 1, publishMicrophoneTrack: true, publishCameraTrack: true,
            autoSubscribeAudio: true, autoSubscribeVideo: true,
            audioProfile: 1,
          });
        } else {
          engine = await AgoraEngine.create(AGORA_APP_ID); engineRef.current = engine;
          await engine.enableVideo(); await engine.enableAudio();
          engine.addListener('JoinChannelSuccess', () => { if (!mounted) return; setEngineJoined(true); setCallReady(true); });
          engine.addListener('UserJoined', (uid: number) => { if (!mounted) return; setRemoteUid(uid); setCallReady(true); });
          engine.addListener('UserOffline', () => { if (!mounted) return; setRemoteUid(null); });
          engine.addListener('Error', (errCode: number) => console.warn('Agora error code:', errCode));
          await engine.joinChannel(null, channelName, null, numericUid);
        }
      } catch (err) { console.error('Agora init error:', err); }
    };
    init();
    return () => {
      mounted = false;
      try { if (engine) { engine.leaveChannel(); AgoraIsV4 ? engine.release() : engine.destroy(); } } catch (_) {}
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

  const toggleSpeaker = useCallback(async () => {
    if (!engineRef.current) return;
    const next = !speakerOn;
    try { await engineRef.current.setEnableSpeakerphone(next); } catch (_) {}
    setSpeakerOn(next);
  }, [speakerOn]);

  return { remoteUid, callReady, engineJoined, micMuted, camMuted, speakerOn, toggleMic, toggleCam, toggleSpeaker, agoraReady, permDenied };
}

// ─────────────────────────────────────────────────────────────
// PiP OVERLAY (partner) — top-right
// ─────────────────────────────────────────────────────────────
const PIP_W = 88; const PIP_H = 118;
const PIP_OFFSET_TOP = Platform.OS === 'ios' ? 130 : 110;

function PipOverlay({ photo, name, isActive, remoteUid, micMuted, camMuted, onToggleMic, onToggleCam, agoraReady, engineJoined }: {
  photo?: string; name: string; isActive: boolean; remoteUid: number | null;
  micMuted: boolean; camMuted: boolean; onToggleMic: () => void; onToggleCam: () => void;
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
    } else { pulse.setValue(1); }
  }, [isActive]);

  const showAgoraRemote = agoraReady && engineJoined && RtcRemoteView && remoteUid !== null;
  return (
    <Animated.View style={[pipStyles.pip, { transform: [{ scale: pulse }] }]}>
      <TouchableOpacity style={pipStyles.pipTouchable} onPress={() => setShowControls(s => !s)} activeOpacity={0.9}>
        {showAgoraRemote ? (
          AgoraIsV4
            ? <RtcRemoteView.SurfaceView style={pipStyles.pipVideo} canvas={{ uid: remoteUid, renderMode: 1 }} />
            : <RtcRemoteView.SurfaceView style={pipStyles.pipVideo} uid={remoteUid} channelId="cowatch" renderMode={1} />
        ) : (
          <View style={pipStyles.pipPlaceholder}><Avatar uri={photo} name={name} size={PIP_W} /></View>
        )}
        <View style={[pipStyles.pipRing, isActive && pipStyles.pipRingActive]} />
        <View style={pipStyles.pipNameTag}>
          <Text style={pipStyles.pipNameText} numberOfLines={1}>{name.split(' ')[0]}</Text>
        </View>
        {isActive && <View style={pipStyles.pipLiveDot} />}
      </TouchableOpacity>
      {showControls && (
        <View style={pipStyles.pipControls}>
          <TouchableOpacity style={pipStyles.pipCtrlBtn} onPress={onToggleMic}>
            <Ionicons name={micMuted ? 'mic-off' : 'mic-outline'} size={13} color={micMuted ? C.red : C.green} />
          </TouchableOpacity>
          <TouchableOpacity style={pipStyles.pipCtrlBtn} onPress={onToggleCam}>
            <Ionicons name={camMuted ? 'videocam-off' : 'videocam-outline'} size={13} color={camMuted ? C.red : C.green} />
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────
// LOCAL CAMERA PREVIEW — top-left
// ─────────────────────────────────────────────────────────────
function LocalPreview({ agoraReady, engineJoined, photo, yourName, permDenied }: {
  agoraReady: boolean; engineJoined: boolean; photo?: string; yourName: string; permDenied?: boolean;
}) {
  const showAgoraLocal = agoraReady && engineJoined && RtcLocalView && !permDenied;
  return (
    <View style={pipStyles.localPip}>
      {permDenied ? (
        <View style={[pipStyles.pipPlaceholder, { backgroundColor: '#1a0a0a' }]}>
          <Ionicons name="videocam-off" size={22} color={C.red} />
          <Text style={{ color: C.red, fontSize: 7, marginTop: 3, textAlign: 'center' }}>Allow{'\n'}Camera</Text>
        </View>
      ) : showAgoraLocal ? (
        AgoraIsV4
          ? <RtcLocalView.SurfaceView style={pipStyles.pipVideo} canvas={{ uid: 0, renderMode: 1 }} />
          : <RtcLocalView.SurfaceView style={pipStyles.pipVideo} renderMode={1} />
      ) : (
        <Avatar uri={photo} name={yourName} size={PIP_W} />
      )}
      <View style={pipStyles.pipNameTag}><Text style={pipStyles.pipNameText}>You</Text></View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// CALL CONTROLS — left side
// ─────────────────────────────────────────────────────────────
function CallControls({ micMuted, camMuted, speakerOn, onToggleMic, onToggleCam, onToggleSpeaker, onEndCall }: {
  micMuted: boolean; camMuted: boolean; speakerOn: boolean;
  onToggleMic: () => void; onToggleCam: () => void;
  onToggleSpeaker: () => void; onEndCall: () => void;
}) {
  return (
    <View style={callCtrlStyles.bar}>
      <TouchableOpacity style={[callCtrlStyles.btn, micMuted && callCtrlStyles.btnMuted]} onPress={onToggleMic}>
        <Ionicons name={micMuted ? 'mic-off' : 'mic-outline'} size={18} color={C.white} />
      </TouchableOpacity>
      <TouchableOpacity style={[callCtrlStyles.btn, camMuted && callCtrlStyles.btnMuted]} onPress={onToggleCam}>
        <Ionicons name={camMuted ? 'videocam-off' : 'videocam-outline'} size={18} color={C.white} />
      </TouchableOpacity>
      <TouchableOpacity style={[callCtrlStyles.btn, !speakerOn && callCtrlStyles.btnMuted]} onPress={onToggleSpeaker}>
        <Ionicons name={speakerOn ? 'volume-high-outline' : 'volume-mute-outline'} size={18} color={C.white} />
      </TouchableOpacity>
      <TouchableOpacity style={callCtrlStyles.endBtn} onPress={onEndCall}>
        <Ionicons name="call" size={18} color={C.white} />
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// FEED SELECTOR
// ─────────────────────────────────────────────────────────────
function FeedSelector({ activeFeed, onSelect }: { activeFeed: 'index' | 'video'; onSelect: (f: 'index' | 'video') => void }) {
  return (
    <View style={selectorStyles.row}>
      <TouchableOpacity style={[selectorStyles.tab, activeFeed === 'index' && selectorStyles.tabActive]} onPress={() => onSelect('index')}>
        <Ionicons name="home-outline" size={15} color={activeFeed === 'index' ? '#000' : C.muted} />
        <Text style={[selectorStyles.tabText, activeFeed === 'index' && selectorStyles.tabTextActive]}>Feed</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[selectorStyles.tab, activeFeed === 'video' && selectorStyles.tabActive]} onPress={() => onSelect('video')}>
        <Ionicons name="videocam-outline" size={15} color={activeFeed === 'video' ? '#000' : C.muted} />
        <Text style={[selectorStyles.tabText, activeFeed === 'video' && selectorStyles.tabTextActive]}>Videos</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// FEED POST CARD — memoized, full SH height, video controls,
//                 view tracking, LumVibe watermark
// ─────────────────────────────────────────────────────────────
const FeedPostCard = memo(function FeedPostCard({
  post, isCurrent, userId,
  onLike, onComment, onGift, onShare, onView,
}: {
  post: FeedPost; isCurrent: boolean; userId: string;
  onLike: (post: FeedPost) => void;
  onComment: (post: FeedPost) => void;
  onGift: (post: FeedPost) => void;
  onShare: (post: FeedPost) => void;
  onView: (postId: string) => void;
}) {
  const videoRef      = useRef<any>(null);
  const likeAnim      = useRef(new Animated.Value(1)).current;
  const viewedRef     = useRef(false);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [videoPct,    setVideoPct]     = useState(0);

  useEffect(() => {
    if (!videoRef.current || post.media_type !== 'video') return;
    if (isCurrent) videoRef.current.playAsync().catch(() => {});
    else           videoRef.current.pauseAsync().catch(() => {});
    if (isCurrent && !viewedRef.current) { viewedRef.current = true; onView(post.id); }
  }, [isCurrent]);

  useEffect(() => {
    if (isCurrent && !viewedRef.current && post.media_type !== 'video') {
      viewedRef.current = true; onView(post.id);
    }
  }, [isCurrent]);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setIsPlaying(status.isPlaying ?? false);
    if (status.durationMillis && status.positionMillis) {
      setVideoPct(status.positionMillis / status.durationMillis);
    }
  }, []);

  const handleVideoTap = useCallback(() => {
    if (!videoRef.current || post.media_type !== 'video') return;
    if (isPlaying) videoRef.current.pauseAsync().catch(() => {});
    else           videoRef.current.playAsync().catch(() => {});
  }, [isPlaying, post.media_type]);

  const handleLikeTap = () => {
    Animated.sequence([
      Animated.timing(likeAnim, { toValue: 1.35, duration: 130, useNativeDriver: true }),
      Animated.timing(likeAnim, { toValue: 1, duration: 130, useNativeDriver: true }),
    ]).start();
    onLike(post);
  };

  const fmtCount = (n: number) => (n ?? 0) > 999 ? `${((n ?? 0) / 1000).toFixed(1)}k` : String(n ?? 0);
  const isTextOrVoice = post.media_type === 'voice' || post.media_type === 'text' || !post.media_url;

  return (
    <TouchableOpacity
      activeOpacity={1}
      style={[cardStyles.card, { width: SW, height: SH }]}
      onPress={post.media_type === 'video' ? handleVideoTap : undefined}
    >
      {/* ── Background media ── */}
      {post.media_type === 'video' && post.media_url ? (
        <Video
          ref={videoRef}
          source={{ uri: post.media_url }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          isLooping shouldPlay={false}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        />
      ) : null}

      {post.media_type === 'image' && post.media_url ? (
        <Image source={{ uri: post.media_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : null}

      {isTextOrVoice ? (
        <View style={StyleSheet.absoluteFill}>
          {(post.thumbnail_url || post.media_url) && (
            <Image source={{ uri: post.thumbnail_url || post.media_url }} style={[StyleSheet.absoluteFill, { opacity: 0.3 }]} resizeMode="cover" />
          )}
          <View style={cardStyles.textPostOverlay}>
            <Text style={cardStyles.textPostContent} numberOfLines={8}>{post.caption || ''}</Text>
          </View>
        </View>
      ) : null}

      {/* Gradient scrim */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.7)']}
        style={[StyleSheet.absoluteFill, { top: '50%' }]}
        pointerEvents="none"
      />

      {/* Video controls overlay */}
      {post.media_type === 'video' && isCurrent && (
        <>
          {/* Pause/play hint (fades after first tap) */}
          {!isPlaying && (
            <View style={cardStyles.pauseIconWrap} pointerEvents="none">
              <View style={cardStyles.pauseIconBg}>
                <Ionicons name="pause" size={36} color={C.white} />
              </View>
            </View>
          )}
          {/* Progress bar */}
          <View style={cardStyles.progressBar} pointerEvents="none">
            <View style={[cardStyles.progressFill, { width: `${videoPct * 100}%` }]} />
          </View>
        </>
      )}

      {/* LumVibe watermark (matches main feeds) */}
      <View style={cardStyles.watermark} pointerEvents="none">
        <MaterialCommunityIcons name="shield-check" size={13} color={C.green} />
        <Text style={cardStyles.watermarkText}>LumVibe</Text>
      </View>

      {/* Author row */}
      <View style={cardStyles.authorRow}>
        <Avatar uri={post.avatar_url} name={post.display_name} size={40} borderColor={C.green} />
        <View style={{ flex: 1 }}>
          <Text style={cardStyles.authorName}>{post.display_name}</Text>
          <Text style={cardStyles.authorHandle}>@{post.username}</Text>
          {post.caption && !isTextOrVoice ? (
            <Text style={cardStyles.captionText} numberOfLines={2}>{post.caption}</Text>
          ) : null}
        </View>
      </View>

      {/* Action buttons — right side */}
      <View style={cardStyles.actionsCol}>
        <TouchableOpacity style={cardStyles.actionBtn} onPress={handleLikeTap}>
          <Animated.View style={{ transform: [{ scale: likeAnim }] }}>
            <Ionicons name={post.liked_by_me ? 'heart' : 'heart-outline'} size={28} color={post.liked_by_me ? C.red : C.white} />
          </Animated.View>
          <Text style={cardStyles.actionCount}>{fmtCount(post.likes_count)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={cardStyles.actionBtn} onPress={() => onComment(post)}>
          <Ionicons name="chatbubble-outline" size={28} color={C.white} />
          <Text style={cardStyles.actionCount}>{fmtCount(post.comments_count)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={cardStyles.actionBtn} onPress={() => onGift(post)}>
          <Ionicons name="gift-outline" size={28} color={C.gold} />
          <Text style={[cardStyles.actionCount, { color: C.gold }]}>
            {post.coins_received > 0 ? fmtCount(post.coins_received) : 'Gift'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={cardStyles.actionBtn} onPress={() => onShare(post)}>
          <Ionicons name="share-outline" size={26} color={C.white} />
          <Text style={cardStyles.actionCount}>Share</Text>
        </TouchableOpacity>
      </View>

      {isCurrent && (
        <View style={cardStyles.watchingBadge}>
          <View style={cardStyles.watchingDot} />
          <Text style={cardStyles.watchingBadgeText}>Watching Together</Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

// ─────────────────────────────────────────────────────────────
// COMMENT SHEET — with reply support
// ─────────────────────────────────────────────────────────────
function CommentSheet({ visible, postId, userId, onClose }: {
  visible: boolean; postId: string; userId: string; onClose: () => void;
}) {
  const [comments, setComments]     = useState<Comment[]>([]);
  const [text, setText]             = useState('');
  const [loading, setLoading]       = useState(false);
  const [sending, setSending]       = useState(false);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const flatRef = useRef<FlatList>(null);

  useEffect(() => {
    if (visible && postId) {
      setLoading(true);
      fetchPostComments(postId).then(c => { setComments(c); setLoading(false); });
    } else {
      setReplyingTo(null); setText('');
    }
  }, [visible, postId]);

  const submit = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    await postComment(postId, userId, t, replyingTo?.id || null);
    setText(''); setReplyingTo(null);
    const fresh = await fetchPostComments(postId);
    setComments(fresh); setSending(false);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const topLevel  = comments.filter(c => !c.parent_comment_id);
  const replies   = (parentId: string) => comments.filter(c => c.parent_comment_id === parentId);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={sheetStyles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={sheetStyles.sheet}>
          <View style={sheetStyles.handle} />
          <Text style={[sheetStyles.sheetTitle, { paddingHorizontal: 16, marginBottom: 12 }]}>Comments</Text>
          {loading ? (
            <ActivityIndicator color={C.green} style={{ marginVertical: 20 }} />
          ) : (
            <FlatList
              ref={flatRef}
              data={topLevel}
              keyExtractor={c => c.id}
              style={{ maxHeight: SH * 0.38 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 12 }}
              ListEmptyComponent={<Text style={sheetStyles.emptyText}>No comments yet. Be first!</Text>}
              renderItem={({ item }) => (
                <View>
                  <TouchableOpacity style={sheetStyles.commentRow} onPress={() => setReplyingTo(item)} activeOpacity={0.8}>
                    <Avatar uri={item.avatar_url} name={item.display_name} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text style={sheetStyles.commentName}>{item.display_name}</Text>
                      <Text style={sheetStyles.commentText}>{item.content}</Text>
                      <TouchableOpacity onPress={() => setReplyingTo(item)}>
                        <Text style={sheetStyles.replyLink}>Reply</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                  {/* Replies */}
                  {replies(item.id).map(reply => (
                    <View key={reply.id} style={[sheetStyles.commentRow, { marginLeft: 44, marginTop: 8 }]}>
                      <Avatar uri={reply.avatar_url} name={reply.display_name} size={26} />
                      <View style={{ flex: 1 }}>
                        <Text style={sheetStyles.commentName}>{reply.display_name}</Text>
                        <Text style={sheetStyles.commentText}>{reply.content}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            />
          )}
          {/* Replying-to bar */}
          {replyingTo && (
            <View style={sheetStyles.replyingBar}>
              <Text style={sheetStyles.replyingText}>Replying to {replyingTo.display_name}</Text>
              <TouchableOpacity onPress={() => setReplyingTo(null)}>
                <Ionicons name="close" size={16} color={C.muted} />
              </TouchableOpacity>
            </View>
          )}
          <View style={sheetStyles.commentInputRow}>
            <TextInput
              style={sheetStyles.commentInput}
              placeholder={replyingTo ? `Reply to ${replyingTo.display_name}…` : 'Add a comment…'}
              placeholderTextColor={C.muted2}
              value={text} onChangeText={setText}
              onSubmitEditing={submit} returnKeyType="send"
              editable={!sending}
            />
            <TouchableOpacity
              style={[sheetStyles.commentSendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
              onPress={submit} disabled={!text.trim() || sending}
            >
              {sending ? <ActivityIndicator size="small" color="#000" /> : <Ionicons name="send" size={16} color="#000" />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// GIFT SHEET — local currency, custom amount, coin balance
// ─────────────────────────────────────────────────────────────
function GiftSheet({ visible, post, userId, userProfile, onClose, onGiftSent }: {
  visible: boolean; post: FeedPost | null; userId: string; userProfile: any;
  onClose: () => void; onGiftSent: (postId: string, coins: number) => void;
}) {
  const [sending, setSending]             = useState(false);
  const [customMode, setCustomMode]       = useState(false);
  const [customAmount, setCustomAmount]   = useState('');
  const userCoins = userProfile?.coins || 0;

  const handlePackageGift = async (gift: typeof GIFT_PACKAGES[0]) => {
    if (!post) return;
    if (gift.coins > userCoins) {
      Alert.alert('💰 Insufficient Coins',
        `You need ${gift.coins} coins but only have ${userCoins} coins.\n\nTop up your wallet to send this gift.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Buy Coins →', onPress: () => { onClose(); setTimeout(() => router.push('/buy-coins' as any), 300); } },
        ],
      );
      return;
    }
    setSending(true);
    const result = await sendGiftToPost(post, userId, userProfile?.username || 'user', gift);
    setSending(false);
    if (result.success) {
      onGiftSent(post.id, gift.coins);
      onClose();
      Alert.alert(`${gift.icon} ${gift.name} Sent!`, `You sent ${gift.name} (${gift.coins} coins = ${coinsToNGN(gift.coins)}) to @${post.username}!`);
    } else if (result.message === 'insufficient_coins') {
      Alert.alert('Insufficient Coins', 'Balance changed. Please try again.');
    } else { Alert.alert('Error', 'Failed to send gift. Please try again.'); }
  };

  const handleCustomGift = async () => {
    if (!post || !customAmount.trim()) return;
    const coins = parseFloat(customAmount);
    if (isNaN(coins) || coins < 10)  { Alert.alert('Invalid Amount', 'Minimum is 10 coins (₦1,500)'); return; }
    if (coins > 5000)                { Alert.alert('Invalid Amount', 'Maximum is 5,000 coins per gift'); return; }
    if (coins > userCoins)           { Alert.alert('Insufficient Coins', `You only have ${userCoins} coins.`); return; }
    setSending(true);
    const result = await sendCustomGift(post, userId, userProfile?.username || 'user', coins);
    setSending(false);
    if (result.success) {
      onGiftSent(post.id, coins);
      setCustomAmount(''); setCustomMode(false); onClose();
      Alert.alert('🎁 Gift Sent!', `You sent ${coins} coins (${coinsToNGN(coins)}) to @${post.username}!`);
    } else { Alert.alert('Error', 'Failed to send gift. Please try again.'); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={sheetStyles.backdrop} onPress={onClose} activeOpacity={1}>
        <View style={sheetStyles.giftSheet} onStartShouldSetResponder={() => true}>
          <View style={sheetStyles.handle} />
          <View style={sheetStyles.giftHeader}>
            <Text style={sheetStyles.sheetTitle}>Send a Gift to @{post?.username}</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color={C.muted} />
            </TouchableOpacity>
          </View>

          {/* Coin balance row */}
          <View style={sheetStyles.balanceRow}>
            <Text style={{ fontSize: 18 }}>🪙</Text>
            <Text style={sheetStyles.balanceText}>{userCoins.toLocaleString()} coins available</Text>
            <TouchableOpacity style={sheetStyles.topUpBtn} onPress={() => { onClose(); setTimeout(() => router.push('/buy-coins' as any), 300); }}>
              <Text style={sheetStyles.topUpBtnText}>+ Top Up</Text>
            </TouchableOpacity>
          </View>

          {sending ? (
            <View style={{ alignItems: 'center', padding: 40 }}>
              <ActivityIndicator color={C.green} size="large" />
              <Text style={{ color: C.muted, marginTop: 12 }}>Sending gift…</Text>
            </View>
          ) : customMode ? (
            /* Custom amount input */
            <View style={sheetStyles.customGiftContainer}>
              <Text style={sheetStyles.customGiftLabel}>Enter custom coin amount (min 10, max 5,000)</Text>
              <TextInput
                style={sheetStyles.customGiftInput}
                placeholder="e.g. 250"
                placeholderTextColor={C.muted2}
                keyboardType="numeric"
                value={customAmount}
                onChangeText={setCustomAmount}
              />
              {customAmount.trim() && !isNaN(parseFloat(customAmount)) && (
                <Text style={sheetStyles.customGiftPreview}>
                  = {coinsToNGN(parseFloat(customAmount))} · {giftLocalPrice(parseFloat(customAmount) * COIN_TO_NGN)}
                </Text>
              )}
              <View style={sheetStyles.customGiftActions}>
                <TouchableOpacity style={[sheetStyles.customGiftBtn, { borderColor: C.border }]} onPress={() => { setCustomMode(false); setCustomAmount(''); }}>
                  <Text style={{ color: C.white, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[sheetStyles.customGiftBtn, { backgroundColor: C.green }]} onPress={handleCustomGift} disabled={!customAmount.trim()}>
                  <Text style={{ color: '#000', fontWeight: '700' }}>Send Gift</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <ScrollView contentContainerStyle={sheetStyles.giftGrid} showsVerticalScrollIndicator={false}>
              {GIFT_PACKAGES.map(g => {
                const canAfford = userCoins >= g.coins;
                return (
                  <TouchableOpacity
                    key={g.id}
                    style={[sheetStyles.giftItem, { borderColor: canAfford ? g.color + '66' : C.border }, !canAfford && { opacity: 0.45 }]}
                    onPress={() => handlePackageGift(g)} activeOpacity={0.75}
                  >
                    <Text style={{ fontSize: 32 }}>{g.icon}</Text>
                    <Text style={sheetStyles.giftName}>{g.name}</Text>
                    <View style={[sheetStyles.giftCostBadge, { borderColor: g.color + '44' }]}>
                      <Text style={[sheetStyles.giftCostText, { color: canAfford ? g.color : C.muted }]}>🪙 {g.coins.toLocaleString()}</Text>
                    </View>
                    {/* ₦ + local currency (matches index.tsx) */}
                    <Text style={sheetStyles.giftNgnText}>{coinsToNGN(g.coins)}</Text>
                    <Text style={[sheetStyles.giftNgnText, { color: C.gold }]}>{giftLocalPrice(g.ngn)}</Text>
                  </TouchableOpacity>
                );
              })}
              {/* Custom amount button */}
              <TouchableOpacity style={sheetStyles.customGiftTrigger} onPress={() => setCustomMode(true)}>
                <Ionicons name="add-circle-outline" size={20} color={C.green} />
                <Text style={sheetStyles.customGiftTriggerText}>Custom Amount</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// FLOATING REACTIONS
// ─────────────────────────────────────────────────────────────
function FloatingReactionLayer({ reactions }: { reactions: FloatingReaction[] }) {
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' } as any]}>
      {reactions.map(r => (
        <Animated.Text key={r.id} style={[floatStyles.bubble, {
          left: r.x,
          transform: [{ translateY: r.anim.interpolate({ inputRange: [0, 1], outputRange: [0, -260] }) }],
          opacity: r.anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0.9, 0] }),
        }]}>
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
  const { conversationId, otherName, otherPhoto, sessionId: existingSessionId } =
    useLocalSearchParams<{ conversationId: string; otherName: string; otherPhoto: string; sessionId?: string; }>();

  const { user, userProfile, loadProfile } = useAuthStore();

  const agoraChannel = `cowatch_${conversationId}`;
  const { remoteUid, callReady, engineJoined, micMuted, camMuted, speakerOn, toggleMic, toggleCam, toggleSpeaker, agoraReady, permDenied } =
    useAgoraCall(agoraChannel, user?.id || '');

  const feedRef           = useRef<FlatList>(null);
  const syncChannelRef    = useRef<RealtimeChannel | null>(null);
  const chatChannelRef    = useRef<RealtimeChannel | null>(null);
  const postsChannelRef   = useRef<RealtimeChannel | null>(null);
  const isSyncingRef      = useRef(false);
  const chatFlatRef       = useRef<FlatList>(null);
  const feedTypeRef       = useRef<'index' | 'video'>('video');
  const postsRef          = useRef<FeedPost[]>([]);
  const viewedPostsRef    = useRef<Set<string>>(new Set());

  const [session,           setSession]           = useState<CowatchSession | null>(null);
  const [isLoading,         setIsLoading]         = useState(true);
  const [feedLoading,       setFeedLoading]       = useState(false);
  const [refreshing,        setRefreshing]        = useState(false);
  const [feedType,          setFeedType]          = useState<'index' | 'video'>('video');
  const [feedItems,         setFeedItems]         = useState<FeedItem[]>([]);
  const [currentIndex,      setCurrentIndex]      = useState(0);
  const [messages,          setMessages]          = useState<LiveMessage[]>([]);
  const [inputText,         setInputText]         = useState('');
  const [isSendingChat,     setIsSendingChat]     = useState(false);
  const [otherUserActive,   setOtherUserActive]   = useState(false);
  const [chatExpanded,      setChatExpanded]      = useState(false);
  const [isSynced,          setIsSynced]          = useState(false);
  const [commentPost,       setCommentPost]       = useState<FeedPost | null>(null);
  const [giftPost,          setGiftPost]          = useState<FeedPost | null>(null);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [page,              setPage]              = useState(0);
  const [hasMore,           setHasMore]           = useState(true);

  useEffect(() => { feedTypeRef.current = feedType; }, [feedType]);

  // ── useFocusEffect: refresh coin balance when returning to screen ──
  useFocusEffect(useCallback(() => {
    if (loadProfile) loadProfile();
  }, [loadProfile]));

  useEffect(() => {
    setupSession();
    return () => {
      if (syncChannelRef.current)  supabase.removeChannel(syncChannelRef.current);
      if (chatChannelRef.current)  supabase.removeChannel(chatChannelRef.current);
      if (postsChannelRef.current) supabase.removeChannel(postsChannelRef.current);
    };
  }, []);

  useEffect(() => { loadFeed(feedType, 0, false); }, [feedType]);

  // ── Real-time incoming chat messages ──
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase.channel(`chat:${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        async (payload) => {
          const msg = payload.new as any;
          if (msg.sender_id === user?.id) return;
          const { data: profile } = await supabase.from('users').select('display_name, username, avatar_url').eq('id', msg.sender_id).single();
          const newMsg: LiveMessage = {
            id: msg.id, user_id: msg.sender_id,
            display_name: profile?.display_name || profile?.username || otherName || 'Partner',
            avatar_url: profile?.avatar_url,
            content: msg.content?.replace(/^🎬 \[Co-Watch\] /, '') || '',
            created_at: msg.created_at, isMe: false,
          };
          setMessages(prev => [...prev, newMsg]);
          setTimeout(() => chatFlatRef.current?.scrollToEnd({ animated: true }), 100);
        })
      .subscribe();
    chatChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [conversationId, user?.id, otherName]);

  // ── Real-time post updates (likes, coins) ──
  const subscribeToPostsUpdates = useCallback((postIds: string[]) => {
    if (postsChannelRef.current) supabase.removeChannel(postsChannelRef.current);
    if (!postIds.length) return;
    const channel = supabase.channel(`posts_realtime_cowatch`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' },
        (payload) => {
          const updated = payload.new as any;
          if (!postIds.includes(updated.id)) return;
          setFeedItems(prev => prev.map(item => {
            if (isAd(item) || item.id !== updated.id) return item;
            return {
              ...item,
              likes_count:    updated.likes_count    ?? (item as FeedPost).likes_count,
              coins_received: updated.coins_received ?? (item as FeedPost).coins_received,
              comments_count: updated.comments_count ?? (item as FeedPost).comments_count,
            };
          }));
        })
      .subscribe();
    postsChannelRef.current = channel;
  }, []);

  const injectAds = useCallback((posts: FeedPost[]): FeedItem[] => {
    const items: FeedItem[] = [];
    let adCounter = 0;
    posts.forEach((post, index) => {
      items.push(post);
      // Ad every 8 posts (matches index.tsx logic adapted for horizontal)
      if ((index + 1) % 8 === 0) {
        items.push({ id: `ad_${adCounter}`, isAd: true, adIndex: adCounter });
        adCounter++;
      }
    });
    return items;
  }, []);

  const loadFeed = async (type: 'index' | 'video', pageNum = 0, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else if (pageNum === 0) setFeedLoading(true);

    const data = await fetchFeedPosts(type, pageNum);
    const withLiked = data.map(p => ({ ...p, liked_by_me: (p.liked_by || []).includes(user?.id || '') }));

    if (pageNum === 0) {
      const items = injectAds(withLiked);
      setFeedItems(items);
      postsRef.current = withLiked;
      setCurrentIndex(0);
      setPage(0);
      subscribeToPostsUpdates(withLiked.map(p => p.id));
    } else {
      setFeedItems(prev => {
        const existingPosts = prev.filter(i => !isAd(i)) as FeedPost[];
        const combined = [...existingPosts, ...withLiked];
        return injectAds(combined);
      });
      postsRef.current = [...postsRef.current, ...withLiked];
    }

    setHasMore(data.length === 30);
    if (isRefresh) setRefreshing(false);
    else setFeedLoading(false);
  };

  const handleLoadMore = useCallback(() => {
    if (!hasMore || feedLoading || refreshing) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadFeed(feedType, nextPage, false);
  }, [hasMore, feedLoading, refreshing, page, feedType]);

  const handleRefresh = useCallback(() => {
    loadFeed(feedType, 0, true);
  }, [feedType]);

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
      if (!activeSession) { Alert.alert('Error', 'Could not start co-watch session.'); router.back(); return; }
      setSession(activeSession);
      if (activeSession.feed_type) { setFeedType(activeSession.feed_type); feedTypeRef.current = activeSession.feed_type; }
      if (activeSession.current_post_index) setCurrentIndex(activeSession.current_post_index);
      setIsLoading(false);
      syncChannelRef.current = subscribeCowatchSession(activeSession.id, handleRemoteSync);
      addSystemMessage(`Watch party started with ${otherName} 🎬`);

      if (!existingSessionId && conversationId) {
        try {
          const { data: convoData } = await supabase.from('conversations').select('user1_id, user2_id').eq('id', conversationId).single();
          if (convoData) {
            const inviteeId = convoData.user1_id === user.id ? convoData.user2_id : convoData.user1_id;
            if (inviteeId) await notifyCowatchInvite(inviteeId, user.id, userProfile?.display_name || userProfile?.username || 'Someone', conversationId, activeSession.id);
          }
        } catch (notifyErr) { console.warn('notifyCowatchInvite failed:', notifyErr); }
      }
    } catch (e) { console.error('setupSession error:', e); setIsLoading(false); }
  };

  const handleRemoteSync = useCallback((updatedSession: CowatchSession) => {
    if (isSyncingRef.current) return;
    setOtherUserActive(true);
    const newIndex = updatedSession.current_post_index ?? 0;
    setCurrentIndex(prev => {
      if (prev !== newIndex && newIndex >= 0 && newIndex < postsRef.current.length) {
        feedRef.current?.scrollToIndex({ index: newIndex, animated: true });
        return newIndex;
      }
      return prev;
    });
    if (updatedSession.feed_type && updatedSession.feed_type !== feedTypeRef.current) {
      setFeedType(updatedSession.feed_type);
      feedTypeRef.current = updatedSession.feed_type;
    }
    setIsSynced(true);
    setTimeout(() => setIsSynced(false), 2000);
  }, []);

  const handleScrollEnd = useCallback((e: any) => {
    // Kept for reference — actual scroll handler is now inline on FlatList (vertical)
  }, [currentIndex, session]);

  // ── View tracking via viewability ──
  const handleViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: any[] }) => {
    viewableItems.forEach(({ item }: { item: FeedItem }) => {
      if (isAd(item)) return;
      const post = item as FeedPost;
      if (!viewedPostsRef.current.has(post.id) && user?.id) {
        viewedPostsRef.current.add(post.id);
        trackView(post.id, user.id);
      }
    });
  }, [user?.id]);

  const viewabilityConfig = useMemo(() => ({ itemVisiblePercentThreshold: 70 }), []);

  const handleLike = useCallback(async (post: FeedPost) => {
    if (!user) return;

    // Read current liked state from live feedItems, not stale prop
    const currentItem = feedItems.find(i => !isAd(i) && i.id === post.id) as FeedPost | undefined;
    if (!currentItem) return;
    const wasLiked = currentItem.liked_by_me || false;

    // Optimistic UI update
    setFeedItems(prev => prev.map(item => {
      if (isAd(item) || item.id !== post.id) return item;
      const p = item as FeedPost;
      return {
        ...p,
        liked_by_me: !wasLiked,
        liked_by: wasLiked
          ? (p.liked_by || []).filter(id => id !== user.id)
          : [...(p.liked_by || []), user.id],
        likes_count: wasLiked
          ? Math.max(0, p.likes_count - 1)
          : p.likes_count + 1,
      };
    }));

    // Persist to DB
    await toggleLikePost(post.id, user.id, wasLiked);

    // Award like points to post owner
    if (post.user_id !== user.id && !wasLiked) {
      const multipliers = await getOwnerBadgeMultipliers(post.user_id);
      const { data: ownerData } = await supabase
        .from('users').select('points').eq('id', post.user_id).single();
      if (ownerData) {
        await supabase.from('users')
          .update({ points: (ownerData.points || 0) + multipliers.likePoints })
          .eq('id', post.user_id);
      }
    }
  }, [user, feedItems]);

  const handleShare = useCallback(async (post: FeedPost) => {
    try {
      const deepLink = `https://lumvibe.site/post/${post.id}`;
      await Share.share({ message: `Check out this post by @${post.username} on LumVibe!\n\n${post.caption || ''}\n\n${deepLink}`, title: `Post by @${post.username}` });
    } catch (e) { console.error('Share error:', e); }
  }, []);

  const handleFeedTypeChange = useCallback(async (newType: 'index' | 'video') => {
    if (!session) return;
    setFeedType(newType); feedTypeRef.current = newType; setCurrentIndex(0);
    isSyncingRef.current = true;
    await supabase.from('cowatch_sessions').update({ feed_type: newType, current_post_index: 0 }).eq('id', session.id);
    setTimeout(() => { isSyncingRef.current = false; }, 600);
  }, [session]);

  const addSystemMessage = (text: string) => {
    setMessages(prev => [...prev, { id: Date.now().toString(), user_id: 'system', display_name: 'System', content: text, created_at: new Date().toISOString(), isMe: false }]);
  };

  const sendLiveMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || !user || isSendingChat) return;
    setIsSendingChat(true);
    setMessages(prev => [...prev, {
      id: `local_${Date.now()}`, user_id: user.id,
      display_name: userProfile?.display_name || userProfile?.username || 'You',
      avatar_url: userProfile?.avatar_url,
      content: text, created_at: new Date().toISOString(), isMe: true,
    }]);
    setInputText('');
    if (conversationId) await sendChatMessage(conversationId, user.id, `🎬 [Co-Watch] ${text}`);
    setIsSendingChat(false);
    setTimeout(() => chatFlatRef.current?.scrollToEnd({ animated: true }), 100);
  }, [inputText, user, conversationId, userProfile, isSendingChat]);

  const sendReaction = useCallback((emoji: string) => {
    if (!user) return;
    setMessages(prev => [...prev, { id: `react_${Date.now()}`, user_id: user.id, display_name: userProfile?.display_name || 'You', content: emoji, created_at: new Date().toISOString(), isMe: true }]);
    const id = `float_${Date.now()}_${Math.random()}`;
    const anim = new Animated.Value(0);
    const x = SW * 0.3 + Math.random() * SW * 0.4;
    setFloatingReactions(prev => [...prev, { id, emoji, anim, x }]);
    Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true })
      .start(() => setFloatingReactions(prev => prev.filter(r => r.id !== id)));
    setTimeout(() => chatFlatRef.current?.scrollToEnd({ animated: true }), 100);
  }, [user, userProfile]);

  const handleGiftSent = useCallback((postId: string, coins: number) => {
    setFeedItems(prev => prev.map(item => {
      if (isAd(item) || item.id !== postId) return item;
      return { ...item, coins_received: (item as FeedPost).coins_received + coins };
    }));
    if (loadProfile) loadProfile(); // Refresh coin balance in store
  }, [loadProfile]);

  const handleOnView = useCallback((postId: string) => {
    if (!user?.id || viewedPostsRef.current.has(postId)) return;
    viewedPostsRef.current.add(postId);
    trackView(postId, user.id);
  }, [user?.id]);

  const endCowatch = useCallback(async () => {
    if (session) await endCowatchSession(session.id);
    router.back();
  }, [session]);

  // ── Loading screen ──
  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <StatusBar barStyle="light-content" backgroundColor="#000" translucent />
        <ActivityIndicator color={C.green} size="large" />
        <Text style={styles.loadingTitle}>Starting Watch Party</Text>
        <Text style={styles.loadingSubtitle}>Connecting with {otherName}…</Text>
      </View>
    );
  }

  const currentPost = feedItems[currentIndex];
  const currentPostIsAd = currentPost ? isAd(currentPost) : false;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ── FEED — full height ── */}
      <View style={styles.feedContainer}>
        {feedLoading && !refreshing ? (
          <View style={styles.feedLoadingWrap}>
            <ActivityIndicator color={C.green} size="large" />
            <Text style={styles.feedLoadingText}>Loading {feedType === 'video' ? 'videos' : 'posts'}…</Text>
          </View>
        ) : (
          <FlatList
            ref={feedRef}
            data={feedItems}
            keyExtractor={item => item.id}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.y / SH);
              if (idx === currentIndex || !session) return;
              setCurrentIndex(idx);
              isSyncingRef.current = true;
              syncFeedIndex(session.id, idx, false, 0).finally(() => {
                setTimeout(() => { isSyncingRef.current = false; }, 600);
              });
            }}
            getItemLayout={(_, index) => ({ length: SH, offset: SH * index, index })}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.4}
            onViewableItemsChanged={handleViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={C.green}
                colors={[C.green]}
              />
            }
            renderItem={({ item, index }) => {
              if (isAd(item)) return <NativeAdCard adIndex={item.adIndex} />;
              return (
                <FeedPostCard
                  post={item as FeedPost}
                  isCurrent={index === currentIndex}
                  userId={user?.id || ''}
                  onLike={handleLike}
                  onComment={setCommentPost}
                  onGift={setGiftPost}
                  onShare={handleShare}
                  onView={handleOnView}
                />
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyFeed}>
                <Text style={styles.emptyFeedText}>No posts found</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={() => loadFeed(feedType, 0, false)}>
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}

        <FloatingReactionLayer reactions={floatingReactions} />

        {/* Partner PiP — top right */}
        <PipOverlay
          photo={otherPhoto || undefined} name={otherName || 'Partner'}
          isActive={otherUserActive || callReady}
          remoteUid={remoteUid} micMuted={micMuted} camMuted={camMuted}
          onToggleMic={toggleMic} onToggleCam={toggleCam}
          agoraReady={agoraReady} engineJoined={engineJoined}
        />

        {/* Your PiP — top left */}
        <LocalPreview
          agoraReady={agoraReady} engineJoined={engineJoined}
          photo={userProfile?.avatar_url}
          yourName={userProfile?.display_name || userProfile?.username || 'You'}
          permDenied={permDenied}
        />

        {/* TOP BAR */}
        <View style={[styles.topBarWrap, { pointerEvents: 'box-none' } as any]}>
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
                {feedItems.length > 0 ? `${currentIndex + 1} / ${feedItems.length}` : '--'}
              </Text>
            </View>
          </View>
        </View>

        {/* Call controls — left side */}
        <CallControls micMuted={micMuted} camMuted={camMuted} speakerOn={speakerOn} onToggleMic={toggleMic} onToggleCam={toggleCam} onToggleSpeaker={toggleSpeaker} onEndCall={endCowatch} />
      </View>

      {/* ── BOTTOM PANEL ── */}
      <KeyboardAvoidingView style={styles.bottomPanel} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Reaction bar */}
        <View style={styles.reactionsBar}>
          {QUICK_REACTIONS.map(emoji => (
            <TouchableOpacity key={emoji} style={styles.reactionBtn} onPress={() => sendReaction(emoji)}>
              <Text style={{ fontSize: 20 }}>{emoji}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.chatToggleBtn} onPress={() => setChatExpanded(e => !e)}>
            <Ionicons name={chatExpanded ? 'chevron-down' : 'chevron-up'} size={16} color={C.muted} />
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
                    <Ionicons name="radio-outline" size={11} color={C.green} />
                    <Text style={styles.systemMsgText}>{item.content}</Text>
                  </View>
                );
              }
              if (QUICK_REACTIONS.includes(item.content)) {
                return <View style={[styles.cwMsg, item.isMe && styles.cwMsgMe]}><Text style={{ fontSize: 26 }}>{item.content}</Text></View>;
              }
              return (
                <View style={[styles.cwMsg, item.isMe && styles.cwMsgMe]}>
                  {!item.isMe && <Avatar uri={item.avatar_url} name={item.display_name} size={26} />}
                  <View style={[styles.cwBubble, item.isMe && styles.cwBubbleMe]}>
                    {!item.isMe && <Text style={styles.cwSenderName}>{item.display_name}</Text>}
                    <Text style={[styles.cwBubbleText, item.isMe && { color: '#000' }]}>{item.content}</Text>
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
              value={inputText} onChangeText={setInputText}
              onSubmitEditing={sendLiveMessage}
              returnKeyType="send" editable={!isSendingChat}
            />
          </View>
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || isSendingChat) && { opacity: 0.4 }]}
            onPress={sendLiveMessage} disabled={!inputText.trim() || isSendingChat}
          >
            {isSendingChat ? <ActivityIndicator size="small" color="#000" /> : <Ionicons name="send" size={16} color="#000" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <CommentSheet visible={!!commentPost} postId={commentPost?.id || ''} userId={user?.id || ''} onClose={() => setCommentPost(null)} />
      <GiftSheet visible={!!giftPost} post={giftPost} userId={user?.id || ''} userProfile={userProfile} onClose={() => setGiftPost(null)} onGiftSent={handleGiftSent} />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────

const pipStyles = StyleSheet.create({
  pip: {
    position: 'absolute', top: PIP_OFFSET_TOP, right: 12,
    width: PIP_W, height: PIP_H, borderRadius: 14, zIndex: 20,
    shadowColor: '#000', shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 14,
  },
  pipTouchable: { width: PIP_W, height: PIP_H, borderRadius: 14, overflow: 'hidden' },
  pipVideo:     { width: PIP_W, height: PIP_H },
  pipPlaceholder: { width: PIP_W, height: PIP_H, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  pipRing: { position: 'absolute', inset: 0, borderRadius: 14, borderWidth: 2, borderColor: 'transparent', zIndex: 2 },
  pipRingActive: { borderColor: C.green },
  pipNameTag: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.65)', paddingVertical: 3, paddingHorizontal: 6,
    borderBottomLeftRadius: 14, borderBottomRightRadius: 14, zIndex: 3,
  },
  pipNameText: { fontSize: 9.5, color: C.white, fontWeight: '600', textAlign: 'center' },
  pipLiveDot: { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: C.green, zIndex: 4, borderWidth: 1.5, borderColor: '#000' },
  pipControls: { position: 'absolute', top: -52, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 8, zIndex: 25 },
  pipCtrlBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  localPip: {
    position: 'absolute', top: PIP_OFFSET_TOP, left: 12,
    width: PIP_W, height: PIP_H, borderRadius: 14, overflow: 'hidden', zIndex: 19,
    borderWidth: 2, borderColor: C.green,
    shadowColor: '#000', shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 13,
  },
});

const callCtrlStyles = StyleSheet.create({
  bar: {
    position: 'absolute', bottom: 18, left: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 18,
    backgroundColor: 'rgba(0,0,0,0.65)', paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 30, borderWidth: 1, borderColor: C.border,
  },
  btn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  btnMuted: { backgroundColor: 'rgba(229,57,53,0.25)', borderColor: C.red },
  endBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
});

const cardStyles = StyleSheet.create({
  card: { backgroundColor: '#000', position: 'relative' },
  textPostOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  textPostContent: { fontSize: 20, fontWeight: '700', color: C.white, textAlign: 'center', lineHeight: 30 },
  pauseIconWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 4 },
  pauseIconBg: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  progressBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, backgroundColor: 'rgba(255,255,255,0.2)', zIndex: 5 },
  progressFill: { height: '100%', backgroundColor: C.green, borderRadius: 2 },
  watermark: { position: 'absolute', top: 56, right: 12, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 10, zIndex: 5 },
  watermarkText: { color: C.green, fontSize: 11, fontWeight: '700' },
  authorRow: { position: 'absolute', bottom: 72, left: 16, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 5, right: 76 },
  authorName:   { fontSize: 13, fontWeight: '700', color: C.white },
  authorHandle: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  captionText:  { fontSize: 11, color: 'rgba(255,255,255,0.75)', marginTop: 3, lineHeight: 15 },
  actionsCol: { position: 'absolute', right: 12, bottom: 68, gap: 18, alignItems: 'center', zIndex: 5 },
  actionBtn:   { alignItems: 'center', gap: 3 },
  actionCount: { fontSize: 11, color: C.white, fontWeight: '600' },
  watchingBadge: { position: 'absolute', bottom: 14, left: 16, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: 4, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: C.green + '55', zIndex: 5 },
  watchingDot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green },
  watchingBadgeText: { fontSize: 10.5, color: C.green, fontWeight: '600' },
});

const adStyles = StyleSheet.create({
  card: { backgroundColor: '#0a0a0a', position: 'relative', alignItems: 'center', justifyContent: 'center' },
  bgEmoji: { position: 'absolute', fontSize: 160, opacity: 0.06 },
  sponsoredPill: { position: 'absolute', top: 56, right: 12, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.7)', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 14, zIndex: 5 },
  sponsoredText: { fontSize: 10, fontWeight: '700' },
  center: { alignItems: 'center', paddingHorizontal: 40, gap: 16 },
  tagline: { fontSize: 26, fontWeight: '900', textAlign: 'center', lineHeight: 34 },
  caption: { fontSize: 14, color: 'rgba(255,255,255,0.65)', textAlign: 'center', lineHeight: 21 },
  cta: { paddingVertical: 14, paddingHorizontal: 32, borderRadius: 28, marginTop: 8 },
  ctaText: { color: '#000', fontSize: 15, fontWeight: '800' },
  watermark: { position: 'absolute', bottom: 100, right: 20, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 10 },
  watermarkText: { fontSize: 11, fontWeight: '700' },
});

const selectorStyles = StyleSheet.create({
  row: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 22, padding: 4, gap: 2, borderWidth: 1, borderColor: C.border },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 18 },
  tabActive:     { backgroundColor: C.green },
  tabText:       { fontSize: 12, color: C.muted, fontWeight: '600' },
  tabTextActive: { color: '#000', fontWeight: '800' },
});

const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#121212', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: Platform.OS === 'ios' ? 34 : 20, borderTopWidth: 1, borderColor: C.border },
  giftSheet: { backgroundColor: '#121212', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: Platform.OS === 'ios' ? 34 : 20, borderTopWidth: 1, borderColor: C.border, maxHeight: SH * 0.8 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginTop: 10, marginBottom: 14 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: C.white, flex: 1 },
  giftHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1a1a1a', marginHorizontal: 16, marginBottom: 16, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.gold + '44' },
  balanceText: { color: C.gold, fontSize: 14, fontWeight: '700', flex: 1 },
  topUpBtn: { backgroundColor: C.greenBg, borderWidth: 1, borderColor: C.green, borderRadius: 14, paddingVertical: 5, paddingHorizontal: 12 },
  topUpBtnText: { color: C.green, fontSize: 12, fontWeight: '700' },
  giftGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, paddingBottom: 16, justifyContent: 'space-between' },
  giftItem: { width: (SW - 52) / 3, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', gap: 4 },
  giftName: { fontSize: 11, fontWeight: '700', color: C.white, textAlign: 'center' },
  giftCostBadge: { backgroundColor: 'rgba(0,0,0,0.4)', borderWidth: 1, borderRadius: 20, paddingVertical: 3, paddingHorizontal: 8, marginTop: 2 },
  giftCostText: { fontSize: 11, fontWeight: '700' },
  giftNgnText: { fontSize: 9.5, color: C.muted, marginTop: 1 },
  customGiftContainer: { padding: 20 },
  customGiftLabel: { color: C.muted, fontSize: 13, marginBottom: 12 },
  customGiftInput: { backgroundColor: C.card, color: C.white, fontSize: 22, fontWeight: '700', padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: C.green, textAlign: 'center', marginBottom: 8 },
  customGiftPreview: { color: C.gold, fontSize: 14, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  customGiftActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  customGiftBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', borderWidth: 1 },
  customGiftTrigger: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderColor: C.green, borderStyle: 'dashed', marginTop: 4 },
  customGiftTriggerText: { color: C.green, fontSize: 14, fontWeight: '700' },
  emptyText: { fontSize: 13, color: C.muted, textAlign: 'center', paddingVertical: 20 },
  commentRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  commentName: { fontSize: 11.5, fontWeight: '700', color: C.green, marginBottom: 2 },
  commentText: { fontSize: 13, color: C.white, lineHeight: 18 },
  replyLink: { fontSize: 11, color: C.muted, marginTop: 4 },
  replyingBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.card2, borderTopWidth: 1, borderTopColor: C.border },
  replyingText: { color: C.green, fontSize: 12, fontStyle: 'italic' },
  commentInputRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderColor: C.border, marginTop: 8 },
  commentInput: { flex: 1, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 10, color: C.white, fontSize: 14 },
  commentSendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
});

const floatStyles = StyleSheet.create({
  bubble: { position: 'absolute', bottom: 100, fontSize: 28, zIndex: 100 },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  loadingScreen: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingTitle:    { fontSize: 16, fontWeight: '800', color: C.white, marginTop: 8 },
  loadingSubtitle: { fontSize: 13, color: C.muted },
  feedContainer: { flex: 1, backgroundColor: '#000', position: 'relative' },
  feedLoadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  feedLoadingText: { fontSize: 13, color: C.muted },
  emptyFeed: { width: SW, height: SH * 0.6, alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyFeedText: { fontSize: 14, color: C.muted },
  retryBtn: { backgroundColor: C.greenBg, borderWidth: 1, borderColor: C.green, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 24 },
  retryBtnText: { fontSize: 13, color: C.green, fontWeight: '700' },
  topBarWrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 22 },
  topBarRow1: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: Platform.OS === 'ios' ? 12 : 10, paddingBottom: 6, backgroundColor: 'rgba(0,0,0,0.5)', gap: 8 },
  topBarRow2: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'space-between' },
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontSize: 13, fontWeight: '700', color: C.white },
  topBarSub:   { fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  syncBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.greenBg, borderWidth: 1, borderColor: C.green, borderRadius: 20, paddingVertical: 3, paddingHorizontal: 8 },
  syncBadgeText: { fontSize: 9.5, fontWeight: '700', color: C.green },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.red, borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10 },
  liveBadgeText: { fontSize: 9.5, fontWeight: '800', color: C.white, letterSpacing: 0.8 },
  postCounter: { backgroundColor: 'rgba(0,0,0,0.5)', paddingVertical: 3, paddingHorizontal: 10, borderRadius: 20 },
  postCounterText: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  bottomPanel: { backgroundColor: '#080808', borderTopWidth: 1, borderTopColor: C.border },
  reactionsBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, gap: 4 },
  reactionBtn: { flex: 1, alignItems: 'center', paddingVertical: 5, backgroundColor: C.card2, borderRadius: 10 },
  chatToggleBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  chatArea: { maxHeight: SH * 0.22 },
  systemMsg: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 2 },
  systemMsgText: { fontSize: 11, color: C.muted, backgroundColor: C.card, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 10 },
  cwMsg:   { flexDirection: 'row', gap: 7, alignItems: 'flex-end' },
  cwMsgMe: { flexDirection: 'row-reverse' },
  cwBubble: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10, maxWidth: SW * 0.62 },
  cwBubbleMe:   { backgroundColor: C.green, borderColor: C.green },
  cwSenderName: { fontSize: 9.5, color: C.green, fontWeight: '700', marginBottom: 2 },
  cwBubbleText: { fontSize: 13, color: C.white },
  inputRow: { flexDirection: 'row', gap: 9, paddingHorizontal: 14, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 6 : 12, borderTopWidth: 1, borderTopColor: C.border },
  inputWrap: { flex: 1, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, borderRadius: 22, paddingHorizontal: 14 },
  inputField: { color: C.white, fontSize: 14, paddingVertical: 10 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
}); 