// FILE: app/chat/new-group.tsx
// ─────────────────────────────────────────────────────────────
// LumVibe — Create New Group Screen
// ✅ Full working group creation
// ✅ Search and select friends to add
// ✅ Group name + optional description
// ✅ Creates group + group_members rows in Supabase
// ─────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, StatusBar, Image,
  ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../config/supabase';
import { useAuthStore } from '../../store/authStore';

const C = {
  black: '#000000', bg: '#0a0a0a', card: '#1a1a1a', card2: '#222222',
  border: '#2a2a2a', green: '#00e676', greenBg: 'rgba(0,230,118,0.1)',
  red: '#e53935', white: '#ffffff', muted: '#888888', muted2: '#555555',
};

interface Friend {
  id: string; username: string; display_name: string; photo_url?: string;
}

const AV_COLORS = [
  { bg: '#1a2e1a', text: '#00e676' }, { bg: '#1a1a2e', text: '#7c8fff' },
  { bg: '#2e1a1a', text: '#ff7043' }, { bg: '#1a2a1a', text: '#69f0ae' },
  { bg: '#2e1a2a', text: '#f06292' }, { bg: '#2a2a1a', text: '#f5c518' },
];
function getAvColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AV_COLORS[Math.abs(hash) % AV_COLORS.length];
}

