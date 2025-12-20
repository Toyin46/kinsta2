// app/privacy-settings.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/config/supabase';

export default function PrivacySettingsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);

  // Privacy settings
  const [accountPrivate, setAccountPrivate] = useState(false);
  const [allowComments, setAllowComments] = useState('everyone');
  const [allowDuets, setAllowDuets] = useState('everyone');
  const [allowStitches, setAllowStitches] = useState('everyone');
  const [allowDownloads, setAllowDownloads] = useState(true);
  const [showActivityStatus, setShowActivityStatus] = useState(true);
  const [allowMentions, setAllowMentions] = useState('everyone');
  const [allowDirectMessages, setAllowDirectMessages] = useState('everyone');
  const [hideLikesCount, setHideLikesCount] = useState(false);
  const [suggestAccount, setSuggestAccount] = useState(true);

  useEffect(() => {
    loadSettings();
  }, [user?.id]);

  const loadSettings = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('privacy_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setAccountPrivate(data.account_private);
        setAllowComments(data.allow_comments);
        setAllowDuets(data.allow_duets);
        setAllowStitches(data.allow_stitches);
        setAllowDownloads(data.allow_downloads);
        setShowActivityStatus(data.show_activity_status);
        setAllowMentions(data.allow_mentions);
        setAllowDirectMessages(data.allow_direct_messages);
        setHideLikesCount(data.hide_likes_count);
        setSuggestAccount(data.suggest_account);
      }
    } catch (error) {
      console.error('Error loading privacy settings:', error);
    }
  };

  const saveSettings = async () => {
    if (!user?.id) return;

    setLoading(true);

    try {
      const { error } = await supabase
        .from('privacy_settings')
        .upsert({
          user_id: user.id,
          account_private: accountPrivate,
          allow_comments: allowComments,
          allow_duets: allowDuets,
          allow_stitches: allowStitches,
          allow_downloads: allowDownloads,
          show_activity_status: showActivityStatus,
          allow_mentions: allowMentions,
          allow_direct_messages: allowDirectMessages,
          hide_likes_count: hideLikesCount,
          suggest_account: suggestAccount,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      Alert.alert('✅ Saved', 'Your privacy settings have been updated');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const renderOptionSelector = (
    title: string,
    value: string,
    setter: (value: string) => void
  ) => (
    <View style={styles.selectorSection}>
      <Text style={styles.selectorTitle}>{title}</Text>
      <View style={styles.selectorButtons}>
        {['everyone', 'followers', 'nobody'].map((option) => (
          <TouchableOpacity
            key={option}
            style={[
              styles.selectorButton,
              value === option && styles.selectorButtonActive
            ]}
            onPress={() => setter(option)}
          >
            <Text style={[
              styles.selectorButtonText,
              value === option && styles.selectorButtonTextActive
            ]}>
              {option.charAt(0).toUpperCase() + option.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy & Security</Text>
        <TouchableOpacity onPress={saveSettings} disabled={loading}>
          <Text style={[styles.saveText, loading && styles.saveTextDisabled]}>
            {loading ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Account Privacy */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Privacy</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingText}>Private Account</Text>
              <Text style={styles.settingSubtext}>
                Only approved followers can see your posts
              </Text>
            </View>
            <Switch
              value={accountPrivate}
              onValueChange={setAccountPrivate}
              trackColor={{ false: '#333', true: '#00ff88' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Interactions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Who Can...</Text>
          
          {renderOptionSelector('Comment on your posts', allowComments, setAllowComments)}
          {renderOptionSelector('Duet with your videos', allowDuets, setAllowDuets)}
          {renderOptionSelector('Stitch your videos', allowStitches, setAllowStitches)}
          {renderOptionSelector('Mention you', allowMentions, setAllowMentions)}
          {renderOptionSelector('Send you direct messages', allowDirectMessages, setAllowDirectMessages)}
        </View>

        {/* Content Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Content</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingText}>Allow Downloads</Text>
              <Text style={styles.settingSubtext}>
                Others can download your videos
              </Text>
            </View>
            <Switch
              value={allowDownloads}
              onValueChange={setAllowDownloads}
              trackColor={{ false: '#333', true: '#00ff88' }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingText}>Hide Likes Count</Text>
              <Text style={styles.settingSubtext}>
                Only you can see likes on your posts
              </Text>
            </View>
            <Switch
              value={hideLikesCount}
              onValueChange={setHideLikesCount}
              trackColor={{ false: '#333', true: '#00ff88' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Activity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingText}>Show Activity Status</Text>
              <Text style={styles.settingSubtext}>
                Let followers see when you're online
              </Text>
            </View>
            <Switch
              value={showActivityStatus}
              onValueChange={setShowActivityStatus}
              trackColor={{ false: '#333', true: '#00ff88' }}
              thumbColor="#fff"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingText}>Suggest Account</Text>
              <Text style={styles.settingSubtext}>
                Let others discover your account
              </Text>
            </View>
            <Switch
              value={suggestAccount}
              onValueChange={setSuggestAccount}
              trackColor={{ false: '#333', true: '#00ff88' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Blocked Accounts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          
          <TouchableOpacity 
            style={styles.actionItem}
            onPress={() => Alert.alert('Coming Soon', 'Blocked accounts management will be available soon')}
          >
            <Feather name="slash" size={20} color="#fff" />
            <Text style={styles.actionText}>Blocked Accounts</Text>
            <Feather name="chevron-right" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionItem}
            onPress={() => Alert.alert('Coming Soon', 'Two-factor authentication will be available soon')}
          >
            <Feather name="shield" size={20} color="#fff" />
            <Text style={styles.actionText}>Two-Factor Authentication</Text>
            <Feather name="chevron-right" size={20} color="#666" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionItem}
            onPress={() => Alert.alert('Coming Soon', 'Password change will be available soon')}
          >
            <Feather name="lock" size={20} color="#fff" />
            <Text style={styles.actionText}>Change Password</Text>
            <Feather name="chevron-right" size={20} color="#666" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  saveText: { fontSize: 16, fontWeight: '600', color: '#00ff88' },
  saveTextDisabled: { color: '#666' },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', paddingHorizontal: 20, marginBottom: 16 },
  settingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#0a0a0a', marginHorizontal: 20, marginBottom: 12, borderRadius: 12 },
  settingInfo: { flex: 1, marginRight: 16 },
  settingText: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 4 },
  settingSubtext: { fontSize: 13, color: '#666', lineHeight: 18 },
  selectorSection: { paddingHorizontal: 20, marginBottom: 20 },
  selectorTitle: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 12 },
  selectorButtons: { flexDirection: 'row', gap: 8 },
  selectorButton: { flex: 1, backgroundColor: '#0a0a0a', paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  selectorButtonActive: { backgroundColor: '#00ff88', borderColor: '#00ff88' },
  selectorButtonText: { fontSize: 14, fontWeight: '600', color: '#999' },
  selectorButtonTextActive: { color: '#000' },
  actionItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#0a0a0a', marginHorizontal: 20, marginBottom: 12, borderRadius: 12, gap: 12 },
  actionText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#fff' },
});
	
