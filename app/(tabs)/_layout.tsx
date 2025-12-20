// app/(tabs)/_layout.tsx - FIXED VERSION
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { useEffect } from 'react';
import { Alert } from 'react-native';

export default function TabLayout() {
  const { user, initialized } = useAuthStore();
  const router = useRouter();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (initialized && !user) {
      router.replace('/(auth)/login');
    }
  }, [initialized, user]);

  // Don't render tabs until auth is initialized
  if (!initialized) {
    return null;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#667eea',
        tabBarInactiveTintColor: '#9ca3af',
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#e5e7eb',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search" size={size} color={color} />
          ),
        }}
      />
      
      <Tabs.Screen
        name="create"
        options={{
          title: 'Create',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="add-circle" size={size} color={color} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            // Prevent navigation if not logged in
            if (!user) {
              e.preventDefault();
              Alert.alert(
                'Login Required',
                'Please login to create posts',
                [
                  {
                    text: 'Go to Login',
                    onPress: () => router.replace('/(auth)/login'),
                  },
                  { text: 'Cancel' }
                ]
              );
            }
          },
        }}
      />
      
      <Tabs.Screen
        name="videos"
        options={{
          title: 'Videos',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="play-circle" size={size} color={color} />
          ),
        }}
      />
      
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
            // Prevent navigation if not logged in
            if (!user) {
              e.preventDefault();
              Alert.alert(
                'Login Required',
                'Please login to view your profile',
                [
                  {
                    text: 'Go to Login',
                    onPress: () => router.replace('/(auth)/login'),
                  },
                  { text: 'Cancel' }
                ]
              );
            }
          },
        }}
      />

      {/* Hide user-profile from tabs */}
      <Tabs.Screen
        name="user-profile"
        options={{
          href: null, // This hides it from the tab bar
        }}
      />
    </Tabs>
  );
}