// app/schedule-post.tsx - SCHEDULE POSTS (2/day free, unlimited premium)
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/config/supabase';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function SchedulePostScreen() {
  const router = useRouter();
  const { user, userProfile } = useAuthStore();
  const [caption, setCaption] = useState('');
  const [scheduledDate, setScheduledDate] = useState(new Date(Date.now() + 3600000)); // 1 hour from now
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [todayCount, setTodayCount] = useState(0);
  const [canSchedule, setCanSchedule] = useState(true);
  const [scheduledPosts, setScheduledPosts] = useState<any[]>([]);

  useEffect(() => {
    loadScheduledPosts();
    checkScheduleLimit();
  }, [user?.id]);

  const loadScheduledPosts = async () => {
    if (!user?.id) return;
    
    try {
      const { data } = await supabase
        .from('scheduled_posts')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('scheduled_time', { ascending: true });
      
      setScheduledPosts(data || []);
    } catch (error) {
      console.error('Error loading scheduled posts:', error);
    }
  };

  const checkScheduleLimit = async () => {
    if (!user?.id) return;
    
    try {
      // Check if user is premium
      if (userProfile?.is_premium) {
        setCanSchedule(true);
        setTodayCount(0);
        return;
      }

      // Count today's scheduled posts
      const { data, error } = await supabase.rpc('count_todays_scheduled_posts', {
        user_id_param: user.id
      });

      if (error) throw error;

      setTodayCount(data || 0);
      setCanSchedule(data < 2);
    } catch (error) {
      console.error('Error checking schedule limit:', error);
    }
  };

  const handleSchedulePost = async () => {
    if (!caption.trim()) {
      Alert.alert('Caption Required', 'Please enter a caption for your post');
      return;
    }

    if (scheduledDate <= new Date()) {
      Alert.alert('Invalid Time', 'Please select a future time');
      return;
    }

    if (!canSchedule && !userProfile?.is_premium) {
      Alert.alert(
        'Daily Limit Reached',
        `Free users can schedule 2 posts per day.\n\nYou've scheduled ${todayCount}/2 posts today.\n\nUpgrade to Premium for unlimited scheduling!`,
        [
          { text: 'Maybe Later', style: 'cancel' },
          {
            text: 'Go Premium',
            onPress: () => {
              try {
                router.push('/premium-subscription');
              } catch {
                Alert.alert('Error', 'Could not open Premium page');
              }
            }
          }
        ]
      );
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from('scheduled_posts')
        .insert({
          user_id: user?.id,
          caption: caption.trim(),
          scheduled_time: scheduledDate.toISOString(),
          status: 'pending',
        });

      if (error) throw error;

      Alert.alert(
        '✅ Post Scheduled!',
        `Your post will be published on ${scheduledDate.toLocaleString()}`,
        [
          {
            text: 'OK',
            onPress: () => {
              setCaption('');
              setScheduledDate(new Date(Date.now() + 3600000));
              loadScheduledPosts();
              checkScheduleLimit();
            }
          }
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to schedule post');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelScheduledPost = async (postId: string) => {
    Alert.alert(
      'Cancel Scheduled Post?',
      'This action cannot be undone.',
      [
        { text: 'Keep It', style: 'cancel' },
        {
          text: 'Cancel Post',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase
                .from('scheduled_posts')
                .update({ status: 'cancelled' })
                .eq('id', postId);
              
              loadScheduledPosts();
              checkScheduleLimit();
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          }
        }
      ]
    );
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      const currentTime = scheduledDate.getTime() - scheduledDate.setHours(0, 0, 0, 0);
      const newDate = new Date(selectedDate.getTime() + currentTime);
      setScheduledDate(newDate);
    }
  };

  const onTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedTime) {
      const newDate = new Date(scheduledDate);
      newDate.setHours(selectedTime.getHours(), selectedTime.getMinutes());
      setScheduledDate(newDate);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#00ff88" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Schedule Post</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Limit Info */}
        {!userProfile?.is_premium && (
          <View style={styles.limitCard}>
            <MaterialCommunityIcons name="clock-outline" size={24} color="#ffd700" />
            <View style={styles.limitText}>
              <Text style={styles.limitTitle}>Free Plan: {todayCount}/2 scheduled today</Text>
              <Text style={styles.limitSub}>Upgrade to Premium for unlimited scheduling</Text>
            </View>
            {!canSchedule && (
              <TouchableOpacity
                style={styles.upgradeBtn}
                onPress={() => router.push('/premium-subscription')}
              >
                <Text style={styles.upgradeTxt}>Upgrade</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {userProfile?.is_premium && (
          <View style={styles.premiumBanner}>
            <MaterialCommunityIcons name="crown" size={20} color="#ffd700" />
            <Text style={styles.premiumText}>Premium: Unlimited Scheduling</Text>
          </View>
        )}

        {/* Caption Input */}
        <View style={styles.section}>
          <Text style={styles.label}>Post Caption</Text>
          <TextInput
            style={styles.captionInput}
            placeholder="What's on your mind?"
            placeholderTextColor="#666"
            multiline
            maxLength={500}
            value={caption}
            onChangeText={setCaption}
          />
          <Text style={styles.charCount}>{caption.length}/500</Text>
        </View>

        {/* Date & Time */}
        <View style={styles.section}>
          <Text style={styles.label}>Schedule For</Text>
          
          <TouchableOpacity
            style={styles.dateTimeButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Feather name="calendar" size={20} color="#00ff88" />
            <Text style={styles.dateTimeText}>
              {scheduledDate.toLocaleDateString()}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dateTimeButton}
            onPress={() => setShowTimePicker(true)}
          >
            <Feather name="clock" size={20} color="#00ff88" />
            <Text style={styles.dateTimeText}>
              {scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={scheduledDate}
              mode="date"
              display="default"
              onChange={onDateChange}
              minimumDate={new Date()}
            />
          )}

          {showTimePicker && (
            <DateTimePicker
              value={scheduledDate}
              mode="time"
              display="default"
              onChange={onTimeChange}
            />
          )}
        </View>

        {/* Schedule Button */}
        <TouchableOpacity
          style={[
            styles.scheduleButton,
            (loading || !canSchedule || !caption.trim()) && styles.scheduleButtonDisabled
          ]}
          onPress={handleSchedulePost}
          disabled={loading || !canSchedule || !caption.trim()}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Feather name="clock" size={20} color="#000" />
              <Text style={styles.scheduleButtonText}>Schedule Post</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Scheduled Posts List */}
        {scheduledPosts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Scheduled Posts</Text>
            {scheduledPosts.map((post) => (
              <View key={post.id} style={styles.scheduledPost}>
                <View style={styles.scheduledPostContent}>
                  <Text style={styles.scheduledPostCaption} numberOfLines={2}>
                    {post.caption}
                  </Text>
                  <View style={styles.scheduledPostTime}>
                    <Feather name="clock" size={14} color="#00ff88" />
                    <Text style={styles.scheduledPostTimeText}>
                      {new Date(post.scheduled_time).toLocaleString()}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => handleCancelScheduledPost(post.id)}
                >
                  <Feather name="x" size={20} color="#ff4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>ℹ️ How It Works</Text>
          <View style={styles.infoItem}>
            <Text style={styles.infoText}>• Schedule posts up to 30 days in advance</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoText}>• Free users: 2 posts per day</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoText}>• Premium users: Unlimited scheduling</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoText}>• Posts will be published automatically</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoText}>• Cancel anytime before publish</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  limitCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a00', margin: 20, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#ffd700', gap: 12 },
  limitText: { flex: 1 },
  limitTitle: { fontSize: 14, fontWeight: '600', color: '#ffd700', marginBottom: 4 },
  limitSub: { fontSize: 12, color: '#999' },
  upgradeBtn: { backgroundColor: '#ffd700', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  upgradeTxt: { fontSize: 12, fontWeight: 'bold', color: '#000' },
  premiumBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a0a0a', marginHorizontal: 20, marginTop: 20, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ffd700', gap: 8, justifyContent: 'center' },
  premiumText: { fontSize: 14, fontWeight: '600', color: '#ffd700' },
  section: { padding: 20 },
  label: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 12 },
  captionInput: { backgroundColor: '#0a0a0a', borderRadius: 12, borderWidth: 1, borderColor: '#333', padding: 16, fontSize: 16, color: '#fff', minHeight: 120, textAlignVertical: 'top' },
  charCount: { fontSize: 12, color: '#666', textAlign: 'right', marginTop: 8 },
  dateTimeButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a0a0a', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#00ff88', marginBottom: 12, gap: 12 },
  dateTimeText: { fontSize: 16, color: '#fff', fontWeight: '600' },
  scheduleButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#00ff88', marginHorizontal: 20, padding: 16, borderRadius: 12, gap: 8 },
  scheduleButtonDisabled: { backgroundColor: '#333', opacity: 0.5 },
  scheduleButtonText: { fontSize: 16, fontWeight: 'bold', color: '#000' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 16 },
  scheduledPost: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0a0a0a', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#1a1a1a', marginBottom: 12 },
  scheduledPostContent: { flex: 1 },
  scheduledPostCaption: { fontSize: 14, color: '#fff', marginBottom: 8 },
  scheduledPostTime: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scheduledPostTimeText: { fontSize: 12, color: '#00ff88' },
  cancelButton: { padding: 8 },
  infoCard: { backgroundColor: '#0a0a0a', margin: 20, padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#1a1a1a' },
  infoTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
  infoItem: { marginBottom: 8 },
  infoText: { fontSize: 14, color: '#999', lineHeight: 20 },
});
	
