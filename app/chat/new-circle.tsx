// FILE: app/chat/new-circle.tsx
// ─────────────────────────────────────────────────────────────
// LumVibe — Create New Circle Screen
// ✅ Full circle creation (broadcast channel)
// ✅ Name, description, visibility toggle
// ✅ Inserts into circles + circle_subscribers tables
// ─────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar,
  ActivityIndicator, Alert, ScrollView,
  KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../config/supabase';
import { useAuthStore } from '../../store/authStore';

const C = {
  black: '#000000', card: '#1a1a1a', card2: '#222222',
  border: '#2a2a2a', green: '#00e676', greenBg: 'rgba(0,230,118,0.1)',
  white: '#ffffff', muted: '#888888', muted2: '#555555',
};

export default function NewCircleScreen() {
  const { user } = useAuthStore();
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [isPublic,    setIsPublic]    = useState(true);
  const [creating,    setCreating]    = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) { Alert.alert('Circle Name Required', 'Please enter a name for your Circle.'); return; }
    if (!user?.id) return;

    setCreating(true);
    try {
      // 1. Create circle
      const { data: circle, error: circleError } = await supabase
        .from('circles')
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          owner_id: user.id,
          subscriber_count: 1,
          is_public: isPublic,
        })
        .select()
        .single();

      if (circleError) throw circleError;

      // 2. Auto-subscribe the creator
      await supabase.from('circle_subscribers').insert({
        circle_id: circle.id, user_id: user.id,
      });

      // 3. Navigate to the circle
      router.replace({
        pathname: '/chat/circle/[id]',
        params: { id: circle.id },
      } as any);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to create Circle. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.black} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>New Circle</Text>
        <TouchableOpacity
          style={[s.createBtn, !name.trim() && { opacity: 0.4 }]}
          onPress={handleCreate}
          disabled={creating || !name.trim()}
        >
          {creating
            ? <ActivityIndicator size="small" color="#000" />
            : <Text style={s.createBtnText}>Create</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} showsVerticalScrollIndicator={false}>

          {/* Icon preview */}
          <View style={s.iconPreview}>
            <View style={s.circleIcon}>
              <Ionicons name="radio-outline" size={36} color={C.green} />
            </View>
            <View>
              <Text style={s.previewTitle}>{name || 'Your Circle Name'}</Text>
              <Text style={s.previewSub}>0 subscribers · by you</Text>
            </View>
          </View>

          {/* Name */}
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>CIRCLE NAME *</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Daily Motivation, Tech Tips…"
              placeholderTextColor={C.muted2}
              value={name}
              onChangeText={setName}
              maxLength={50}
            />
            <Text style={s.charCount}>{name.length}/50</Text>
          </View>

          {/* Description */}
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>DESCRIPTION</Text>
            <TextInput
              style={[s.input, s.multilineInput]}
              placeholder="What is this Circle about? What will you share?"
              placeholderTextColor={C.muted2}
              value={description}
              onChangeText={setDescription}
              maxLength={300}
              multiline
              numberOfLines={4}
            />
            <Text style={s.charCount}>{description.length}/300</Text>
          </View>

          {/* Visibility toggle */}
          <View style={s.toggleRow}>
            <View>
              <Text style={s.toggleLabel}>Public Circle</Text>
              <Text style={s.toggleSub}>
                {isPublic
                  ? 'Anyone can find and follow your Circle'
                  : 'Only people you invite can follow'}
              </Text>
            </View>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              trackColor={{ false: C.card2, true: C.green }}
              thumbColor={C.white}
            />
          </View>

          {/* What is a Circle */}
          <View style={s.infoCard}>
            <View style={s.infoRow}>
              <Ionicons name="radio-outline" size={18} color={C.green} />
              <Text style={s.infoTitle}>What is a Circle?</Text>
            </View>
            <Text style={s.infoText}>
              Circles are broadcast channels — only you post, your followers read. Perfect for sharing updates, tips, or exclusive content with your audience.
            </Text>
            <View style={{ marginTop: 12, gap: 6 }}>
              {[
                'You post, subscribers read',
                'Subscribers get notified on each post',
                'Grow your audience without a two-way chat',
                'Share text, images, voice notes',
              ].map((tip, i) => (
                <View key={i} style={s.tipRow}>
                  <View style={s.tipDot} />
                  <Text style={s.tipText}>{tip}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: C.black },
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  backBtn:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: C.white, marginLeft: 4 },
  createBtn:  { backgroundColor: C.green, paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20 },
  createBtnText: { fontSize: 13, fontWeight: '800', color: '#000' },

  iconPreview: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border },
  circleIcon:  { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(0,230,118,0.1)', borderWidth: 1.5, borderColor: C.green, alignItems: 'center', justifyContent: 'center' },
  previewTitle: { fontSize: 16, fontWeight: '700', color: C.white, marginBottom: 4 },
  previewSub:  { fontSize: 12, color: C.muted },

  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 10.5, fontWeight: '700', color: C.muted, letterSpacing: 0.8, textTransform: 'uppercase' },
  input:      { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: C.white, fontSize: 14 },
  multilineInput: { minHeight: 100, textAlignVertical: 'top' },
  charCount:  { fontSize: 10, color: C.muted2, textAlign: 'right' },

  toggleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border },
  toggleLabel: { fontSize: 14, fontWeight: '700', color: C.white, marginBottom: 3 },
  toggleSub:  { fontSize: 12, color: C.muted, maxWidth: 250 },

  infoCard:   { backgroundColor: '#0a140a', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(0,230,118,0.2)' },
  infoRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  infoTitle:  { fontSize: 14, fontWeight: '700', color: C.green },
  infoText:   { fontSize: 13, color: C.muted, lineHeight: 20 },
  tipRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tipDot:     { width: 5, height: 5, borderRadius: 2.5, backgroundColor: C.green },
  tipText:    { fontSize: 12, color: C.muted, flex: 1 },
}); 
