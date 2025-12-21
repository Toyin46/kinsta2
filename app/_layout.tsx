// app/_layout.tsx - FIXED VERSION
import { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StripeProvider } from '@stripe/stripe-react-native';
import * as Notifications from 'expo-notifications';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/config/supabase';
import {
  registerForPushNotificationsAsync,
  setBadgeCount,
} from '@/utils/pushNotifications';

// Configure how notifications are handled when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function RootLayout() {
  const { initAuth, user } = useAuthStore();
  const router = useRouter();

  // Fix: Provide initial value (undefined) and correct type
  const notificationListener = useRef<Notifications.Subscription | undefined>(undefined);
  const responseListener = useRef<Notifications.Subscription | undefined>(undefined);

  // Initialize auth
  useEffect(() => {
    initAuth();
  }, []);

  // Setup push notifications when user logs in
  useEffect(() => {
    if (user) {
      setupNotifications();

      return () => {
        // Fix: Call remove() method on the subscription object
        notificationListener.current?.remove();
        responseListener.current?.remove();
      };
    }
  }, [user]);

  const setupNotifications = async () => {
    if (!user) return;

    try {
      // Register for push notifications
      await registerForPushNotificationsAsync(user.id);

      // Listen for notifications received while app is foregrounded
      notificationListener.current = Notifications.addNotificationReceivedListener(
        (notification: Notifications.Notification) => {
          console.log('📬 Notification received:', notification);
        
          // Update badge count
          updateBadgeCount();
        }
      );

      // Listen for user tapping on notifications
      responseListener.current = Notifications.addNotificationResponseReceivedListener(
        (response: Notifications.NotificationResponse) => {
          console.log('👆 Notification tapped:', response);
        
          const data = response.notification.request.content.data;
        
          // Navigate based on notification type
          handleNotificationNavigation(data);
        }
      );

      // Subscribe to real-time notification updates
      const channel = supabase
        .channel('notification-updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('🔔 Notification database update:', payload);
            updateBadgeCount();
          }
        )
        .subscribe();

      // Initial badge count update
      updateBadgeCount();

      // Cleanup function
      return () => {
        supabase.removeChannel(channel);
      };
    } catch (error) {
      console.error('Error setting up notifications:', error);
    }
  };

  const handleNotificationNavigation = (data: any) => {
    try {
      if (!data) return;

      // Navigate based on notification type
      switch (data.type) {
        case 'follow':
          // Navigate to user profile
          router.push(`/user/${data.fromUserId}` as any);
          break;
      
        case 'like':
        case 'comment':
        case 'coin':
        case 'mention':
          // Navigate to post
          if (data.postId) {
            // If you have a specific post detail screen, use it
            // router.push(`/post/${data.postId}` as any);
            // Otherwise, go to home feed
            router.push('/(tabs)' as any);
          }
          break;
      
        default:
          // Default to notifications tab
          router.push('/(tabs)/notifications' as any);
      }
    } catch (error) {
      console.error('Error navigating from notification:', error);
    }
  };

  const updateBadgeCount = async () => {
    if (!user) return;

    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false);

      if (error) throw error;

      if (count !== null) {
        await setBadgeCount(count);
        console.log(`📱 Badge count updated: ${count}`);
      }
    } catch (error) {
      console.error('Error updating badge count:', error);
    }
  };

  return (
    <StripeProvider
      publishableKey="pk_test_51ScyRkPu5ChQEBuHQs1pFcrxrpsU1hpThc5nS7SDS7ra50MwCS9IR12asT2bxWZ737mp2pkxNSidbyzqcwZ4xCDp00LIpaMvWk"
      merchantIdentifier="merchant.com.kinsta"
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="buy-coins" />
          <Stack.Screen name="premium-subscription" options={{ headerShown: false }} />
          <Stack.Screen name="schedule-post" options={{ headerShown: false }} />
          <Stack.Screen name="user/[id]" options={{ headerShown: false }} />
        </Stack>
      </GestureHandlerRootView>
    </StripeProvider>
  );
} 
	
