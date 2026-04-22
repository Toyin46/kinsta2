// app/connect-accounts.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { connectTikTok, disconnectTikTok, checkTikTokConnection } from '../lib/tiktok-oauth';
import { connectInstagram, disconnectInstagram, checkInstagramConnection } from '../lib/instagram-oauth';
import { connectYouTube, disconnectYouTube, checkYouTubeConnection } from '../lib/youtube-oauth';

export default function ConnectAccountsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);

  const [tiktokConnected, setTiktokConnected] = useState(false);
  const [instagramConnected, setInstagramConnected] = useState(false);
  const [youtubeConnected, setYoutubeConnected] = useState(false);

  useEffect(() => {
    checkConnections();
  }, [user?.id]);

  const checkConnections = async () => {
    if (!user?.id) return;

    try {
      const [tiktok, instagram, youtube] = await Promise.all([
        checkTikTokConnection(user.id),
        checkInstagramConnection(user.id),
        checkYouTubeConnection(user.id),
      ]);

      setTiktokConnected(tiktok.connected);
      setInstagramConnected(instagram.connected);
      setYoutubeConnected(youtube.connected);
    } catch (error) {
      console.error('Error checking connections:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (platform: 'tiktok' | 'instagram' | 'youtube') => {
    if (!user?.id) return;

    setConnecting(platform);
    try {
      let result;
     
      if (platform === 'tiktok') {
        result = await connectTikTok(user.id);
        if (result.success) {
          setTiktokConnected(true);
          Alert.alert('✅ Connected', 'TikTok account connected successfully!');
        }
      } else if (platform === 'instagram') {
        result = await connectInstagram(user.id);
        if (result.success) {
          setInstagramConnected(true);
          Alert.alert('✅ Connected', 'Instagram account connected successfully!');
        }
      } else if (platform === 'youtube') {
        result = await connectYouTube(user.id);
        if (result.success) {
          setYoutubeConnected(true);
          Alert.alert('✅ Connected', 'YouTube account connected successfully!');
        }
      }
    } catch (error: any) {
      Alert.alert('Connection Failed', error.message || 'Could not connect account');
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (platform: 'tiktok' | 'instagram' | 'youtube') => {
    if (!user?.id) return;

    Alert.alert(
      'Disconnect Account',
      `Are you sure you want to disconnect your ${platform} account?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              if (platform === 'tiktok') {
                await disconnectTikTok(user.id);
                setTiktokConnected(false);
              } else if (platform === 'instagram') {
                await disconnectInstagram(user.id);
                setInstagramConnected(false);
              } else if (platform === 'youtube') {
                await disconnectYouTube(user.id);
                setYoutubeConnected(false);
              }
              Alert.alert('Disconnected', `${platform} account disconnected`);
            } catch (error) {
              Alert.alert('Error', 'Failed to disconnect account');
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={s.container}>
        <View style={s.centerContainer}>
          <ActivityIndicator size="large" color="#00ff88" />
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Connect Accounts</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.content}>
          <Text style={s.description}>
            Connect your social media accounts to cross-post content and grow your audience
          </Text>

          {/* TikTok */}
          <View style={s.accountCard}>
            <View style={s.accountHeader}>
              <View style={s.accountIcon}>
                <MaterialCommunityIcons name="music-note" size={32} color="#000" />
              </View>
              <View style={s.accountInfo}>
                <Text style={s.accountName}>TikTok</Text>
                <Text style={s.accountDesc}>
                  {tiktokConnected ? 'Connected ✓' : 'Connect your TikTok account'}
                </Text>
              </View>
              {tiktokConnected && (
                <Feather name="check-circle" size={24} color="#00ff88" />
              )}
            </View>

            <View style={s.features}>
              <View style={s.feature}>
                <Feather name="check" size={14} color="#00ff88" />
                <Text style={s.featureText}>Cross-post your videos</Text>
              </View>
              <View style={s.feature}>
                <Feather name="check" size={14} color="#00ff88" />
                <Text style={s.featureText}>Import your existing content</Text>
              </View>
              <View style={s.feature}>
                <Feather name="check" size={14} color="#00ff88" />
                <Text style={s.featureText}>Sync followers</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                s.connectButton,
                tiktokConnected && s.disconnectButton,
                connecting === 'tiktok' && s.connectingButton
              ]}
              onPress={() => tiktokConnected ? handleDisconnect('tiktok') : handleConnect('tiktok')}
              disabled={connecting !== null}
            >
              {connecting === 'tiktok' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[s.connectButtonText, tiktokConnected && s.disconnectButtonText]}>
                  {tiktokConnected ? 'Disconnect' : 'Connect TikTok'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Instagram */}
          <View style={s.accountCard}>
            <View style={s.accountHeader}>
              <View style={[s.accountIcon, { backgroundColor: '#E4405F' }]}>
                <MaterialCommunityIcons name="instagram" size={32} color="#fff" />
              </View>
              <View style={s.accountInfo}>
                <Text style={s.accountName}>Instagram</Text>
                <Text style={s.accountDesc}>
                  {instagramConnected ? 'Connected ✓' : 'Connect your Instagram account'}
                </Text>
              </View>
              {instagramConnected && (
                <Feather name="check-circle" size={24} color="#00ff88" />
              )}
            </View>

            <View style={s.features}>
              <View style={s.feature}>
                <Feather name="check" size={14} color="#00ff88" />
                <Text style={s.featureText}>Share to Instagram Reels</Text>
              </View>
              <View style={s.feature}>
                <Feather name="check" size={14} color="#00ff88" />
                <Text style={s.featureText}>Import your photos & videos</Text>
              </View>
              <View style={s.feature}>
                <Feather name="check" size={14} color="#00ff88" />
                <Text style={s.featureText}>Sync followers</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                s.connectButton,
                instagramConnected && s.disconnectButton,
                connecting === 'instagram' && s.connectingButton
              ]}
              onPress={() => instagramConnected ? handleDisconnect('instagram') : handleConnect('instagram')}
              disabled={connecting !== null}
            >
              {connecting === 'instagram' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[s.connectButtonText, instagramConnected && s.disconnectButtonText]}>
                  {instagramConnected ? 'Disconnect' : 'Connect Instagram'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* YouTube */}
          <View style={s.accountCard}>
            <View style={s.accountHeader}>
              <View style={[s.accountIcon, { backgroundColor: '#FF0000' }]}>
                <MaterialCommunityIcons name="youtube" size={32} color="#fff" />
              </View>
              <View style={s.accountInfo}>
                <Text style={s.accountName}>YouTube</Text>
                <Text style={s.accountDesc}>
                  {youtubeConnected ? 'Connected ✓' : 'Connect your YouTube channel'}
                </Text>
              </View>
              {youtubeConnected && (
                <Feather name="check-circle" size={24} color="#00ff88" />
              )}
            </View>

            <View style={s.features}>
              <View style={s.feature}>
                <Feather name="check" size={14} color="#00ff88" />
                <Text style={s.featureText}>Upload to YouTube Shorts</Text>
              </View>
              <View style={s.feature}>
                <Feather name="check" size={14} color="#00ff88" />
                <Text style={s.featureText}>Import your videos</Text>
              </View>
              <View style={s.feature}>
                <Feather name="check" size={14} color="#00ff88" />
                <Text style={s.featureText}>Sync subscribers</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                s.connectButton,
                youtubeConnected && s.disconnectButton,
                connecting === 'youtube' && s.connectingButton
              ]}
              onPress={() => youtubeConnected ? handleDisconnect('youtube') : handleConnect('youtube')}
              disabled={connecting !== null}
            >
              {connecting === 'youtube' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[s.connectButtonText, youtubeConnected && s.disconnectButtonText]}>
                  {youtubeConnected ? 'Disconnect' : 'Connect YouTube'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Info Box */}
          <View style={s.infoBox}>
            <Feather name="info" size={20} color="#00aaff" />
            <View style={s.infoContent}>
              <Text style={s.infoText}>
                Your accounts are securely connected using OAuth 2.0. We never store your passwords.
              </Text>
              <Text style={[s.infoText, { marginTop: 8 }]}>
                You can disconnect any account at any time.
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
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  content: { padding: 20 },
  description: {
    fontSize: 14,
    color: '#999',
    marginBottom: 24,
    lineHeight: 20,
  },
  accountCard: {
    backgroundColor: '#0a0a0a',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  accountIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  accountInfo: { flex: 1 },
  accountName: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  accountDesc: { fontSize: 13, color: '#999' },
  features: { marginBottom: 16 },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  featureText: { fontSize: 13, color: '#ccc' },
  connectButton: {
    backgroundColor: '#00ff88',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  connectButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  disconnectButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  disconnectButtonText: { color: '#ff4444' },
  connectingButton: { opacity: 0.6 },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,170,255,0.1)',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,170,255,0.2)',
    marginTop: 8,
  },
  infoContent: { flex: 1 },
  infoText: { fontSize: 13, color: '#00aaff', lineHeight: 18 },
}); 
	