export default function NewGroupScreen() {
  const { user } = useAuthStore();
  const [groupName,    setGroupName]    = useState('');
  const [description,  setDescription]  = useState('');
  const [search,       setSearch]       = useState('');
  const [friends,      setFriends]      = useState<Friend[]>([]);
  const [selected,     setSelected]     = useState<Friend[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [creating,     setCreating]     = useState(false);

  useEffect(() => {
    loadFriends();
  }, []);

  const loadFriends = async () => {
    if (!user?.id) return;
    try {
      // Get accepted friends
      const { data: requests } = await supabase
        .from('friend_requests')
        .select('from_user_id, to_user_id')
        .eq('status', 'accepted')
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`);

      if (!requests || requests.length === 0) { setLoading(false); return; }

      const friendIds = requests.map((r: any) =>
        r.from_user_id === user.id ? r.to_user_id : r.from_user_id
      );

      const { data: users } = await supabase
        .from('users').select('id, username, display_name, photo_url').in('id', friendIds);
      setFriends(users || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const toggleSelect = (friend: Friend) => {
    setSelected(prev =>
      prev.find(f => f.id === friend.id)
        ? prev.filter(f => f.id !== friend.id)
        : [...prev, friend]
    );
  };

  const handleCreate = async () => {
    if (!groupName.trim()) { Alert.alert('Group Name Required', 'Please enter a name for your group.'); return; }
    if (selected.length < 1) { Alert.alert('Add Members', 'Please add at least 1 friend to create a group.'); return; }
    if (!user?.id) return;

    setCreating(true);
    try {
      // 1. Create the group
      const { data: group, error: groupError } = await supabase
        .from('groups')
        .insert({
          name: groupName.trim(),
          description: description.trim() || null,
          created_by: user.id,
          member_count: selected.length + 1,
        })
        .select()
        .single();

      if (groupError) throw groupError;

      // 2. Add all members including creator
      const allMembers = [user.id, ...selected.map(f => f.id)];
      const memberRows = allMembers.map(uid => ({
        group_id: group.id,
        user_id: uid,
        role: uid === user.id ? 'admin' : 'member',
      }));

      const { error: membersError } = await supabase
        .from('group_members').insert(memberRows);

      if (membersError) throw membersError;

      // 3. Navigate to the group chat
      router.replace({
        pathname: '/chat/group/[id]',
        params: { id: group.id },
      } as any);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to create group. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const filteredFriends = friends.filter(f =>
    !search ||
    f.display_name?.toLowerCase().includes(search.toLowerCase()) ||
    f.username?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.black} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>New Group</Text>
        <TouchableOpacity
          style={[s.createBtn, (!groupName.trim() || selected.length === 0) && { opacity: 0.4 }]}
          onPress={handleCreate}
          disabled={creating || !groupName.trim() || selected.length === 0}
        >
          {creating
            ? <ActivityIndicator size="small" color="#000" />
            : <Text style={s.createBtnText}>Create</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Group info */}
          <View style={s.infoSection}>
            <View style={s.groupIconWrap}>
              <Ionicons name="people-outline" size={32} color={C.green} />
            </View>
            <View style={{ flex: 1, gap: 10 }}>
              <TextInput
                style={s.nameInput}
                placeholder="Group name (required)"
                placeholderTextColor={C.muted2}
                value={groupName}
                onChangeText={setGroupName}
                maxLength={50}
              />
              <TextInput
                style={s.descInput}
                placeholder="Description (optional)"
                placeholderTextColor={C.muted2}
                value={description}
                onChangeText={setDescription}
                maxLength={200}
              />
            </View>
          </View>

          {/* Selected members chips */}
          {selected.length > 0 && (
            <View style={s.selectedSection}>
              <Text style={s.sectionLabel}>Added ({selected.length})</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.selectedRow}>
                {selected.map(f => {
                  const av = getAvColor(f.id);
                  return (
                    <TouchableOpacity key={f.id} style={s.selectedChip} onPress={() => toggleSelect(f)}>
                      {f.photo_url
                        ? <Image source={{ uri: f.photo_url }} style={s.chipAvatar} />
                        : <View style={[s.chipAvatar, { backgroundColor: av.bg }]}>
                            <Text style={{ color: av.text, fontSize: 13, fontWeight: '700' }}>
                              {(f.display_name || 'U')[0].toUpperCase()}
                            </Text>
                          </View>}
                      <Text style={s.chipName} numberOfLines={1}>{f.display_name.split(' ')[0]}</Text>
                      <View style={s.chipRemove}>
                        <Ionicons name="close" size={10} color="#000" />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Search */}
          <View style={s.searchWrap}>
            <Ionicons name="search-outline" size={15} color={C.muted} />
            <TextInput
              style={s.searchInput}
              placeholder="Search friends…"
              placeholderTextColor={C.muted2}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          {/* Friends list */}
          <Text style={[s.sectionLabel, { paddingHorizontal: 20, marginBottom: 4 }]}>
            Friends · {friends.length}
          </Text>

          {loading ? (
            <ActivityIndicator color={C.green} style={{ marginTop: 40 }} />
          ) : filteredFriends.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons name="people-outline" size={48} color={C.border} />
              <Text style={s.emptyText}>
                {search ? 'No friends match your search' : 'No friends yet'}
              </Text>
            </View>
          ) : (
            filteredFriends.map(friend => {
              const isSelected = !!selected.find(f => f.id === friend.id);
              const av = getAvColor(friend.id);
              return (
                <TouchableOpacity
                  key={friend.id}
                  style={s.friendRow}
                  onPress={() => toggleSelect(friend)}
                  activeOpacity={0.7}
                >
                  <View style={{ position: 'relative' }}>
                    {friend.photo_url
                      ? <Image source={{ uri: friend.photo_url }} style={s.friendAv} />
                      : <View style={[s.friendAv, { backgroundColor: av.bg, alignItems: 'center', justifyContent: 'center' }]}>
                          <Text style={{ color: av.text, fontSize: 16, fontWeight: '700' }}>
                            {(friend.display_name || 'U')[0].toUpperCase()}
                          </Text>
                        </View>}
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.friendName}>{friend.display_name}</Text>
                    <Text style={s.friendHandle}>@{friend.username}</Text>
                  </View>
                  <View style={[s.checkbox, isSelected && s.checkboxSelected]}>
                    {isSelected && <Ionicons name="checkmark" size={14} color="#000" />}
                  </View>
                </TouchableOpacity>
              );
            })
          )}

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
  headerTitle:{ flex: 1, fontSize: 17, fontWeight: '800', color: C.white, marginLeft: 4 },
  createBtn:  { backgroundColor: C.green, paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20 },
  createBtnText: { fontSize: 13, fontWeight: '800', color: '#000' },

  infoSection: { flexDirection: 'row', gap: 14, padding: 20, alignItems: 'flex-start' },
  groupIconWrap: { width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(0,230,118,0.1)', borderWidth: 1.5, borderColor: C.green, alignItems: 'center', justifyContent: 'center' },
  nameInput:  { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: C.white, fontSize: 15, fontWeight: '600' },
  descInput:  { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: C.white, fontSize: 13 },

  selectedSection: { paddingBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, paddingHorizontal: 20 },
  selectedRow: { paddingHorizontal: 20, gap: 10 },
  selectedChip: { alignItems: 'center', gap: 4, position: 'relative' },
  chipAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  chipName:   { fontSize: 10, color: C.white, maxWidth: 52, textAlign: 'center' },
  chipRemove: { position: 'absolute', top: 0, right: 0, width: 16, height: 16, borderRadius: 8, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },

  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 28, paddingHorizontal: 14, marginHorizontal: 20, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, color: C.white, fontSize: 14, paddingVertical: 10 },

  friendRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border },
  friendAv:   { width: 48, height: 48, borderRadius: 24 },
  friendName: { fontSize: 14, fontWeight: '700', color: C.white },
  friendHandle: { fontSize: 12, color: C.muted, marginTop: 2 },
  checkbox:   { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: C.green, borderColor: C.green },

  emptyWrap:  { alignItems: 'center', paddingTop: 50, gap: 12 },
  emptyText:  { fontSize: 14, color: C.muted, textAlign: 'center' },
}); 
