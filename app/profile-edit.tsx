// app/(tabs)/edit-profile.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Image, Alert, ActivityIndicator
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/config/supabase'; 
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

export default function EditProfileScreen() {
  const { userProfile, user } = useAuthStore();
 
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isUsernameAvailable, setIsUsernameAvailable] = useState(true);
  const [checkingUsername, setCheckingUsername] = useState(false);

  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile.display_name || '');
      setUsername(userProfile.username || '');
      setBio(userProfile.bio || '');
      setAvatarUrl(userProfile.avatar_url || '');
    }
  }, [userProfile]);

  const checkUsernameAvailability = async (newUsername: string) => {
    if (newUsername === userProfile?.username) {
      setIsUsernameAvailable(true);
      return;
    }

    if (newUsername.length < 3) {
      setIsUsernameAvailable(false);
      return;
    }

    setCheckingUsername(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('username', newUsername)
        .single();

      setIsUsernameAvailable(!data);
    } catch (error) {
      setIsUsernameAvailable(true);
    } finally {
      setCheckingUsername(false);
    }
  };

  const handleUsernameChange = (text: string) => {
    const sanitized = text.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(sanitized);
    checkUsernameAvailability(sanitized);
  };

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
   
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant photo library access');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setAvatarUrl(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;

    if (!displayName.trim()) {
      Alert.alert('Error', 'Display name is required');
      return;
    }

    if (!username.trim() || username.length < 3) {
      Alert.alert('Error', 'Username must be at least 3 characters');
      return;
    }

    if (!isUsernameAvailable) {
      Alert.alert('Error', 'Username is already taken');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          display_name: displayName.trim(),
          username: username.trim(),
          bio: bio.trim(),
          avatar_url: avatarUrl,
        })
        .eq('id', user.id);

      if (error) throw error;

      Alert.alert('Success', 'Profile updated successfully!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error: any) {
      console.error('Update error:', error);
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="x" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Edit Profile</Text>
        <TouchableOpacity onPress={handleSave} disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color="#00ff88" />
          ) : (
            <Text style={s.saveBtn}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.content}>
          <TouchableOpacity style={s.avatarContainer} onPress={handlePickImage}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={s.avatar} />
            ) : (
              <View style={[s.avatar, s.avatarPlaceholder]}>
                <Feather name="user" size={40} color="#00ff88" />
              </View>
            )}
            <View style={s.avatarBadge}>
              <Feather name="camera" size={16} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={s.avatarHint}>Tap to change photo</Text>

          <View style={s.section}>
            <Text style={s.label}>Display Name *</Text>
            <TextInput
              style={s.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Enter your display name"
              placeholderTextColor="#666"
              maxLength={50}
            />
            <Text style={s.hint}>This is how your name appears on your profile</Text>
          </View>

          <View style={s.section}>
            <Text style={s.label}>Username *</Text>
            <View style={s.usernameContainer}>
              <Text style={s.usernamePrefix}>@</Text>
              <TextInput
                style={s.usernameInput}
                value={username}
                onChangeText={handleUsernameChange}
                placeholder="username"
                placeholderTextColor="#666"
                autoCapitalize="none"
                maxLength={30}
              />
              {checkingUsername && (
                <ActivityIndicator size="small" color="#00ff88" />
              )}
              {!checkingUsername && username.length >= 3 && (
                <Feather
                  name={isUsernameAvailable ? "check-circle" : "x-circle"}
                  size={20}
                  color={isUsernameAvailable ? "#00ff88" : "#ff4444"}
                />
              )}
            </View>
            <Text style={[s.hint, !isUsernameAvailable && s.hintError]}>
              {!isUsernameAvailable
                ? 'Username is already taken'
                : 'Lowercase letters, numbers, and underscores only'}
            </Text>
          </View>

          <View style={s.section}>
            <Text style={s.label}>Bio</Text>
            <TextInput
              style={[s.input, s.bioInput]}
              value={bio}
              onChangeText={setBio}
              placeholder="Tell us about yourself..."
              placeholderTextColor="#666"
              multiline
              maxLength={150}
              textAlignVertical="top"
            />
            <Text style={s.charCount}>{bio.length}/150</Text>
          </View>

          <View style={s.infoBox}>
            <Feather name="info" size={20} color="#00ff88" />
            <Text style={s.infoText}>
              Your profile information is visible to all users. Make sure you're comfortable sharing this information publicly.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  saveBtn: {
    fontSize: 16,
    fontWeight: '600',
    color: '#00ff88',
  },
  content: {
    padding: 20,
  },
  avatarContainer: {
    alignSelf: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#00ff88',
  },
  avatarPlaceholder: {
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#00ff88',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#000',
  },
  avatarHint: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#333',
  },
  usernameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  usernamePrefix: {
    fontSize: 16,
    color: '#00ff88',
    fontWeight: '600',
    marginRight: 4,
  },
  usernameInput: {
    flex: 1,
    padding: 16,
    paddingLeft: 0,
    fontSize: 16,
    color: '#fff',
  },
  hint: {
    fontSize: 12,
    color: '#666',
    marginTop: 6,
  },
  hintError: {
    color: '#ff4444',
  },
  bioInput: {
    height: 100,
    paddingTop: 16,
  },
  charCount: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
    marginTop: 6,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,255,136,0.05)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#00ff88',
    gap: 12,
    marginTop: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#999',
    lineHeight: 18,
  },
}); 
	
