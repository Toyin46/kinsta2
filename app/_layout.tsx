// app/_layout.tsx
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StripeProvider } from '@stripe/stripe-react-native';
import { useAuthStore } from '@/store/authStore';

export default function RootLayout() {
  const { initAuth } = useAuthStore();

  useEffect(() => {
    initAuth();
  }, []);

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
      {/* ... other routes ... */}
        </Stack>
      </GestureHandlerRootView>
    </StripeProvider>
  );
}
	
