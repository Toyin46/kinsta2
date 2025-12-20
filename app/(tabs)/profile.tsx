// app/(tabs)/profile.tsx - COMPLETE WITH NAIRA
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, ActivityIndicator, RefreshControl, Modal, FlatList, Dimensions, Share, TextInput } from 'react-native';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/config/supabase';
import { useRouter } from 'expo-router';

const { width } = Dimensions.get('window');
const POST_SIZE = (width - 6) / 3;
const TESTING_MODE = true;
const CREATOR_PERCENTAGE = 0.70;
const PLATFORM_FEE = 0.30;
const COIN_TO_NAIRA = 1000; // 1 coin = ₦1,000

// Helper functions for Naira
const coinsToNaira = (coins: number): number => coins * COIN_TO_NAIRA;
const nairaToCoins = (naira: number): number => naira / COIN_TO_NAIRA;
const formatNaira = (amount: number): string => `₦${amount.toLocaleString('en-NG')}`;

export default function ProfileScreen() {
  const { userProfile, user, logout } = useAuthStore();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [walletVisible, setWalletVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [followersVisible, setFollowersVisible] = useState(false);
  const [followingVisible, setFollowingVisible] = useState(false);
  const [profilePicVisible, setProfilePicVisible] = useState(false);
  const [withdrawModalVisible, setWithdrawModalVisible] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [followers, setFollowers] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [loadingFollow, setLoadingFollow] = useState(false);
  const [withdrawalRequests, setWithdrawalRequests] = useState<any[]>([]);
  const [coins, setCoins] = useState(0);
  const [stats, setStats] = useState({ posts_count: 0, followers_count: 0, following_count: 0, likes_received: 0 });
  const [canWithdraw, setCanWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [stripeConnected, setStripeConnected] = useState(false);
  
  const [isSubscriptionCreator, setIsSubscriptionCreator] = useState(false);
  const [subscriptionEnabled, setSubscriptionEnabled] = useState(false);

  useEffect(() => { 
    if (user?.id) { 
      loadAllData(); 
      setupRealtimeListener(); 
    }
  }, [user?.id]);

  const loadAllData = async () => {
    await Promise.all([
      loadUserCoins(), 
      loadUserStats(), 
      loadUserPosts(), 
      checkCreatorTier(), 
      loadWithdrawalRequests(),
      checkSubscriptionStatus(),
      checkPayoutMethods(),
    ]);
  };

  const setupRealtimeListener = () => {
    if (!user?.id) return;
    const ch1 = supabase.channel('user-updates').on('postgres_changes', { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'users', 
      filter: `id=eq.${user.id}` 
    }, () => { 
      loadUserCoins(); 
      loadUserStats(); 
      checkCreatorTier();
      checkSubscriptionStatus();
      checkPayoutMethods();
    }).subscribe();
    
    const ch2 = supabase.channel('tx-updates').on('postgres_changes', { 
      event: '*', 
      schema: 'public', 
      table: 'transactions', 
      filter: `user_id=eq.${user.id}` 
    }, () => { 
      loadUserCoins(); 
      if (walletVisible) loadTransactions(); 
    }).subscribe();
    
    return () => { 
      supabase.removeChannel(ch1); 
      supabase.removeChannel(ch2); 
    };
  };

  const checkSubscriptionStatus = async () => {
    if (!user?.id) return;
    
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('is_subscription_creator')
        .eq('id', user.id)
        .single();
      
      if (userData) {
        setIsSubscriptionCreator(userData.is_subscription_creator || false);
      }

      const { data: subData } = await supabase
        .from('creator_subscriptions')
        .select('is_enabled')
        .eq('creator_id', user.id)
        .single();
      
      if (subData) {
        setSubscriptionEnabled(subData.is_enabled || false);
      }
    } catch (error) {
      console.error('Error checking subscription status:', error);
    }
  };

  const checkPayoutMethods = async () => {
    if (!user?.id) return;
    
    try {
      const { data } = await supabase
        .from('users')
        .select('account_number, bank_name')
        .eq('id', user.id)
        .single();
      
      if (data) {
        setStripeConnected(!!(data.account_number && data.bank_name));
      }
    } catch (error) {
      console.error('Error checking payout methods:', error);
    }
  };

  const loadUserCoins = async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase
        .from('transactions')
        .select('type, amount')
        .eq('user_id', user.id);
      
      let bal = 0;
      if (data) {
        data.forEach((tx: any) => { 
          if (tx.type === 'received' || tx.type === 'purchased' || tx.type === 'ad_revenue') {
            bal += tx.amount;
          } else if (tx.type === 'spent') {
            bal -= tx.amount;
          }
        });
      }
      
      setCoins(bal);
      
      await supabase
        .from('users')
        .update({ coins: bal })
        .eq('id', user.id);
    } catch (e) { 
      console.error('Error loading coins:', e); 
    }
  };

  const checkCreatorTier = async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase
        .from('users')
        .select('can_withdraw')
        .eq('id', user.id)
        .single();
      
      if (data) { 
        setCanWithdraw(data.can_withdraw || false); 
      }
    } catch (e) { 
      console.error('Error checking tier:', e); 
    }
  };

  const loadUserStats = async () => {
    if (!user?.id) return;
    try {
      const { count: pc } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      
      const { count: flc } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', user.id);
      
      const { count: fgc } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', user.id);
      
      const { data: up } = await supabase
        .from('posts')
        .select('id')
        .eq('user_id', user.id);
      
      let lks = 0;
      if (up && up.length > 0) { 
        const { count } = await supabase
          .from('likes')
          .select('*', { count: 'exact', head: true })
          .in('post_id', up.map(p => p.id)); 
        lks = count || 0; 
      }
      
      setStats({ 
        posts_count: pc || 0, 
        followers_count: flc || 0, 
        following_count: fgc || 0, 
        likes_received: lks 
      });
    } catch (e) { 
      console.error('Error loading stats:', e); 
    }
  };

  const loadUserPosts = async () => {
    if (!user?.id) return;
    setLoadingPosts(true);
    try {
      const { data } = await supabase
        .from('posts')
        .select('id, caption, media_url, likes_count, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      setUserPosts(data || []);
    } catch (e) { 
      console.error('Error loading posts:', e); 
    } finally { 
      setLoadingPosts(false); 
    }
  };

  const loadFollowers = async () => {
    if (!user?.id) return;
    setLoadingFollow(true);
    try {
      const { data } = await supabase
        .from('follows')
        .select(`
          follower_id,
          users!follows_follower_id_fkey (
            id, username, display_name, avatar_url
          )
        `)
        .eq('following_id', user.id)
        .limit(50);
      
      setFollowers(data?.map((f: any) => f.users) || []);
    } catch (e) { 
      console.error('Error loading followers:', e); 
    } finally { 
      setLoadingFollow(false); 
    }
  };

  const loadFollowing = async () => {
    if (!user?.id) return;
    setLoadingFollow(true);
    try {
      const { data } = await supabase
        .from('follows')
        .select(`
          following_id,
          users!follows_following_id_fkey (
            id, username, display_name, avatar_url
          )
        `)
        .eq('follower_id', user.id)
        .limit(50);
      
      setFollowing(data?.map((f: any) => f.users) || []);
    } catch (e) { 
      console.error('Error loading following:', e); 
    } finally { 
      setLoadingFollow(false); 
    }
  };

  const loadTransactions = async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      
      setTransactions(data || []);
    } catch (e) { 
      console.error('Error loading transactions:', e); 
    }
  };

  const loadWithdrawalRequests = async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      
      setWithdrawalRequests(data || []);
    } catch (e) { 
      console.error('Error loading withdrawals:', e); 
    }
  };

  const onRefresh = async () => { 
    setRefreshing(true); 
    await loadAllData(); 
    setRefreshing(false); 
  };

  const handleLogout = async () => { 
    try { 
      await supabase.auth.signOut(); 
      if (logout) logout(); 
      router.replace('/(auth)/login'); 
    } catch (e: any) { 
      Alert.alert('Error', 'Failed to logout'); 
    }
  };

  const handleEditProfile = () => { 
    setSettingsVisible(false); 
    try { 
      router.push('/profile-edit'); 
    } catch { 
      Alert.alert('Coming Soon', 'Profile editing is being updated'); 
    }
  };

  const handleFollowersPress = () => { 
    loadFollowers(); 
    setFollowersVisible(true); 
  };

  const handleFollowingPress = () => { 
    loadFollowing(); 
    setFollowingVisible(true); 
  };

  const handleWalletPress = () => { 
    loadTransactions(); 
    loadUserCoins(); 
    loadWithdrawalRequests(); 
    setWalletVisible(true); 
  };

  const handleShareProfile = async () => { 
    try { 
      await Share.share({ 
        message: `Check out ${userProfile?.display_name}'s profile on Kinsta! @${userProfile?.username}` 
      }); 
    } catch (e) { }
  };

  const handleBuyCoins = () => { 
    setWalletVisible(false); 
    try { 
      router.push('/buy-coins'); 
    } catch { 
      Alert.alert('Error', 'Could not open Buy Coins'); 
    }
  };

  const handlePremiumPress = () => {
    try {
      router.push('/premium-subscription');
    } catch {
      Alert.alert('Error', 'Could not open Premium');
    }
  };

  const handleCreatorSubscriptionPress = () => {
    try {
      if (subscriptionEnabled) {
        router.push('/subscription-wallet');
      } else {
        router.push('/apply-subscriptions');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not open creator subscriptions');
    }
  };

  const handleConnectPayoutPress = () => {
    try {
      router.push('./connect-bank');
    } catch {
      Alert.alert('Info', 'Connect your bank account to enable withdrawals');
    }
  };

  const handleWithdrawPress = () => {
    if (!TESTING_MODE && !canWithdraw) { 
      Alert.alert('Cannot Withdraw', 'You need 500+ followers to withdraw.'); 
      return; 
    }
    
    const balNaira = coinsToNaira(coins);
    const minWithdrawal = 10000; // ₦10,000
    
    if (balNaira < minWithdrawal) { 
      Alert.alert('Minimum Withdrawal', `Need at least ₦10,000. Your balance: ${formatNaira(balNaira)}`); 
      return; 
    }

    if (!stripeConnected) {
      Alert.alert(
        'Connect Bank Account',
        'You need to connect your bank account first.',
        [
          {
            text: 'Connect Now',
            onPress: handleConnectPayoutPress
          },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
      return;
    }
    
    setWithdrawAmount(''); 
    setWithdrawModalVisible(true);
  };

  const processWithdrawal = async () => {
    const amt = parseFloat(withdrawAmount);
    
    if (isNaN(amt) || amt < 10000) { 
      Alert.alert('Invalid', 'Minimum ₦10,000'); 
      return; 
    }
    
    const balNaira = coinsToNaira(coins);
    
    if (amt > balNaira) { 
      Alert.alert('Insufficient', `Only ${formatNaira(balNaira)} available`); 
      return; 
    }
    
    const cGets = amt * CREATOR_PERCENTAGE;
    const pFee = amt * PLATFORM_FEE;
    const cDed = nairaToCoins(amt);
    
    try {
      await supabase.from('transactions').insert({ 
        user_id: user?.id, 
        type: 'spent', 
        amount: cDed, 
        description: `Withdrawal: ${formatNaira(amt)} (Receive: ${formatNaira(cGets)})` 
      });
      
      await supabase.from('withdrawal_requests').insert({ 
        user_id: user?.id, 
        amount: cGets, 
        original_amount: amt, 
        platform_fee: pFee, 
        payment_method: 'bank_transfer',
        status: 'pending',
        coins_deducted: cDed,
      });
      
      setWithdrawModalVisible(false);
      
      Alert.alert(
        '✅ Withdrawal Requested!', 
        `Amount: ${formatNaira(amt)}\nYou'll Get: ${formatNaira(cGets)} (70%)\nPlatform Fee: ${formatNaira(pFee)} (30%)\n\nStatus: PENDING\n\nWe'll process this within 24-48 hours.`
      );
      
      await loadUserCoins(); 
      await loadWithdrawalRequests();
    } catch (e: any) { 
      Alert.alert('Error', e.message || 'Failed to process withdrawal'); 
    }
  };

  const handlePostPress = (post: any) => {
    try { 
      router.push(`/post-detail?id=${post.id}` as any); 
    } catch {
      Alert.alert('Error', 'Could not open post');
    }
  };

  const handleUserPress = (userId: string) => {
    if (userId === user?.id) return;
    
    try {
      router.push(`/user/${userId}` as any);
    } catch (error) {
      Alert.alert('Error', 'Could not open profile');
    }
  };

  const handleSponsorApp = () => {
    Alert.alert(
      '💝 Support Kinsta',
      'Thank you for considering supporting Kinsta! Your support helps keep the app running and improves the experience for everyone.\n\nYou can support by sending coins.',
      [
        {
          text: 'Send Coins',
          onPress: () => {
            Alert.alert(
              '💎 Send Coins',
              'Choose amount to support Kinsta:',
              [
                { text: '1 Coin (₦1,000)', onPress: () => processSponsorshipCoins(1) },
                { text: '5 Coins (₦5,000)', onPress: () => processSponsorshipCoins(5) },
                { text: '10 Coins (₦10,000)', onPress: () => processSponsorshipCoins(10) },
                { text: 'Cancel', style: 'cancel' }
              ]
            );
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const processSponsorshipCoins = async (amount: number) => {
    const balCoins = coins;
    
    if (balCoins < amount) {
      Alert.alert(
        'Insufficient Coins',
        `You need ${amount} coins. Your balance: ${balCoins.toFixed(2)} coins`,
        [
          { text: 'Buy Coins', onPress: handleBuyCoins },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
      return;
    }

    const nairaAmount = coinsToNaira(amount);

    Alert.alert(
      'Confirm Sponsorship',
      `Send ${amount} coins (${formatNaira(nairaAmount)}) to support Kinsta?`,
      [
        {
          text: 'Confirm',
          onPress: async () => {
            try {
              await supabase.from('transactions').insert({
                user_id: user?.id,
                type: 'spent',
                amount: amount,
                description: `Sponsored Kinsta: ${amount} coins`
              });

              await supabase.from('sponsorships').insert({
                user_id: user?.id,
                amount: amount,
                type: 'coins',
                status: 'completed'
              });

              await loadUserCoins();

              Alert.alert(
                '🎉 Thank You!',
                `Your sponsorship of ${amount} coins has been received! Thank you for supporting Kinsta! 💚`
              );
            } catch (error) {
              Alert.alert('Error', 'Could not process sponsorship');
            }
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const getTxColor = (t: string) => (t === 'received' || t === 'purchased' || t === 'ad_revenue') ? '#00ff88' : '#ff4444';
  const getWdColor = (s: string) => ({ completed: '#00ff88', pending: '#ffd700', processing: '#00aaff', rejected: '#ff4444' }[s] || '#666');

  if (!userProfile) {
    return (
      <View style={s.container}>
        <ActivityIndicator size="large" color="#00ff88" />
      </View>
    );
  }

  const balNaira = coinsToNaira(coins);

  return (
    <View style={s.container}>
      {TESTING_MODE && (
        <View style={s.testBanner}>
          <Text style={s.testText}>🧪 TEST MODE</Text>
        </View>
      )}
      
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            tintColor="#00ff88" 
          />
        }
      >
        <View style={s.header}>
          <Text style={s.headerTitle}>Profile</Text>
          <TouchableOpacity onPress={() => setSettingsVisible(true)}>
            <Feather name="menu" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={s.profile}>
          <View style={s.topRow}>
            <TouchableOpacity 
              onPress={() => userProfile.avatar_url && setProfilePicVisible(true)}
            >
              {userProfile.avatar_url ? (
                <Image source={{ uri: userProfile.avatar_url }} style={s.avatar} />
              ) : (
                <View style={[s.avatar, s.avatarPh]}>
                  <Feather name="user" size={32} color="#00ff88" />
                </View>
              )}
            </TouchableOpacity>
            
            <View style={s.statsRow}>
              <View style={s.stat}>
                <Text style={s.statNum}>{stats.likes_received}</Text>
                <Text style={s.statLbl}>Likes</Text>
              </View>
              
              <TouchableOpacity style={s.stat} onPress={handleFollowersPress}>
                <Text style={s.statNum}>{stats.followers_count}</Text>
                <Text style={s.statLbl}>Followers</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={s.stat} onPress={handleFollowingPress}>
                <Text style={s.statNum}>{stats.following_count}</Text>
                <Text style={s.statLbl}>Following</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={s.info}>
            <View style={s.nameRow}>
              <Text style={s.name}>{userProfile.display_name}</Text>
              {userProfile.is_premium && (
                <MaterialCommunityIcons name="crown" size={20} color="#ffd700" />
              )}
            </View>
            <Text style={s.username}>@{userProfile.username}</Text>
            {userProfile.bio && <Text style={s.bio}>{userProfile.bio}</Text>}
          </View>

          <View style={s.actions}>
            <TouchableOpacity style={s.editBtn} onPress={handleEditProfile}>
              <Text style={s.editTxt}>Edit Profile</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={s.shareBtn} onPress={handleShareProfile}>
              <Text style={s.shareTxt}>Share</Text>
            </TouchableOpacity>
          </View>

          {!userProfile.is_premium && (
            <TouchableOpacity style={s.premiumCard} onPress={handlePremiumPress}>
              <MaterialCommunityIcons name="crown" size={28} color="#ffd700" />
              <View style={s.premiumText}>
                <Text style={s.premiumTitle}>Go Premium</Text>
                <Text style={s.premiumSub}>₦8,000/month • No ads + exclusive features</Text>
              </View>
              <Feather name="chevron-right" size={24} color="#ffd700" />
            </TouchableOpacity>
          )}

          <TouchableOpacity style={s.wallet} onPress={handleWalletPress}>
            <View style={s.walletCont}>
              <MaterialCommunityIcons name="diamond" size={28} color="#ffd700" />
              <View style={s.walletTxt}>
                <Text style={s.walletAmt}>{coins.toFixed(2)} Coins</Text>
                <Text style={s.walletUsd}>{formatNaira(balNaira)}</Text>
              </View>
              <Feather name="chevron-right" size={24} color="#00ff88" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={s.subscriptionCard} onPress={handleCreatorSubscriptionPress}>
            <View style={s.subscriptionIcon}>
              <MaterialCommunityIcons 
                name={subscriptionEnabled ? "crown" : "crown-outline"} 
                size={28} 
                color="#ffd700" 
              />
            </View>
            <View style={s.subscriptionText}>
              <Text style={s.subscriptionTitle}>
                {subscriptionEnabled ? 'Creator Subscriptions' : 'Enable Creator Subscriptions'}
              </Text>
              <Text style={s.subscriptionSub}>
                {subscriptionEnabled 
                  ? 'Fans subscribe to your content • 70% earnings' 
                  : 'Let fans subscribe to you • Need 1K followers'}
              </Text>
            </View>
            {!subscriptionEnabled && (
              <View style={s.newBadge}>
                <Text style={s.newBadgeText}>NEW</Text>
              </View>
            )}
            <Feather name="chevron-right" size={24} color="#ffd700" />
          </TouchableOpacity>

          {!stripeConnected && (
            <TouchableOpacity style={s.payoutCard} onPress={handleConnectPayoutPress}>
              <View style={s.payoutIcon}>
                <Feather name="alert-circle" size={24} color="#ff9800" />
              </View>
              <View style={s.payoutText}>
                <Text style={s.payoutTitle}>Connect Bank Account</Text>
                <Text style={s.payoutSub}>Required to withdraw earnings</Text>
              </View>
              <Feather name="chevron-right" size={24} color="#ff9800" />
            </TouchableOpacity>
          )}
        </View>

        <View style={s.posts}>
          <View style={s.tabBar}>
            <View style={s.tabActive}>
              <Ionicons name="grid" size={24} color="#00ff88" />
            </View>
          </View>
          
          {loadingPosts ? (
            <ActivityIndicator size="large" color="#00ff88" style={{ marginTop: 40 }} />
          ) : userPosts.length === 0 ? (
            <View style={s.noPosts}>
              <Feather name="camera" size={64} color="#333" />
              <Text style={s.noPostsTxt}>No posts yet</Text>
            </View>
          ) : (
            <FlatList 
              data={userPosts} 
              numColumns={3} 
              scrollEnabled={false} 
              columnWrapperStyle={s.postRow} 
              keyExtractor={(i) => i.id} 
              renderItem={({ item }) => (
                <TouchableOpacity style={s.post} onPress={() => handlePostPress(item)}>
                  {item.media_url ? (
                    <Image source={{ uri: item.media_url }} style={s.postImg} />
                  ) : (
                    <View style={[s.postImg, s.txtPost]}>
                      <Text style={s.postTxt} numberOfLines={3}>{item.caption}</Text>
                    </View>
                  )}
                  <View style={s.postOv}>
                    <Feather name="heart" size={14} color="#fff" />
                    <Text style={s.postStat}>{item.likes_count || 0}</Text>
                  </View>
                </TouchableOpacity>
              )} 
            />
          )}
        </View>
      </ScrollView>

      <Modal 
        visible={profilePicVisible} 
        transparent 
        animationType="fade" 
        onRequestClose={() => setProfilePicVisible(false)}
      >
        <TouchableOpacity 
          style={s.picModal} 
          onPress={() => setProfilePicVisible(false)}
        >
          <Image 
            source={{ uri: userProfile.avatar_url }} 
            style={s.picFull} 
            resizeMode="contain" 
          />
          <TouchableOpacity 
            style={s.closePic} 
            onPress={() => setProfilePicVisible(false)}
          >
            <Feather name="x" size={24} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal 
        visible={withdrawModalVisible} 
        transparent 
        animationType="slide" 
        onRequestClose={() => setWithdrawModalVisible(false)}
      >
        <View style={s.wdOv}>
          <View style={s.wdCont}>
            <Text style={s.wdTitle}>💰 Withdraw to Bank</Text>
            <Text style={s.wdBal}>Available: {formatNaira(balNaira)}</Text>
            <Text style={s.wdNote}>Minimum: ₦10,000 • You receive 70%, 30% platform fee</Text>
            
            <TextInput 
              style={s.wdInput} 
              placeholder="Amount (Naira)" 
              placeholderTextColor="#666"
              keyboardType="decimal-pad" 
              value={withdrawAmount} 
              onChangeText={setWithdrawAmount} 
            />
            
            <View style={s.stripeInfo}>
              <MaterialCommunityIcons name="bank" size={24} color="#00ff88" />
              <Text style={s.stripeInfoText}>
                Money will be sent to your connected bank account
              </Text>
            </View>
            
            <View style={s.wdBtns}>
              <TouchableOpacity 
                style={s.wdCancel} 
                onPress={() => setWithdrawModalVisible(false)}
              >
                <Text style={s.wdCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={s.wdConfirm} 
                onPress={processWithdrawal}
              >
                <Text style={s.wdConfirmTxt}>Withdraw</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal 
        visible={followersVisible} 
        animationType="slide" 
        onRequestClose={() => setFollowersVisible(false)}
      >
        <View style={s.modal}>
          <View style={s.modalHdr}>
            <Text style={s.modalTitle}>Followers</Text>
            <TouchableOpacity onPress={() => setFollowersVisible(false)}>
              <Feather name="x" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          
          {followers.length === 0 ? (
            <View style={s.empty}>
              <Feather name="users" size={64} color="#333" />
              <Text style={s.emptyTxt}>No followers yet</Text>
            </View>
          ) : (
            <FlatList 
              data={followers} 
              keyExtractor={(i) => i.id} 
              contentContainerStyle={{ padding: 20 }} 
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={s.fItem} 
                  onPress={() => { 
                    setFollowersVisible(false); 
                    handleUserPress(item.id);
                  }}
                >
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={s.fAv} />
                  ) : (
                    <View style={[s.fAv, s.fAvPh]}>
                      <Feather name="user" size={20} color="#00ff88" />
                    </View>
                  )}
                  <View style={s.fInfo}>
                    <Text style={s.fName}>{item.display_name}</Text>
                    <Text style={s.fUser}>@{item.username}</Text>
                  </View>
                  <Feather name="chevron-right" size={20} color="#666" />
                </TouchableOpacity>
              )} 
            />
          )}
        </View>
      </Modal>

      <Modal 
        visible={followingVisible} 
        animationType="slide" 
        onRequestClose={() => setFollowingVisible(false)}
      >
        <View style={s.modal}>
          <View style={s.modalHdr}>
            <Text style={s.modalTitle}>Following</Text>
            <TouchableOpacity onPress={() => setFollowingVisible(false)}>
              <Feather name="x" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          
          {following.length === 0 ? (
            <View style={s.empty}>
              <Feather name="users" size={64} color="#333" />
              <Text style={s.emptyTxt}>Not following anyone</Text>
            </View>
          ) : (
            <FlatList 
              data={following} 
              keyExtractor={(i) => i.id} 
              contentContainerStyle={{ padding: 20 }} 
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={s.fItem} 
                  onPress={() => { 
                    setFollowingVisible(false); 
                    handleUserPress(item.id);
                  }}
                >
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={s.fAv} />
                  ) : (
                    <View style={[s.fAv, s.fAvPh]}>
                      <Feather name="user" size={20} color="#00ff88" />
                    </View>
                  )}
                  <View style={s.fInfo}>
                    <Text style={s.fName}>{item.display_name}</Text>
                    <Text style={s.fUser}>@{item.username}</Text>
                  </View>
                  <Feather name="chevron-right" size={20} color="#666" />
                </TouchableOpacity>
              )} 
            />
          )}
        </View>
      </Modal>

      <Modal 
        visible={settingsVisible} 
        animationType="slide" 
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View style={s.modal}>
          <View style={s.modalHdr}>
            <Text style={s.modalTitle}>Settings</Text>
            <TouchableOpacity onPress={() => setSettingsVisible(false)}>
              <Feather name="x" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          
          <ScrollView>
            <View style={s.settingsSection}>
              <Text style={s.settingsSectionTitle}>Account</Text>
              
              <TouchableOpacity 
                style={s.setItem} 
                onPress={() => { 
                  setSettingsVisible(false); 
                  handleEditProfile();
                }}
              >
                <Feather name="user" size={22} color="#00ff88" />
                <Text style={s.setTxt}>Edit Profile</Text>
                <Feather name="chevron-right" size={22} color="#666" />
              </TouchableOpacity>

              <TouchableOpacity 
                style={s.setItem} 
                onPress={() => { 
                  setSettingsVisible(false); 
                  try {
                    router.push('/privacy-settings');
                  } catch {
                    Alert.alert('Opening...', 'Loading privacy settings');
                  }
                }}
              >
                <Feather name="lock" size={22} color="#00ff88" />
                <Text style={s.setTxt}>Privacy & Security</Text>
                <Feather name="chevron-right" size={22} color="#666" />
              </TouchableOpacity>

              <TouchableOpacity 
                style={s.setItem} 
                onPress={() => { 
                  setSettingsVisible(false);
                  Alert.alert(
                    'Email Notifications',
                    'Choose what email notifications you want to receive:',
                    [
                      {
                        text: 'All Notifications',
                        onPress: () => {
                          Alert.alert('✅ Saved', 'You will receive all email notifications');
                        }
                      },
                      {
                        text: 'Important Only',
                        onPress: () => {
                          Alert.alert('✅ Saved', 'You will receive important notifications only');
                        }
                      },
                      {
                        text: 'None',
                        onPress: () => {
                          Alert.alert('✅ Saved', 'Email notifications disabled');
                        }
                      },
                      { text: 'Cancel', style: 'cancel' }
                    ]
                  );
                }}
              >
                <Feather name="mail" size={22} color="#00ff88" />
                <Text style={s.setTxt}>Email Notifications</Text>
                <Feather name="chevron-right" size={22} color="#666" />
              </TouchableOpacity>

              <TouchableOpacity 
                style={s.setItem} 
                onPress={() => { 
                  setSettingsVisible(false);
                  Alert.alert(
                    'Push Notifications',
                    'Manage your push notification preferences:',
                    [
                      {
                        text: 'Enable All',
                        onPress: () => {
                          Alert.alert('✅ Enabled', 'Push notifications are now on');
                        }
                      },
                      {
                        text: 'Disable All',
                        onPress: () => {
                          Alert.alert('✅ Disabled', 'Push notifications are now off');
                        }
                      },
                      { text: 'Cancel', style: 'cancel' }
                    ]
                  );
                }}
              >
                <Feather name="bell" size={22} color="#00ff88" />
                <Text style={s.setTxt}>Push Notifications</Text>
                <Feather name="chevron-right" size={22} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={s.settingsSection}>
              <Text style={s.settingsSectionTitle}>Monetization</Text>
              
              <TouchableOpacity 
                style={s.setItem} 
                onPress={() => { 
                  setSettingsVisible(false);
                  handleWalletPress();
                }}
              >
                <MaterialCommunityIcons name="diamond" size={22} color="#00ff88" />
                <Text style={s.setTxt}>Coins Wallet</Text>
                <Feather name="chevron-right" size={22} color="#666" />
              </TouchableOpacity>

              <TouchableOpacity 
                style={s.setItem} 
                onPress={() => { 
                  setSettingsVisible(false);
                  handleCreatorSubscriptionPress();
                }}
              >
                <MaterialCommunityIcons name="crown" size={22} color="#ffd700" />
                <Text style={s.setTxt}>Creator Subscriptions</Text>
                <Feather name="chevron-right" size={22} color="#666" />
              </TouchableOpacity>

              <TouchableOpacity 
                style={s.setItem} 
                onPress={() => { 
                  setSettingsVisible(false);
                  handleConnectPayoutPress();
                }}
              >
                <Feather name="credit-card" size={22} color="#00ff88" />
                <Text style={s.setTxt}>Bank Account</Text>
                <Feather name="chevron-right" size={22} color="#666" />
              </TouchableOpacity>

              <TouchableOpacity 
                style={s.setItem} 
                onPress={() => { 
                  setSettingsVisible(false);
                  Alert.alert(
                    'Earnings Analytics',
                    'Your earnings breakdown:',
                    [
                      {
                        text: 'View Details',
                        onPress: () => {
                          const totalCoins = coins;
                          const totalNaira = coinsToNaira(coins);
                          Alert.alert(
                            '💰 Your Earnings',
                            `Total Coins: ${totalCoins.toFixed(2)}\nTotal: ${formatNaira(totalNaira)}\n\nSources:\n• Coin Gifts\n• Creator Subscriptions\n• Purchases`,
                            [{ text: 'OK' }]
                          );
                        }
                      },
                      { text: 'Close', style: 'cancel' }
                    ]
                  );
                }}
              >
                <Feather name="bar-chart-2" size={22} color="#00ff88" />
                <Text style={s.setTxt}>Earnings Analytics</Text>
                <Feather name="chevron-right" size={22} color="#666" />
              </TouchableOpacity>
            </View>

            {!userProfile?.is_premium && (
              <View style={s.settingsSection}>
                <Text style={s.settingsSectionTitle}>Premium</Text>
                
                <TouchableOpacity 
                  style={s.setItem} 
                  onPress={() => { 
                    setSettingsVisible(false);
                    handlePremiumPress();
                  }}
                >
                  <MaterialCommunityIcons name="crown" size={22} color="#ffd700" />
                  <Text style={[s.setTxt, { color: '#ffd700' }]}>Upgrade to Premium</Text>
                  <Feather name="chevron-right" size={22} color="#ffd700" />
                </TouchableOpacity>
              </View>
            )}

            <View style={s.settingsSection}>
              <Text style={s.settingsSectionTitle}>Support</Text>
              
              <TouchableOpacity 
                style={s.setItem} 
                onPress={() => { 
                  setSettingsVisible(false);
                  handleSponsorApp();
                }}
              >
                <Feather name="heart" size={22} color="#ff4d8f" />
                <Text style={s.setTxt}>Support Kinsta</Text>
                <Feather name="chevron-right" size={22} color="#666" />
              </TouchableOpacity>

              <TouchableOpacity 
                style={s.setItem} 
                onPress={() => { 
                  setSettingsVisible(false);
                  Alert.alert(
                    '📧 Help & Support',
                    'Need help? We\'re here for you!\n\n📩 Email: kinsta066@gmail.com\n⏱️ Response time: 24-48 hours\n\nFor urgent issues, please describe your problem in detail.',
                    [
                      {
                        text: 'Email Support',
                        onPress: () => {
                          Alert.alert('📧 Contact Us', 'Send an email to:\nkinsta066@gmail.com');
                        }
                      },
                      { text: 'Close', style: 'cancel' }
                    ]
                  );
                }}
              >
                <Feather name="help-circle" size={22} color="#00ff88" />
                <Text style={s.setTxt}>Help & Support</Text>
                <Feather name="chevron-right" size={22} color="#666" />
              </TouchableOpacity>

              <TouchableOpacity 
                style={s.setItem} 
                onPress={() => { 
                  setSettingsVisible(false);
                  Alert.alert(
                    '💚 About Kinsta',
                    'Kinsta was built from the ground up by a single passionate developer who believed in creating a platform where creators and fans could truly connect.\n\nStarted as a solo project in 2024, Kinsta has grown into a community-driven platform that puts creators first.\n\nEvery line of code, every feature, and every design choice was crafted with love and dedication to make the best experience possible.\n\n✨ Built with passion by one developer\n🚀 Powered by the community\n💪 Made for creators',
                    [
                      {
                        text: 'Version Info',
                        onPress: () => {
                          Alert.alert(
                            'Version Info',
                            'Kinsta v1.0.0\n\nDeveloped by: Solo Developer\nLaunched: 2024\n\n© 2025 Kinsta Inc.\nAll rights reserved.'
                          );
                        }
                      },
                      { text: 'Close', style: 'cancel' }
                    ]
                  );
                }}
              >
                <Feather name="info" size={22} color="#00ff88" />
                <Text style={s.setTxt}>About</Text>
                <Feather name="chevron-right" size={22} color="#666" />
              </TouchableOpacity>

              <TouchableOpacity 
                style={s.setItem} 
                onPress={() => { 
                  setSettingsVisible(false);
                  Alert.alert(
                    'Share Kinsta',
                    'Invite your friends to join Kinsta!',
                    [
                      {
                        text: 'Share',
                        onPress: async () => {
                          try {
                            await Share.share({
                              message: `Join me on Kinsta! 🚀\n\nThe best platform for creators and fans, built by a passionate solo developer.\n\nDownload now: kinsta.app\n\nUse my referral code: ${userProfile?.referral_code || 'KINSTA2025'}`
                            });
                          } catch (error) {
                            Alert.alert('Error', 'Could not share');
                          }
                        }
                      },
                      { text: 'Cancel', style: 'cancel' }
                    ]
                  );
                }}
              >
                <Feather name="share-2" size={22} color="#00ff88" />
                <Text style={s.setTxt}>Share Kinsta</Text>
                <Feather name="chevron-right" size={22} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={s.settingsSection}>
              <Text style={[s.settingsSectionTitle, { color: '#ff4444' }]}>Account Actions</Text>
              
              <TouchableOpacity 
                style={s.setItem} 
                onPress={() => {
                  Alert.alert(
                    '⚠️ Clear Cache',
                    'This will clear all cached data to free up storage space. Your account and posts will not be affected.',
                    [
                      {
                        text: 'Clear Cache',
                        style: 'destructive',
                        onPress: () => {
                          Alert.alert('✅ Cache Cleared', 'App cache has been cleared successfully.');
                        }
                      },
                      { text: 'Cancel', style: 'cancel' }
                    ]
                  );
                }}
              >
                <Feather name="trash-2" size={22} color="#ff9800" />
                <Text style={s.setTxt}>Clear Cache</Text>
                <Feather name="chevron-right" size={22} color="#666" />
              </TouchableOpacity>

              <TouchableOpacity 
                style={[s.setItem, { borderTopWidth: 1, borderTopColor: '#1a1a1a', marginTop: 12 }]} 
                onPress={() => {
                  Alert.alert(
                    'Logout?', 
                    'Are you sure you want to logout?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { 
                        text: 'Logout', 
                        style: 'destructive', 
                        onPress: handleLogout 
                      }
                    ]
                  );
                }}
              >
                <Feather name="log-out" size={22} color="#ff4444" />
                <Text style={[s.setTxt, { color: '#ff4444' }]}>Logout</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal 
        visible={walletVisible} 
        animationType="slide" 
        onRequestClose={() => setWalletVisible(false)}
      >
        <View style={s.modal}>
          <View style={s.modalHdr}>
            <Text style={s.modalTitle}>💎 Wallet</Text>
            <TouchableOpacity onPress={() => setWalletVisible(false)}>
              <Feather name="x" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
          
          <ScrollView>
            <View style={s.balCard}>
              <Text style={s.balLbl}>Your Balance</Text>
              <Text style={s.balAmt}>{coins.toFixed(2)} coins</Text>
              <Text style={s.balUsd}>{formatNaira(balNaira)}</Text>
              <Text style={s.balNote}>1 coin = ₦1,000</Text>
            </View>

            <View style={s.walletActs}>
              <TouchableOpacity style={s.buyBtn} onPress={handleBuyCoins}>
                <Feather name="shopping-cart" size={20} color="#000" />
                <Text style={s.buyTxt}>Buy Coins</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={s.wdBtn} onPress={handleWithdrawPress}>
                <Feather name="download" size={20} color="#00ff88" />
                <Text style={s.wdBtnTxt}>Withdraw</Text>
              </TouchableOpacity>
            </View>

            {withdrawalRequests.length > 0 && (
              <>
                <Text style={s.wdReqTitle}>Recent Withdrawals</Text>
                {withdrawalRequests.map((item) => (
                  <View key={item.id} style={s.wdReqItem}>
                    <View>
                      <Text style={s.wdReqAmt}>{formatNaira(item.amount)}</Text>
                      <Text style={s.wdReqDate}>{formatDate(item.created_at)}</Text>
                      <Text style={s.wdReqMethod}>bank transfer</Text>
                    </View>
                    <View style={[
                      s.wdStat, 
                      { 
                        backgroundColor: getWdColor(item.status) + '20', 
                        borderColor: getWdColor(item.status) 
                      }
                    ]}>
                      <Text style={[
                        s.wdStatTxt, 
                        { color: getWdColor(item.status) }
                      ]}>
                        {item.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                ))}
              </>
            )}

            <Text style={s.txTitle}>Transaction History</Text>
            {transactions.length === 0 ? (
              <View style={s.noTx}>
                <Text style={s.noTxTxt}>No transactions yet</Text>
              </View>
            ) : (
              transactions.map((item) => (
                <View key={item.id} style={s.txItem}>
                  <View style={s.txCont}>
                    <Text style={s.txDesc}>{item.description}</Text>
                    <Text style={s.txDate}>{formatDate(item.created_at)}</Text>
                  </View>
                  <Text style={[s.txAmt, { color: getTxColor(item.type) }]}>
                    {(item.type === 'received' || item.type === 'purchased' || item.type === 'ad_revenue') ? '+' : '-'}
                    {item.amount.toFixed(2)}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  testBanner: { backgroundColor: '#ffd700', padding: 8, alignItems: 'center' },
  testText: { fontSize: 12, fontWeight: 'bold', color: '#000' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#00ff88' },
  profile: { paddingHorizontal: 20 },
  topRow: { flexDirection: 'row', marginBottom: 16 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1a1a1a', borderWidth: 2, borderColor: '#00ff88', marginRight: 16 },
  avatarPh: { justifyContent: 'center', alignItems: 'center' },
  statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  statLbl: { fontSize: 12, color: '#999' },
  info: { marginBottom: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  name: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  username: { fontSize: 14, color: '#999', marginBottom: 8 },
  bio: { fontSize: 14, color: '#fff', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  editBtn: { flex: 1, backgroundColor: '#00ff88', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  editTxt: { color: '#000', fontSize: 15, fontWeight: '600' },
  shareBtn: { flex: 1, backgroundColor: '#1a1a1a', paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  shareTxt: { color: '#fff', fontSize: 15, fontWeight: '600' },
  premiumCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a0a0a', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 2, borderColor: '#ffd700', gap: 12 },
  premiumText: { flex: 1 },
  premiumTitle: { fontSize: 16, fontWeight: '600', color: '#ffd700' },
  premiumSub: { fontSize: 12, color: '#999', marginTop: 2 },
  wallet: { backgroundColor: '#0a0a0a', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 2, borderColor: '#00ff88' },
  walletCont: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  walletTxt: { flex: 1 },
  walletAmt: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  walletUsd: { fontSize: 14, color: '#00ff88', marginTop: 2 },
  subscriptionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a0a0a', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 2, borderColor: '#ffd700', gap: 12 },
  subscriptionIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,215,0,0.1)', alignItems: 'center', justifyContent: 'center' },
  subscriptionText: { flex: 1 },
  subscriptionTitle: { fontSize: 16, fontWeight: '600', color: '#ffd700', marginBottom: 4 },
  subscriptionSub: { fontSize: 12, color: '#999', lineHeight: 16 },
  newBadge: { backgroundColor: '#ffd700', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  newBadgeText: { fontSize: 10, fontWeight: 'bold', color: '#000' },
  payoutCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a0a0a', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 2, borderColor: '#ff9800', gap: 12 },
  payoutIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,152,0,0.1)', alignItems: 'center', justifyContent: 'center' },
  payoutText: { flex: 1 },
  payoutTitle: { fontSize: 16, fontWeight: '600', color: '#ff9800', marginBottom: 4 },
  payoutSub: { fontSize: 12, color: '#999' },
  posts: { marginTop: 8 },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  tabActive: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: '#00ff88' },
  noPosts: { alignItems: 'center', paddingVertical: 60 },
  noPostsTxt: { fontSize: 16, color: '#666', marginTop: 16 },
  postRow: { gap: 2, marginBottom: 2 },
  post: { width: POST_SIZE, height: POST_SIZE, position: 'relative' },
  postImg: { width: '100%', height: '100%', backgroundColor: '#1a1a1a' },
  txtPost: { justifyContent: 'center', alignItems: 'center', padding: 8 },
  postTxt: { fontSize: 12, color: '#fff', textAlign: 'center' },
  postOv: { position: 'absolute', bottom: 4, left: 4, flexDirection: 'row', alignItems: 'center', gap: 4 },
  postStat: { fontSize: 11, fontWeight: 'bold', color: '#fff' },
  picModal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  picFull: { width: '90%', height: '90%' },
  closePic: { position: 'absolute', top: 60, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  wdOv: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
  wdCont: { backgroundColor: '#1a1a1a', borderRadius: 20, padding: 24, borderWidth: 2, borderColor: '#00ff88' },
  wdTitle: { fontSize: 24, fontWeight: 'bold', color: '#00ff88', textAlign: 'center', marginBottom: 12 },
  wdBal: { fontSize: 16, color: '#ffd700', textAlign: 'center', marginBottom: 8 },
  wdNote: { fontSize: 12, color: '#999', textAlign: 'center', marginBottom: 20 },
  wdInput: { backgroundColor: '#0a0a0a', borderRadius: 12, borderWidth: 1, borderColor: '#00ff88', padding: 16, fontSize: 18, color: '#fff', textAlign: 'center', marginBottom: 16 },
  stripeInfo: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,255,136,0.1)', padding: 12, borderRadius: 8, marginBottom: 16, gap: 8 },
  stripeInfoText: { flex: 1, fontSize: 12, color: '#00ff88', lineHeight: 16 },
  wdBtns: { flexDirection: 'row', gap: 12 },
  wdCancel: { flex: 1, backgroundColor: '#333', padding: 16, borderRadius: 12, alignItems: 'center' },
  wdCancelTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },
  wdConfirm: { flex: 1, backgroundColor: '#00ff88', padding: 16, borderRadius: 12, alignItems: 'center' },
  wdConfirmTxt: { color: '#000', fontSize: 16, fontWeight: '600' },
  modal: { flex: 1, backgroundColor: '#000' },
  modalHdr: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 60 },
  emptyTxt: { fontSize: 16, color: '#666', marginTop: 16 },
  fItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  fAv: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#1a1a1a' },
  fAvPh: { justifyContent: 'center', alignItems: 'center' },
  fInfo: { flex: 1 },
  fName: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 2 },
  fUser: { fontSize: 14, color: '#999' },
  settingsSection: { marginTop: 20, paddingHorizontal: 20 },
  settingsSectionTitle: { fontSize: 14, fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  setItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 16 },
  setTxt: { flex: 1, fontSize: 16, color: '#fff' },
  balCard: { backgroundColor: '#0a0a0a', margin: 20, padding: 24, borderRadius: 16, alignItems: 'center', borderWidth: 2, borderColor: '#00ff88' },
  balLbl: { fontSize: 14, color: '#999', marginBottom: 8 },
  balAmt: { fontSize: 36, fontWeight: 'bold', color: '#00ff88', marginBottom: 4 },
  balUsd: { fontSize: 20, color: '#ffd700', marginBottom: 8 },
  balNote: { fontSize: 12, color: '#666' },
  walletActs: { flexDirection: 'row', paddingHorizontal: 20, gap: 12, marginBottom: 20 },
  buyBtn: { flex: 1, backgroundColor: '#00ff88', paddingVertical: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buyTxt: { fontSize: 16, fontWeight: '600', color: '#000' },
  wdBtn: { flex: 1, backgroundColor: '#1a1a1a', paddingVertical: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#00ff88' },
  wdBtnTxt: { fontSize: 16, fontWeight: '600', color: '#00ff88' },
  wdReqTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', paddingHorizontal: 20, marginBottom: 12 },
  wdReqItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0a0a0a', marginHorizontal: 20, marginBottom: 8, padding: 16, borderRadius: 12 },
  wdReqAmt: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  wdReqDate: { fontSize: 12, color: '#999', marginBottom: 2 },
  wdReqMethod: { fontSize: 12, color: '#666', textTransform: 'capitalize' },
  wdStat: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  wdStatTxt: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  txTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', paddingHorizontal: 20, marginTop: 12, marginBottom: 12 },
  noTx: { padding: 40, alignItems: 'center' },
  noTxTxt: { fontSize: 14, color: '#666' },
  txItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  txCont: { flex: 1 },
  txDesc: { fontSize: 14, color: '#fff', marginBottom: 4 },
  txDate: { fontSize: 12, color: '#666' },
  txAmt: { fontSize: 16, fontWeight: 'bold' },
});
	

	
