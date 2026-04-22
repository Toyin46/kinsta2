import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../config/supabase';
import * as WebBrowser from 'expo-web-browser';

interface StripeConnectSetupProps {
  userId: string;
  userEmail: string;
  onComplete: () => void;
}

export const StripeConnectSetup: React.FC<StripeConnectSetupProps> = ({
  userId,
  userEmail,
  onComplete,
}) => {
  const [loading, setLoading] = useState(false);

  const startStripeConnect = async () => {
    setLoading(true);
    try {
      // Call Supabase function to create Stripe Connect account
      const { data, error } = await supabase.functions.invoke('create-connect-account', {
        body: {
          userId: userId,
          email: userEmail,
          country: 'US', // You can make this dynamic based on user location
        },
      });

      if (error) throw error;

      if (data?.onboardingUrl) {
        // Open Stripe onboarding in browser
        const result = await WebBrowser.openBrowserAsync(data.onboardingUrl);
        
        if (result.type === 'dismiss' || result.type === 'cancel') {
          // User closed the browser
          Alert.alert(
            'Setup Required',
            'Please complete the Stripe setup to enable payouts.',
            [{ text: 'OK' }]
          );
        }
        
        // After user returns, check their account status
        onComplete();
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to setup payout account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ padding: 20, backgroundColor: '#fff', borderRadius: 10 }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
        Setup Payout Account
      </Text>
      <Text style={{ fontSize: 14, color: '#666', marginBottom: 20 }}>
        You need to connect your payout account first. Please complete your Stripe Connect setup.
      </Text>
      
      <TouchableOpacity
        onPress={startStripeConnect}
        disabled={loading}
        style={{
          backgroundColor: loading ? '#ccc' : '#00D632',
          padding: 15,
          borderRadius: 8,
          alignItems: 'center',
        }}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
            Connect Stripe Account
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
};