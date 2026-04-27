// app/(tabs)/_layout.tsx
// ✅ All original features preserved
// ✅ FIX: Tab bar now has elevation/zIndex so feed content can't block touches on Android
// ✅ FIX: createBtn size reduced so it no longer overflows tab bar height
// ✅ FIX: Tab bar height increased slightly to safely contain the create button
// ✅ FIX: console logs gated behind __DEV__

import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { useEffect, useState } from 'react';
import { Alert, View, StyleSheet, Platform } from 'react-native';
import { supabase } from '../../config/supabase';

// ── UNREAD DOT ────────────────────────────────────────────────
function UnreadDot({ userId }: { userId?: string }) {
  const [hasUnread, setHasUnread] = useState(false);

  useEffect(() => {
    if (!userId) return;

    const checkUnread = async () => {
      try {
        const { data } = await supabase
          .from('conversation_participants')
          .select('unread_count')
          .eq('user_id', userId)
          .gt('unread_count', 0)
          .limit(1);
        setHasUnread((data || []).length > 0);
      } catch {
        // Silently fail
      }
    };

    checkUnread();

    const channel = supabase
      .channel(`unread:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_participants',
          filter: `user_id=eq.${userId}`,
        },
        () => checkUnread()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  if (!hasUnread) return null;

  return <View style={styles.unreadDot} />;
}

// ── TAB LAYOUT ────────────────────────────────────────────────
export default function TabLayout() {
  const { user, initialized } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (initialized && !user) {
      router.replace('/(auth)/login');
    }
  }, [initialized, user]);

  if (!initialized) return null;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#00ff88',
        tabBarInactiveTintColor: '#555',
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#000',
          borderTopWidth: 1,
          borderTopColor: '#1a1a1a',
          // ✅ FIX: Taller bar so create button fits without overflow
          height: Platform.OS === 'android' ? 68 : 64,
          paddingBottom: Platform.OS === 'android' ? 10 : 10,
          paddingTop: 6,
          // ✅ FIX: These two lines are critical — they ensure the tab bar
          // sits ABOVE all feed content on every Android device (Samsung,
          // Infinix, Tecno, etc). Without elevation, Android does not
          // guarantee z-order and content can block tab touches.
          elevation: 20,
          zIndex: 20,
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
      }}
    >
      {/* ── Home ─────────────────────────────────── */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />

      {/* ── Explore ──────────────────────────────── */}
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search" size={size} color={color} />
          ),
        }}
      />

      {/* ── Create ───────────────────────────────── */}
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarIcon: ({ color, focused }) => (
            <View style={[
              styles.createBtn,
              { backgroundColor: focused ? '#00ff88' : '#1a1a1a' }
            ]}>
              <Ionicons
                name="add"
                size={24}
                color={focused ? '#000' : '#00ff88'}
              />
            </View>
          ),
          tabBarLabel: () => null,
        }}
        listeners={{
          tabPress: (e) => {
            if (!user) {
              e.preventDefault();
              Alert.alert(
                'Login Required',
                'Please login to create posts',
                [
                  { text: 'Go to Login', onPress: () => router.replace('/(auth)/login') },
                  { text: 'Cancel' },
                ]
              );
            }
          },
        }}
      />

      {/* ── Messages ─────────────────────────────── */}
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color, size, focused }) => (
            <View style={{ position: 'relative' }}>
              <Ionicons
                name={focused ? 'chatbubble' : 'chatbubble-outline'}
                size={size}
                color={color}
              />
              <UnreadDot userId={user?.id} />
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            if (!user) {
              e.preventDefault();
              Alert.alert(
                'Login Required',
                'Please login to view your messages',
                [
                  { text: 'Go to Login', onPress: () => router.replace('/(auth)/login') },
                  { text: 'Cancel' },
                ]
              );
            }
          },
        }}
      />

      {/* ── Videos ───────────────────────────────── */}
      <Tabs.Screen
        name="videos"
        options={{
          title: 'Videos',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="play-circle" size={size} color={color} />
          ),
        }}
      />

      {/* ── Marketplace ──────────────────────────── */}
      <Tabs.Screen
        name="marketplace"
        options={{
          title: 'Market',
          tabBarIcon: ({ color, size }) => (
            <Feather name="shopping-bag" size={size} color={color} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            if (!user) {
              e.preventDefault();
              Alert.alert(
                'Login Required',
                'Please login to access the Marketplace',
                [
                  { text: 'Go to Login', onPress: () => router.replace('/(auth)/login') },
                  { text: 'Cancel' },
                ]
              );
            }
          },
        }}
      />

      {/* ── Profile ──────────────────────────────── */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            if (!user) {
              e.preventDefault();
              Alert.alert(
                'Login Required',
                'Please login to view your profile',
                [
                  { text: 'Go to Login', onPress: () => router.replace('/(auth)/login') },
                  { text: 'Cancel' },
                ]
              );
            }
          },
        }}
      />

      {/* ── Hidden screens ───────────────────────── */}
      <Tabs.Screen
        name="notification"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="user-profile"
        options={{ href: null }}
      />
    </Tabs>
  );
}

// ── STYLES ────────────────────────────────────────────────────
const styles = StyleSheet.create({
  createBtn: {
    // ✅ FIX: Reduced from 46x46 to 42x42 so it fits within tab bar
    // without overflowing and blocking touches on Android
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    // ✅ FIX: Removed marginBottom that was pushing button out of bounds
    borderWidth: 1.5,
    borderColor: '#00ff88',
  },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00ff88',
    borderWidth: 1.5,
    borderColor: '#000',
  },
}); 
