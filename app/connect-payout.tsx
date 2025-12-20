// app/connect-payout.tsx - STRIPE ONLY VERSION
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator, Linking } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/config/supabase';
import { useRouter } from 'expo-router';

export default function ConnectPayoutScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeAccountId, setStripeAccountId] = useState('');

  useEffect(() => {
    loadPayoutMethod();
  }, []);

  const loadPayoutMethod = async () => {
    if (!user?.id) return;
    
    try {
      const { data } = await supabase
        .from('users')
        .select('stripe_account_id')
        .eq('id', user.id)
        .single();
      
      if (data) {
        setStripeAccountId(data.stripe_account_id || '');
        setStripeConnected(!!data.stripe_account_id);
      }
    } catch (error) {
      console.error('Error loading payout method:', error);
    } finally {
      setLoading(false);
    }
  };

  const connectStripe = async () => {
    Alert.alert(
      '🔵 Connect Stripe',
      'You will be redirected to Stripe to connect your bank account. This is secure and handled by Stripe.\n\nStripe supports bank accounts worldwide including Nigeria.',
      [
        {
          text: 'Continue',
          onPress: async () => {
            try {
              // In production, call your backend API
              // For now, show how it will work:
              Alert.alert(
                'Stripe Connect',
                'In production:\n\n1. You\'ll be redirected to Stripe\n2. Connect your bank account\n3. Verify your identity\n4. Start receiving payouts!\n\nFor testing, we\'ll simulate this is connected.',
                [
                  {
                    text: 'Simulate Connection',
                    onPress: async () => {
                      // Simulate connection for testing
                      const testAccountId = 'acct_test_' + Date.now();
                      await supabase
                        .from('users')
                        .update({ stripe_account_id: testAccountId })
                        .eq('id', user?.id);
                      
                      setStripeAccountId(testAccountId);
                      setStripeConnected(true);
                      
                      Alert.alert('✅ Connected', 'Stripe account connected successfully!');
                    }
                  },
                  { text: 'Cancel', style: 'cancel' }
                ]
              );
            } catch (error) {
              Alert.alert('Error', 'Failed to connect Stripe');
            }
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const disconnectStripe = async () => {
    Alert.alert(
      'Disconnect Stripe?',
      'Are you sure you want to disconnect your Stripe account?',
      [
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase
                .from('users')
                .update({ stripe_account_id: null })
                .eq('id', user?.id);
              
              setStripeAccountId('');
              setStripeConnected(false);
              
              Alert.alert('Disconnected', 'Stripe account disconnected');
            } catch (error) {
              Alert.alert('Error', 'Could not disconnect');
            }
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const openStripeInfo = () => {
    Linking.openURL('https://stripe.com/connect');
  };

  if (loading) {
    return (
      <View style={s.container}>
        <ActivityIndicator size="large" color="#00ff88" />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Payout Method</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView>
        <View style={s.content}>
          <Text style={s.subtitle}>
            Connect Stripe to receive your earnings directly to your bank account
          </Text>

          {/* Stripe Card */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={s.cardIcon}>
                <MaterialCommunityIcons name="stripe" size={40} color="#635bff" />
              </View>
              <View style={s.cardInfo}>
                <Text style={s.cardTitle}>Stripe</Text>
                <Text style={s.cardDesc}>
                  {stripeConnected ? 'Connected ✓' : 'Direct bank transfers worldwide'}
                </Text>
              </View>
              {stripeConnected && (
                <Feather name="check-circle" size={24} color="#00ff88" />
              )}
            </View>

            {stripeConnected ? (
              <View style={s.connectedInfo}>
                <Text style={s.connectedText}>
                  ✅ Bank account connected via Stripe
                </Text>
                <Text style={s.connectedSubtext}>
                  You can now withdraw your earnings
                </Text>
                <TouchableOpacity style={s.disconnectBtn} onPress={disconnectStripe}>
                  <Text style={s.disconnectText}>Disconnect</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={s.connectBtn} onPress={connectStripe}>
                <Text style={s.connectText}>Connect Stripe</Text>
              </TouchableOpacity>
            )}

            <View style={s.features}>
              <Text style={s.featuresTitle}>Why Stripe?</Text>
              <View style={s.feature}>
                <Feather name="check" size={16} color="#00ff88" />
                <Text style={s.featureText}>Works in Nigeria & 45+ countries</Text>
              </View>
              <View style={s.feature}>
                <Feather name="check" size={16} color="#00ff88" />
                <Text style={s.featureText}>Fast payouts (24-48 hours)</Text>
              </View>
              <View style={s.feature}>
                <Feather name="check" size={16} color="#00ff88" />
                <Text style={s.featureText}>Secure & verified by millions</Text>
              </View>
              <View style={s.feature}>
                <Feather name="check" size={16} color="#00ff88" />
                <Text style={s.featureText}>Direct to your bank account</Text>
              </View>
              <View style={s.feature}>
                <Feather name="check" size={16} color="#00ff88" />
                <Text style={s.featureText}>No hidden fees</Text>
              </View>
            </View>

            <TouchableOpacity style={s.learnMore} onPress={openStripeInfo}>
              <Text style={s.learnMoreText}>Learn more about Stripe Connect</Text>
              <Feather name="external-link" size={16} color="#635bff" />
            </TouchableOpacity>
          </View>

          {/* Info Box */}
          <View style={s.infoBox}>
            <Feather name="info" size={20} color="#00aaff" />
            <View style={s.infoContent}>
              <Text style={s.infoText}>
                Stripe is the world's leading payment processor, trusted by millions of businesses worldwide.
              </Text>
              <Text style={[s.infoText, { marginTop: 8 }]}>
                Your earnings are transferred directly to your bank account. You keep 70% of all earnings.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 60 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  content: { padding: 20 },
  subtitle: { fontSize: 14, color: '#999', marginBottom: 24, lineHeight: 20 },
  card: { backgroundColor: '#0a0a0a', borderRadius: 16, padding: 20, marginBottom: 20, borderWidth: 2, borderColor: '#635bff' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  cardIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(99,91,255,0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  cardDesc: { fontSize: 14, color: '#999' },
  connectBtn: { backgroundColor: '#635bff', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 20 },
  connectText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  connectedInfo: { backgroundColor: 'rgba(0,255,136,0.1)', padding: 16, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: '#00ff88' },
  connectedText: { fontSize: 16, fontWeight: '600', color: '#00ff88', marginBottom: 4 },
  connectedSubtext: { fontSize: 13, color: '#999', marginBottom: 12 },
  disconnectBtn: { alignSelf: 'flex-start', marginTop: 8 },
  disconnectText: { fontSize: 14, color: '#ff4444', fontWeight: '600' },
  features: { marginBottom: 16 },
  featuresTitle: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 12 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  featureText: { fontSize: 14, color: '#999' },
  learnMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  learnMoreText: { fontSize: 14, color: '#635bff', fontWeight: '600' },
  infoBox: { flexDirection: 'row', backgroundColor: 'rgba(0,170,255,0.1)', padding: 16, borderRadius: 12, gap: 12, borderWidth: 1, borderColor: 'rgba(0,170,255,0.2)' },
  infoContent: { flex: 1 },
  infoText: { fontSize: 13, color: '#00aaff', lineHeight: 18 },
});