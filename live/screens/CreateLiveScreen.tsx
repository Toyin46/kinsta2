// FILE: features/live/screens/CreateLiveScreen.tsx
// Kinsta Live — Host sets up their stream before going live

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { createLiveRoom } from '../constants/services/liveService'; 
import { useAuth } from '@/contexts/AuthContext'; 
import { Ionicons } from '@expo/vector-icons';

const CATEGORIES = [
  { id: 'music', emoji: '🎵', label: 'Music' },
  { id: 'talk', emoji: '💬', label: 'Talk' },
  { id: 'gaming', emoji: '🎮', label: 'Gaming' },
  { id: 'cooking', emoji: '🍳', label: 'Cooking' },
  { id: 'fashion', emoji: '👗', label: 'Fashion' },
  { id: 'education', emoji: '📚', label: 'Education' },
  { id: 'general', emoji: '✨', label: 'General' },
];

const MOODS = [
  { id: 'chill', emoji: '😌', label: 'Chill' },
  { id: 'hype', emoji: '🔥', label: 'Hype' },
  { id: 'emotional', emoji: '💙', label: 'Emotional' },
  { id: 'educational', emoji: '🧠', label: 'Educational' },
];

export default function CreateLiveScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [mood, setMood] = useState('chill');
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState(new Date(Date.now() + 3600000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [hasGiftGoal, setHasGiftGoal] = useState(false);
  const [giftGoalAmount, setGiftGoalAmount] = useState('');
  const [giftGoalLabel, setGiftGoalLabel] = useState('');
  const [allowGuests, setAllowGuests] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleGoLive = async () => {
    if (!title.trim()) {
      Alert.alert('Missing title', 'Please give your live a title');
      return;
    }
    if (!user?.id) {
      Alert.alert('Not logged in');
      return;
    }

    setLoading(true);
    try {
      const room = await createLiveRoom({
        hostId: user.id,
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        mood,
        scheduledAt: isScheduled ? scheduledDate.toISOString() : undefined,
        giftGoalAmount:
          hasGiftGoal && giftGoalAmount ? parseInt(giftGoalAmount) : undefined,
        giftGoalLabel: hasGiftGoal ? giftGoalLabel || undefined : undefined,
        allowGuests,
      });

      router.replace({
        pathname: './(live)/room/[id]',
        params: { id: room.id, isHost: 'true' },
      });
    } catch (err: any) {
      console.error('createLiveRoom error:', err);
      Alert.alert('Error', err.message ?? 'Could not create live room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Set up your Live</Text>

        {/* Title */}
        <Text style={styles.label}>Title *</Text>
        <TextInput
          style={styles.input}
          placeholder="What's your live about?"
          placeholderTextColor="#555"
          value={title}
          onChangeText={setTitle}
          maxLength={80}
        />
        <Text style={styles.charCount}>{title.length}/80</Text>

        {/* Description */}
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Tell viewers what to expect..."
          placeholderTextColor="#555"
          value={description}
          onChangeText={setDescription}
          maxLength={200}
          multiline
          numberOfLines={3}
        />

        {/* Category */}
        <Text style={styles.label}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.chip, category === cat.id && styles.chipActive]}
                onPress={() => setCategory(cat.id)}
              >
                <Text style={styles.chipEmoji}>{cat.emoji}</Text>
                <Text
                  style={[
                    styles.chipLabel,
                    category === cat.id && styles.chipLabelActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Mood */}
        <Text style={styles.label}>Vibe / Mood</Text>
        <View style={styles.chipRow}>
          {MOODS.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.chip, mood === m.id && styles.chipActive]}
              onPress={() => setMood(m.id)}
            >
              <Text style={styles.chipEmoji}>{m.emoji}</Text>
              <Text
                style={[styles.chipLabel, mood === m.id && styles.chipLabelActive]}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Schedule toggle */}
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Schedule for later</Text>
            <Text style={styles.toggleSub}>Let followers RSVP in advance</Text>
          </View>
          <Switch
            value={isScheduled}
            onValueChange={setIsScheduled}
            trackColor={{ false: '#333', true: '#E040FB' }}
            thumbColor="#fff"
          />
        </View>

        {isScheduled && (
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={18} color="#E040FB" />
            <Text style={styles.dateText}>
              {scheduledDate.toLocaleDateString()} at{' '}
              {scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </TouchableOpacity>
        )}

        {showDatePicker && (
          <DateTimePicker
            value={scheduledDate}
            mode="datetime"
            minimumDate={new Date()}
            onChange={(_, date) => {
              setShowDatePicker(false);
              if (date) setScheduledDate(date);
            }}
          />
        )}

        {/* Gift goal toggle */}
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Set a Gift Goal</Text>
            <Text style={styles.toggleSub}>Viewers see progress bar toward your goal</Text>
          </View>
          <Switch
            value={hasGiftGoal}
            onValueChange={setHasGiftGoal}
            trackColor={{ false: '#333', true: '#E040FB' }}
            thumbColor="#fff"
          />
        </View>

        {hasGiftGoal && (
          <View style={styles.goalInputRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Goal (coins)"
              placeholderTextColor="#555"
              value={giftGoalAmount}
              onChangeText={setGiftGoalAmount}
              keyboardType="numeric"
            />
            <TextInput
              style={[styles.input, { flex: 2, marginLeft: 10 }]}
              placeholder="e.g. 'I'll do a dance!'"
              placeholderTextColor="#555"
              value={giftGoalLabel}
              onChangeText={setGiftGoalLabel}
              maxLength={60}
            />
          </View>
        )}

        {/* Allow guests toggle */}
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>Allow Guest Invites</Text>
            <Text style={styles.toggleSub}>Viewers can request to appear on screen</Text>
          </View>
          <Switch
            value={allowGuests}
            onValueChange={setAllowGuests}
            trackColor={{ false: '#333', true: '#E040FB' }}
            thumbColor="#fff"
          />
        </View>

        {/* Go Live Button */}
        <TouchableOpacity
          style={[styles.goLiveButton, loading && { opacity: 0.6 }]}
          onPress={handleGoLive}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="videocam" size={20} color="#fff" />
              <Text style={styles.goLiveButtonText}>
                {isScheduled ? 'Schedule Live' : 'Go Live Now'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  content: { padding: 20, paddingBottom: 60 },
  heading: { color: '#fff', fontSize: 24, fontWeight: '800', marginBottom: 24 },
  label: { color: '#aaa', fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: '#151515',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
  },
  textArea: { height: 80, textAlignVertical: 'top', paddingTop: 12 },
  charCount: { color: '#555', fontSize: 11, textAlign: 'right', marginTop: 4 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  chipActive: { backgroundColor: '#2A1A35', borderColor: '#E040FB' },
  chipEmoji: { fontSize: 14 },
  chipLabel: { color: '#888', fontSize: 13 },
  chipLabelActive: { color: '#E040FB', fontWeight: '700' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#151515',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  toggleLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
  toggleSub: { color: '#666', fontSize: 12, marginTop: 2 },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E040FB33',
  },
  dateText: { color: '#E040FB', fontSize: 14, fontWeight: '600' },
  goalInputRow: { flexDirection: 'row', marginTop: 10, gap: 0 },
  goLiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#E040FB',
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 32,
    shadowColor: '#E040FB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  goLiveButtonText: { color: '#fff', fontSize: 17, fontWeight: '800' },
}); 
