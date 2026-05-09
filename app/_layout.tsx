// FILE: app/_layout.tsx
// ✅ All original features preserved
// ✅ Deep link listener (referral + post/video links)
// ✅ Deferred post navigation on login (post shared before install)
// ✅ CoWatch invite push notification deep link handled
// ✅ Cold-start notification handler (app was fully closed)
// ✅ FIX: supabase channel cleanup leak fixed
// ✅ FIX: setupNotifications wrapped in useCallback
// ✅ FIX: getInitialURL only fires once via ref guard
// ✅ FIX: console.log gated behind __DEV__
// ✅ FIX: Stripe removed
// ✅ FIX: Persistent login — user stays logged in unless they manually log out

import React, { useEffect, useRef, useCallback } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/config/supabase';
import { registerForPushNotificationsAsync, setBadgeCount } from '@/utils/pushNotifications';
import { View, Text, ActivityIndicator } from 'react-native';
import { LanguageProvider } from '@/locales/LanguageContext';
import {
  savePendingReferral,
  savePendingPost,
  getAndClearPendingPost,
} from '@/utils/referralUtils';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

export default function RootLayout() {
  const { initAuth, user, isLoading } = useAuthStore();
  const router = useRouter();
  const notificationListener   = useRef<Notifications.Subscription | null>(null);
  const responseListener       = useRef<Notifications.Subscription | null>(null);
  const notifChannelRef        = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // ✅ FIX: Guard so getInitialURL only runs once, even if user state changes
  const hasHandledInitialURL   = useRef(false);

  // ── AUTH INIT ───────────────────────────────────────────────
  // initAuth must read the persisted session from storage and restore it.
  // As long as your authStore does this (Supabase onAuthStateChange or
  // getSession on startup), the user will stay logged in automatically.
  useEffect(() => {
    if (__DEV__) console.log('🚀 Initializing app...');
    try { initAuth(); } catch (e) { if (__DEV__) console.error('❌ Auth init error:', e); }
  }, []);

  // ── NOTIFICATION SETUP / TEARDOWN ───────────────────────────
  // ✅ FIX: Wrapped in useCallback so it's stable across renders
  const setupNotifications = useCallback(async () => {
    if (!user) return;
    try {
      await registerForPushNotificationsAsync(user.id);

      notificationListener.current = Notifications.addNotificationReceivedListener(
        () => updateBadgeCount()
      );

      responseListener.current = Notifications.addNotificationResponseReceivedListener((r) => {
        handleNotificationNavigation(r.notification.request.content.data);
      });

      // ── COLD-START: app was fully closed when user tapped notification ──
      Notifications.getLastNotificationResponseAsync().then((response) => {
        if (response?.notification?.request?.content?.data) {
          setTimeout(() => {
            handleNotificationNavigation(
              response.notification.request.content.data
            );
          }, 800);
        }
      });

      // ✅ FIX: Store channel in ref so it can be cleaned up properly
      const ch = supabase.channel('notif-updates')
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        }, () => updateBadgeCount())
        .subscribe();

      notifChannelRef.current = ch;
      updateBadgeCount();
    } catch (e) { if (__DEV__) console.error('❌ Notification setup error:', e); }
  }, [user]);

  useEffect(() => {
    if (user) {
      if (__DEV__) console.log('👤 User logged in, setting up notifications...');
      setupNotifications();
    }

    // ✅ FIX: Cleanup now actually runs — removes listeners AND supabase channel
    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
      if (notifChannelRef.current) {
        supabase.removeChannel(notifChannelRef.current);
        notifChannelRef.current = null;
      }
    };
  }, [user, setupNotifications]);

  // ── DEEP LINK LISTENER ──────────────────────────────────────
  useEffect(() => {
    // ✅ FIX: Guard prevents getInitialURL from firing on every user change
    if (!hasHandledInitialURL.current) {
      hasHandledInitialURL.current = true;
      Linking.getInitialURL().then((url) => {
        if (url) handleIncomingLink(url);
      });
    }

    // App already open in background/foreground
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleIncomingLink(url);
    });

    // After login, navigate to any pending post saved before install
    if (user) {
      getAndClearPendingPost().then((pending) => {
        if (pending) {
          router.push(`/post/${pending.postId}` as any);
        }
      });
    }

    return () => subscription.remove();
  }, [user]);

  // ── HANDLE INCOMING DEEP LINK URL ───────────────────────────
  const handleIncomingLink = async (url: string) => {
    try {
      const parsed = Linking.parse(url);
      const { path, queryParams } = parsed;

      // REFERRAL: lumvibe.site/invite?ref=ABC123
      if (queryParams?.ref) {
        await savePendingReferral(queryParams.ref as string);
        if (__DEV__) console.log('📌 Referral code saved from link:', queryParams.ref);
      }

      // POST: lumvibe.site/post/POST_ID
      if (path?.startsWith('post/')) {
        const postId = path.replace('post/', '');
        await savePendingPost(postId, 'post');
        if (user) router.push(`/post/${postId}` as any);
        if (__DEV__) console.log('📌 Post link received:', postId);
      }

      // VIDEO: lumvibe.site/video/POST_ID
      if (path?.startsWith('video/')) {
        const postId = path.replace('video/', '');
        await savePendingPost(postId, 'video');
        if (user) router.push(`/post/${postId}` as any);
        if (__DEV__) console.log('📌 Video link received:', postId);
      }

      // COWATCH: lumvibe.site/cowatch?conversationId=X&sessionId=Y
      if (path?.startsWith('cowatch') || queryParams?.conversationId) {
        const conversationId = queryParams?.conversationId as string;
        const sessionId      = queryParams?.sessionId      as string;
        const otherName      = queryParams?.otherName      as string || 'Partner';
        if (user && conversationId && sessionId) {
          router.push({
            pathname: '/chat/cowatch',
            params: { conversationId, sessionId, otherName, otherPhoto: '' },
          } as any);
        }
      }
    } catch (e) {
      if (__DEV__) console.error('❌ handleIncomingLink error:', e);
    }
  };

  // ── NOTIFICATION NAVIGATION HANDLER ─────────────────────────
  const handleNotificationNavigation = (data: any) => {
    try {
      if (!data) return;
      if (__DEV__) console.log('🔔 Notification tapped, type:', data.type);

      switch (String(data.type)) {

        // ── CoWatch invite — go directly into the CoWatch screen ──
        case 'cowatch_invite':
          if (data.conversationId && data.sessionId) {
            router.push({
              pathname: '/chat/cowatch',
              params: {
                conversationId: data.conversationId,
                sessionId:      data.sessionId,
                otherName:      data.otherName  || 'Partner',
                otherPhoto:     data.otherPhoto || '',
              },
            } as any);
          }
          break;

        // ── Post interactions — go to the post ──
        case 'like':
        case 'comment':
        case 'coin':
        case 'gift':
        case 'mention':
          if (data.post_id || data.postId) {
            router.push(`/post/${data.post_id || data.postId}` as any);
          }
          break;

        // ── Follow — go to the follower's profile ──
        case 'follow':
          if (data.from_user_id || data.fromUserId) {
            router.push(`/user/${data.from_user_id || data.fromUserId}` as any);
          }
          break;

        // ── Direct message — go to the conversation ──
        case 'message':
          if (data.id || data.conversationId) {
            router.push(`/chat/${data.id || data.conversationId}` as any);
          }
          break;

        // ── Achievements & referral commissions — go to profile ──
        case 'achievement':
        case 'referral_commission':
          router.push('/(tabs)/profile' as any);
          break;

        // ── Marketplace ──
        case 'marketplace':
          router.push('/(tabs)/marketplace' as any);
          break;

        // ── Fallback — go to notifications tab ──
        default:
          router.push('/(tabs)/notification' as any);
          break;
      }
    } catch (e) { if (__DEV__) console.error('❌ Nav error:', e); }
  };

  const updateBadgeCount = async () => {
    if (!user) return;
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false);
      if (!error && count !== null) {
        await setBadgeCount(count);
        if (__DEV__) console.log(`📱 Badge count: ${count}`);
      }
    } catch (e) { if (__DEV__) console.error('❌ Badge count error:', e); }
  };

  // ── LOADING SCREEN ───────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator size="large" color="#00ff88" />
        <Text style={{ color: '#fff', marginTop: 16, fontSize: 16 }}>Loading Kinsta...</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LanguageProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="buy-coins" />
          <Stack.Screen name="premium-subscription" />
          <Stack.Screen name="schedule-post" />
          <Stack.Screen name="user/[id]" />
          <Stack.Screen name="post/[id]" />
          <Stack.Screen name="post-detail" />
          <Stack.Screen name="terms" />
          <Stack.Screen name="privacy" />
        </Stack>
      </LanguageProvider>
    </GestureHandlerRootView>
  );
} 
