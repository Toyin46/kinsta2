// app/buy-coins.tsx - SIMPLE VERSION WITHOUT PAYSTACK
// Use this for testing, add Paystack later

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/config/supabase';

const COIN_PACKAGES = [
  { coins: 1, price: 1000, label: '1 Coin', popular: false },
  { coins: 5, price: 5000, label: '5 Coins', popular: true },
  { coins: 10, price: 10000, label: '10 Coins', popular: false },
  { coins: 25, price: 25000, label: '25 Coins', popular: false },
  { coins: 50, price: 50000, label: '50 Coins', popular: false },
  { coins: 100, price: 100000, label: '100 Coins', popular: false },
];

export default function BuyCoinsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [selectedPackage, setSelectedPackage] = useState(COIN_PACKAGES[1]);
  const [processing, setProcessing] = useState(false);

  const formatNaira = (amount: number) => `₦${amount.toLocaleString('en-NG')}`;

  const handlePackageSelect = (pkg: typeof COIN_PACKAGES[0]) => {
    setSelectedPackage(pkg);
  };

  const handleBuyCoins = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'User not found');
      return;
    }

    // FOR TESTING: Simulate payment without Paystack
    Alert.alert(
      '🧪 Test Mode',
      `This is a TEST purchase. No real money will be charged.\n\nYou will receive ${selectedPackage.coins} coins for free.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Get Test Coins',
          onPress: async () => {
            setProcessing(true);
            try {
              // Add coins to user account
              await supabase.from('transactions').insert({
                user_id: user.id,
                type: 'purchased',
                amount: selectedPackage.coins,
                description: `TEST: Purchased ${selectedPackage.coins} coins for ${formatNaira(selectedPackage.price)}`,
                payment_reference: `TEST-${Date.now()}`,
                payment_method: 'test_mode',
              });

              Alert.alert(
                '🎉 Success!',
                `You received ${selectedPackage.coins} coins!\n\n(Test Mode - No charge)`,
                [{ text: 'OK', onPress: () => router.back() }]
              );
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to add coins');
            } finally {
              setProcessing(false);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Test Mode Banner */}
      <View style={styles.testBanner}>
        <Text style={styles.testText}>🧪 TEST MODE - Free coins for testing</Text>
      </View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Buy Coins</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Info Card */}
        <View style={styles.infoCard}>
          <MaterialCommunityIcons name="information" size={24} color="#00ff88" />
          <Text style={styles.infoText}>
            1 Coin = ₦1,000 • Use coins to send gifts, support creators, and unlock premium content
          </Text>
        </View>

        {/* Packages */}
        <View style={styles.packages}>
          {COIN_PACKAGES.map((pkg) => (
            <TouchableOpacity
              key={pkg.coins}
              style={[
                styles.package,
                selectedPackage.coins === pkg.coins && styles.packageSelected,
              ]}
              onPress={() => handlePackageSelect(pkg)}
            >
              {pkg.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>POPULAR</Text>
                </View>
              )}
              <MaterialCommunityIcons
                name="diamond"
                size={40}
                color={selectedPackage.coins === pkg.coins ? '#ffd700' : '#666'}
              />
              <Text style={styles.packageCoins}>{pkg.coins} Coins</Text>
              <Text style={styles.packagePrice}>{formatNaira(pkg.price)}</Text>
              {selectedPackage.coins === pkg.coins && (
                <Feather name="check-circle" size={24} color="#00ff88" style={styles.checkIcon} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Selected Package Summary */}
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Selected Package:</Text>
            <Text style={styles.summaryValue}>{selectedPackage.label}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total Amount:</Text>
            <Text style={styles.summaryValue}>{formatNaira(selectedPackage.price)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Test Mode:</Text>
            <Text style={[styles.summaryValue, { color: '#ffd700' }]}>FREE</Text>
          </View>
        </View>

        {/* Buy Button */}
        <TouchableOpacity
          style={styles.buyButton}
          onPress={handleBuyCoins}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <MaterialCommunityIcons name="gift" size={24} color="#000" />
              <Text style={styles.buyButtonText}>Get Test Coins</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Test Mode Notice */}
        <View style={styles.testNotice}>
          <Feather name="info" size={20} color="#ffd700" />
          <Text style={styles.testNoticeText}>
            This is TEST MODE. Coins are free for testing. In production, you'll integrate Paystack for real payments.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  testBanner: {
    backgroundColor: '#ffd700',
    padding: 12,
    alignItems: 'center'
  },
  testText: { fontSize: 12, fontWeight: 'bold', color: '#000' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#0a0a0a',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00ff88',
    gap: 12
  },
  infoText: { flex: 1, fontSize: 14, color: '#fff', lineHeight: 20 },
  packages: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 12
  },
  package: {
    width: '31%',
    aspectRatio: 1,
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#1a1a1a',
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  packageSelected: {
    borderColor: '#00ff88',
    backgroundColor: '#001a0a'
  },
  popularBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#ffd700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  popularText: { fontSize: 8, fontWeight: 'bold', color: '#000' },
  packageCoins: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginTop: 8 },
  packagePrice: { fontSize: 14, color: '#00ff88', marginTop: 4 },
  checkIcon: { position: 'absolute', top: 8, left: 8 },
  summary: {
    backgroundColor: '#0a0a0a',
    margin: 20,
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a'
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  summaryLabel: { fontSize: 16, color: '#999' },
  summaryValue: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  buyButton: {
    flexDirection: 'row',
    backgroundColor: '#00ff88',
    marginHorizontal: 20,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  buyButtonText: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  testNotice: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,215,0,0.1)',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  testNoticeText: { flex: 1, fontSize: 13, color: '#ffd700', lineHeight: 20 },
}); 
	
