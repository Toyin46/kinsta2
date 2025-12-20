// admin/distribute-revenue.tsx - ADMIN PANEL
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/config/supabase';

export default function AdminDistributeRevenue() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState('');
  const [revenueData, setRevenueData] = useState<any>(null);

  useEffect(() => {
    loadCurrentMonth();
  }, []);

  const loadCurrentMonth = async () => {
    const date = new Date();
    const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
    setCurrentMonth(monthStr);

    try {
      const { data } = await supabase
        .from('ad_revenue_pools')
        .select('*')
        .eq('month', monthStr)
        .single();

      setRevenueData(data);
    } catch (error) {
      console.error('Error loading revenue data:', error);
    }
  };

  const handleUpdateRevenue = async (totalRevenue: number) => {
    try {
      const userPool = totalRevenue * 0.50; // 50%
      const creatorFund = totalRevenue * 0.10; // 10%
      const platformShare = totalRevenue * 0.40; // 40%

      const { error } = await supabase
        .from('ad_revenue_pools')
        .upsert({
          month: currentMonth,
          total_revenue: totalRevenue,
          user_pool: userPool,
          creator_fund: creatorFund,
          platform_share: platformShare,
        });

      if (error) throw error;

      Alert.alert('Success', 'Revenue updated!');
      loadCurrentMonth();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleDistributeRevenue = async () => {
    if (!revenueData || revenueData.distributed) {
      Alert.alert('Error', 'Revenue already distributed or no data');
      return;
    }

    Alert.alert(
      'Distribute Revenue?',
      `This will distribute $${revenueData.user_pool.toFixed(2)} to all users based on engagement points.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Distribute',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              // Call the distribution function
              const { error } = await supabase.rpc('distribute_monthly_ad_revenue', {
                month_param: currentMonth,
              });

              if (error) throw error;

              Alert.alert('Success', 'Revenue distributed to all users!');
              loadCurrentMonth();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#00ff88" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin: Distribute Revenue</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current Month</Text>
          <Text style={styles.cardValue}>{currentMonth}</Text>
        </View>

        {revenueData ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Total Ad Revenue</Text>
              <Text style={styles.cardValue}>${revenueData.total_revenue.toFixed(2)}</Text>
            </View>

            <View style={styles.breakdown}>
              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>User Pool (50%)</Text>
                <Text style={styles.breakdownValue}>${revenueData.user_pool.toFixed(2)}</Text>
              </View>

              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>Creator Fund (10%)</Text>
                <Text style={styles.breakdownValue}>${revenueData.creator_fund.toFixed(2)}</Text>
              </View>

              <View style={styles.breakdownItem}>
                <Text style={styles.breakdownLabel}>Platform (40%)</Text>
                <Text style={styles.breakdownValue}>${revenueData.platform_share.toFixed(2)}</Text>
              </View>
            </View>

            <View style={styles.status}>
              <Text style={styles.statusLabel}>Status:</Text>
              <Text style={[styles.statusValue, revenueData.distributed && styles.statusDistributed]}>
                {revenueData.distributed ? 'DISTRIBUTED' : 'PENDING'}
              </Text>
            </View>

            {!revenueData.distributed && (
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleDistributeRevenue}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.buttonText}>Distribute Revenue</Text>
                )}
              </TouchableOpacity>
            )}
          </>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No revenue data for this month</Text>
          </View>
        )}

        <View style={styles.quickActions}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleUpdateRevenue(1500)}
          >
            <Text style={styles.actionText}>Set Revenue: $1,500</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleUpdateRevenue(5000)}
          >
            <Text style={styles.actionText}>Set Revenue: $5,000</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleUpdateRevenue(10000)}
          >
            <Text style={styles.actionText}>Set Revenue: $10,000</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  content: { padding: 20 },
  card: { backgroundColor: '#0a0a0a', padding: 24, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#00ff88' },
  cardTitle: { fontSize: 14, color: '#999', marginBottom: 8 },
  cardValue: { fontSize: 32, fontWeight: 'bold', color: '#00ff88' },
  breakdown: { backgroundColor: '#0a0a0a', padding: 20, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: '#1a1a1a' },
  breakdownItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  breakdownLabel: { fontSize: 16, color: '#999' },
  breakdownValue: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  status: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a0a0a', padding: 20, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: '#1a1a1a', justifyContent: 'space-between' },
  statusLabel: { fontSize: 16, color: '#999' },
  statusValue: { fontSize: 18, fontWeight: 'bold', color: '#ffd700' },
  statusDistributed: { color: '#00ff88' },
  button: { backgroundColor: '#00ff88', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginBottom: 20 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontSize: 16, fontWeight: 'bold', color: '#000' },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#666' },
  quickActions: { marginTop: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 16 },
  actionButton: { backgroundColor: '#1a1a1a', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#333' },
  actionText: { fontSize: 16, color: '#00ff88', textAlign: 'center', fontWeight: '600' },
});
	
