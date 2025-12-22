// app/(tabs)/create.tsx - Using EXPO CAMERA (not Vision Camera)
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, TextInput, Alert, StyleSheet, ScrollView,
  ActivityIndicator, Dimensions, Animated, Modal, Linking, Platform
} from 'react-native';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Camera, CameraType, FlashMode, CameraCapturedPicture } from 'expo-camera/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Audio } from 'expo-av';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '@/config/supabase';
import { useAuthStore } from '@/store/authStore';
import { router } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';

type MediaType = 'image' | 'video' | null;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const FILTERS = [
  { id: 'original', name: 'Original', emoji: '✨', intensity: 0 },
  { id: 'beauty', name: 'Beauty', emoji: '💄', intensity: 0.5 },
  { id: 'vintage', name: 'Vintage', emoji: '📷', intensity: 0.6 },
  { id: 'cool', name: 'Cool', emoji: '❄️', intensity: 0.7 },
  { id: 'warm', name: 'Warm', emoji: '🔥', intensity: 0.7 },
  { id: 'dramatic', name: 'Dramatic', emoji: '🎭', intensity: 0.8 },
  { id: 'bright', name: 'Bright', emoji: '☀️', intensity: 0.6 },
  { id: 'noir', name: 'Noir', emoji: '🎬', intensity: 0.9 },
  { id: 'neon', name: 'Neon', emoji: '💜', intensity: 0.8 },
  { id: 'sunset', name: 'Sunset', emoji: '🌅', intensity: 0.7 },
];

const EDITING_APPS = [
  {
    id: 'capcut',
    name: 'CapCut',
    icon: '🎬',
    color: '#000000',
    description: 'Professional video editor with trending templates',
    features: ['Templates', 'Transitions', 'Effects', 'Speed Control'],
    appStore: 'https://apps.apple.com/app/capcut-video-editor/id1500855883',
    playStore: 'https://play.google.com/store/apps/details?id=com.lemon.lvoverseas',
    scheme: 'capcut://',
    type: 'video'
  },
  {
    id: 'snapchat',
    name: 'Snapchat',
    icon: '👻',
    color: '#FFFC00',
    description: 'Amazing AR filters and lenses',
    features: ['AR Filters', 'Face Lenses', '3D Effects', 'Stickers'],
    appStore: 'https://apps.apple.com/app/snapchat/id447188370',
    playStore: 'https://play.google.com/store/apps/details?id=com.snapchat.android',
    scheme: 'snapchat://',
    type: 'both'
  },
];

export default function CreatePostScreen() {
  const { user } = useAuthStore();
  const soundRef = useRef<Audio.Sound | null>(null);
  const cameraRef = useRef<Camera>(null);
  const originalImageRef = useRef<string | null>(null);
  const recordingProgress = useRef(new Animated.Value(0)).current;

  const [cameraType, setCameraType] = useState(CameraType.back);
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>(null);
  const [filter, setFilter] = useState('original');
  const [filterIntensity, setFilterIntensity] = useState(0.5);

  const [showEditingApps, setShowEditingApps] = useState(false);
  const [showImportGuide, setShowImportGuide] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [flash, setFlash] = useState(FlashMode.off);

  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState<string | null>(null);
  const [locationCoords, setLocationCoords] = useState<{latitude: number, longitude: number} | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<string | null>(null);
  const [selectedMusicName, setSelectedMusicName] = useState<string | null>(null);
  const [musicArtist, setMusicArtist] = useState<string | null>(null);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      const { status: cameraStatus } = await Camera.requestCameraPermissionsAsync();
      const { status: micStatus } = await Camera.requestMicrophonePermissionsAsync();
      setHasPermission(cameraStatus === 'granted' && micStatus === 'granted');
      await Location.requestForegroundPermissionsAsync();
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    })();
    return () => {
      stopMusic();
    };
  }, []);

  const applyFilter = async (uri: string, filterId: string) => {
    if (filterId === 'original') return uri;
   
    const filterSettings = FILTERS.find(f => f.id === filterId);
    if (!filterSettings) return uri;

    try {
      let manipulations: any[] = [];

      switch (filterId) {
        case 'beauty':
        case 'vintage':
        case 'cool':
        case 'warm':
        case 'dramatic':
        case 'bright':
        case 'noir':
        case 'neon':
        case 'sunset':
          manipulations = [{ resize: { width: 1080 } }];
          break;
        default:
          manipulations = [{ resize: { width: 1080 } }];
      }

      const result = await ImageManipulator.manipulateAsync(
        uri,
        manipulations,
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
     
      return result.uri;
    } catch (error) {
      console.log('Filter error:', error);
      return uri;
    }
  };

  const openEditingApp = async (app: typeof EDITING_APPS[0]) => {
    try {
      const canOpen = await Linking.canOpenURL(app.scheme);
    
      if (canOpen) {
        Alert.alert(
          `Edit in ${app.name}`,
          `You'll be taken to ${app.name} to edit your ${mediaType}.\n\n📝 Steps:\n1. Edit your ${mediaType}\n2. Save/Export\n3. Return here and tap "Import Edited Media"\n4. Select your edited file\n5. Post!`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: `Open ${app.name}`,
              onPress: async () => {
                try {
                  await Linking.openURL(app.scheme);
                  setShowEditingApps(false);
                  setTimeout(() => {
                    setShowImportGuide(true);
                  }, 1000);
                } catch (error) {
                  Alert.alert('Error', `Could not open ${app.name}`);
                }
              }
            }
          ]
        );
      } else {
        Alert.alert(
          `${app.name} Not Installed`,
          `${app.name} is required for professional editing. Would you like to install it?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Install',
              onPress: () => {
                const storeUrl = Platform.OS === 'ios' ? app.appStore : app.playStore;
                Linking.openURL(storeUrl);
              }
            }
          ]
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Could not check app availability');
    }
  };

  const importEditedMedia = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: false,
        quality: 1
      });
    
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.type === 'video') {
          setSelectedMedia(asset.uri);
          setMediaType('video');
        } else {
          originalImageRef.current = asset.uri;
          setSelectedMedia(asset.uri);
          setMediaType('image');
        }
        setShowImportGuide(false);
        Alert.alert('Success! 🎉', 'Your edited media has been imported successfully!');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to import media');
    }
  };

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
        originalImageRef.current = photo.uri;
        const filteredUri = await applyFilter(photo.uri, filter);
        setSelectedMedia(filteredUri);
        setMediaType('image');
      } catch (error) {
        console.log('Take picture error:', error);
        Alert.alert('Error', 'Failed to take picture');
      }
    }
  };

  const startRecording = async () => {
    if (cameraRef.current && !isRecording) {
      try {
        setIsRecording(true);
        Animated.timing(recordingProgress, {
          toValue: 1,
          duration: 60000,
          useNativeDriver: false,
        }).start();
       
        const video = await cameraRef.current.recordAsync({ maxDuration: 60 });
        setSelectedMedia(video.uri);
        setMediaType('video');
        setIsRecording(false);
        recordingProgress.setValue(0);
      } catch (error) {
        console.log('Recording error:', error);
        setIsRecording(false);
        recordingProgress.setValue(0);
      }
    }
  };

  const stopRecording = async () => {
    if (cameraRef.current && isRecording) {
      try {
        cameraRef.current.stopRecording();
        setIsRecording(false);
        recordingProgress.setValue(0);
      } catch (error) {
        console.log('Stop recording error:', error);
      }
    }
  };

  const toggleCameraFacing = () => {
    setCameraType(current => (current === CameraType.back ? CameraType.front : CameraType.back));
  };

  const pickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.9
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.type === 'video') {
          setSelectedMedia(asset.uri);
          setMediaType('video');
        } else {
          originalImageRef.current = asset.uri;
          const filteredUri = await applyFilter(asset.uri, filter);
          setSelectedMedia(filteredUri);
          setMediaType('image');
        }
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to pick media');
    }
  };

  const addLocation = async () => {
    setLoadingLocation(true);
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
        if (newStatus !== 'granted') {
          Alert.alert('Permission Denied', 'Location permission required');
          setLoadingLocation(false);
          return;
        }
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = position.coords;
      setLocationCoords({ latitude, longitude });

      const geocoded = await Location.reverseGeocodeAsync({ latitude, longitude });

      if (geocoded && geocoded[0]) {
        const place = geocoded[0];
        const parts = [];
        if (place.city) parts.push(place.city);
        if (place.region) parts.push(place.region);
        if (place.country) parts.push(place.country);
        const locationStr = parts.length > 0 ? parts.slice(0, 2).join(', ') : 'Unknown location';
        setLocation(locationStr);
        Alert.alert('Location Added', locationStr);
      } else {
        setLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        Alert.alert('Location Added', 'Coordinates saved');
      }
    } catch (error: any) {
      Alert.alert('Location Error', error.message || 'Could not get location');
    } finally {
      setLoadingLocation(false);
    }
  };

  const pickMusic = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: 'audio/*' });
      if (res.canceled) return;
      const fullName = res.assets[0].name || 'Unknown Track';
      const parts = fullName.replace(/\.[^.]+$/, '').split('-').map(p => p.trim());
      if (parts.length >= 2) {
        setMusicArtist(parts[0]);
        setSelectedMusicName(parts.slice(1).join(' - '));
      } else {
        setMusicArtist('Unknown Artist');
        setSelectedMusicName(parts[0]);
      }
      setSelectedMusic(res.assets[0].uri);
      await playMusic(res.assets[0].uri);
    } catch (e) {}
  };

  const playMusic = async (uri: string) => {
    try {
      await stopMusic();
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true, isLooping: true });
      soundRef.current = sound;
    } catch (error) {}
  };

  const stopMusic = async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      } catch (error) {}
    }
  };

  const changeFilter = async (newFilter: string) => {
    setFilter(newFilter);
    if (originalImageRef.current && mediaType === 'image') {
      const filteredUri = await applyFilter(originalImageRef.current, newFilter);
      setSelectedMedia(filteredUri);
    }
  };

  const handleSchedulePost = () => {
    try {
      router.push('/schedule-post');
    } catch (error) {
      Alert.alert('Error', 'Could not open schedule screen');
    }
  };

  const handlePost = async () => {
    if (!user || !selectedMedia) {
      Alert.alert('Error', 'Please login and select media');
      return;
    }
    if (isScheduled && scheduleDate <= new Date()) {
      Alert.alert('Invalid Date', 'Scheduled date must be in future');
      return;
    }
    setUploading(true);
    try {
      const fileExt = selectedMedia.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;
      const resp = await fetch(selectedMedia);
      const fileBlob = await resp.blob();
      const contentType = mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
      const { error: upError } = await supabase.storage.from('posts').upload(filePath, fileBlob, { contentType });
      if (upError) throw upError;
      const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(filePath);
      const row: any = {
        user_id: user.id,
        caption: caption.trim() || '',
        media_url: publicUrl,
        media_type: mediaType,
        filter_applied: filter !== 'original' ? filter : null,
        likes_count: 0,
        comments_count: 0,
        created_at: new Date().toISOString(),
        is_published: !isScheduled,
        scheduled_for: isScheduled ? scheduleDate.toISOString() : null,
      };
      if (location) {
        row.location = location;
        if (locationCoords) {
          row.latitude = locationCoords.latitude;
          row.longitude = locationCoords.longitude;
        }
      }
      if (selectedMusicName && musicArtist) {
        row.music_name = selectedMusicName;
        row.music_artist = musicArtist;
      }
      if (selectedMusic) row.music_url = selectedMusic;
      const { error: dbError } = await supabase.from('posts').insert(row);
      if (dbError) throw dbError;
      Alert.alert('Success! 🎉', isScheduled ? 'Post scheduled!' : 'Posted successfully!', [
        { text: 'OK', onPress: () => { stopMusic(); router.back(); } }
      ]);
    } catch (e: any) {
      Alert.alert('Upload Failed', e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setScheduleDate(selectedDate);
      setShowTimePicker(true);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const combined = new Date(scheduleDate);
      combined.setHours(selectedTime.getHours());
      combined.setMinutes(selectedTime.getMinutes());
      setScheduleDate(combined);
      setIsScheduled(true);
    }
  };

  // Camera Screen
  if (!selectedMedia) {
    if (hasPermission === null || hasPermission === false) {
      return (
        <View style={s.container}>
          <Text style={s.permissionText}>Camera permission needed</Text>
          <TouchableOpacity
            style={s.permissionButton}
            onPress={async () => {
              const { status } = await Camera.requestCameraPermissionsAsync();
              setHasPermission(status === 'granted');
            }}
          >
            <Text style={s.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={s.snapContainer}>
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          type={cameraType}
          flashMode={flash}
        />
      
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.topBtn}>
            <Feather name="x" size={30} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setFlash(flash === FlashMode.off ? FlashMode.on : FlashMode.off)} style={s.topBtn}>
            <Ionicons name={flash === FlashMode.on ? "flash" : "flash-off"} size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={s.rightTools}>
          <TouchableOpacity onPress={toggleCameraFacing} style={s.tool}>
            <MaterialCommunityIcons name="camera-flip" size={32} color="#fff" />
          </TouchableOpacity>
        </View>

        {isRecording && (
          <View style={s.recordBar}>
            <Animated.View
              style={[s.recordBarFill, {
                width: recordingProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              }]}
            />
          </View>
        )}

        <View style={s.bottomBar}>
          <TouchableOpacity onPress={pickFromGallery} style={s.galleryBtn}>
            <MaterialCommunityIcons name="image-multiple" size={28} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={s.captureBtn}
            onPressIn={startRecording}
            onPressOut={stopRecording}
            onPress={takePicture}
          >
            <View style={[s.captureBtnInner, isRecording && s.recording]} />
          </TouchableOpacity>

          <View style={s.galleryBtn} />
        </View>
      </View>
    );
  }

  // Preview/Edit Screen
  const availableApps = EDITING_APPS.filter(app =>
    app.type === 'both' ||
    (mediaType === 'video' && app.type === 'video') ||
    (mediaType === 'image' && app.type === 'image')
  );

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => { setSelectedMedia(null); setMediaType(null); }}>
          <Feather name="arrow-left" size={24} color="#00ff88" />
        </TouchableOpacity>
        <Text style={s.title}>Create Post</Text>
        <TouchableOpacity style={[s.postBtn, uploading && s.postBtnDis]} onPress={handlePost} disabled={uploading}>
          {uploading ? <ActivityIndicator size="small" color="#000" /> : <Text style={s.postTxt}>Post</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={s.previewRow}>
          <View style={s.mediaBox}>
            {mediaType === 'image' ? (
              <Image source={{ uri: selectedMedia }} style={s.media} />
            ) : (
              <Video source={{ uri: selectedMedia }} style={s.media} useNativeControls resizeMode={ResizeMode.COVER} isLooping />
            )}
          </View>

          {mediaType === 'image' && (
            <View style={s.filterSide}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {FILTERS.map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    style={[s.filterChip, filter === f.id && s.filterChipActive]}
                    onPress={() => changeFilter(f.id)}
                  >
                    <Text style={s.filterEmoji}>{f.emoji}</Text>
                    <Text style={[s.filterName, filter === f.id && s.filterNameActive]}>{f.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        <View style={s.editingSection}>
          <View style={s.editingSectionHeader}>
            <Text style={s.editingSectionTitle}>✨ Professional Editing Tools</Text>
            <Text style={s.editingSectionSubtitle}>Edit with industry-leading apps</Text>
          </View>

          <View style={s.appGrid}>
            {availableApps.map((app) => (
              <TouchableOpacity
                key={app.id}
                style={s.appCard}
                onPress={() => openEditingApp(app)}
                activeOpacity={0.7}
              >
                <View style={[s.appIconContainer, { backgroundColor: app.color + '20' }]}>
                  <Text style={s.appIcon}>{app.icon}</Text>
                </View>
                <Text style={s.appName}>{app.name}</Text>
                <Text style={s.appDescription}>{app.description}</Text>
                <View style={s.appFeatures}>
                  {app.features.slice(0, 2).map((feature, index) => (
                    <View key={index} style={s.featureTag}>
                      <Text style={s.featureText}>{feature}</Text>
                    </View>
                  ))}
                </View>
                <View style={s.appAction}>
                  <Text style={s.appActionText}>Edit Now</Text>
                  <Feather name="external-link" size={16} color="#00ff88" />
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={s.importButton} onPress={importEditedMedia}>
            <MaterialCommunityIcons name="file-import" size={24} color="#00ff88" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.importButtonTitle}>Import Edited Media</Text>
              <Text style={s.importButtonSubtitle}>Select your edited file from gallery</Text>
            </View>
            <Feather name="chevron-right" size={20} color="#00ff88" />
          </TouchableOpacity>
        </View>

        <View style={s.sec}>
          <Text style={s.secTitle}>Caption (optional)</Text>
          <TextInput
            style={s.input}
            placeholder="Write something…"
            placeholderTextColor="#666"
            multiline
            value={caption}
            onChangeText={setCaption}
            maxLength={2200}
          />
          <Text style={s.count}>{caption.length}/2200</Text>
        </View>

        <View style={s.sec}>
          <TouchableOpacity style={s.row} onPress={addLocation} disabled={loadingLocation}>
            <Feather name="map-pin" size={20} color="#00ff88" />
            <View style={{ flex: 1 }}>
              {loadingLocation ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 12 }}>
                  <ActivityIndicator size="small" color="#00ff88" />
                  <Text style={[s.rowTxt, { marginLeft: 8 }]}>Getting location...</Text>
                </View>
              ) : (
                <Text style={s.rowTxt}>{location || 'Add location'}</Text>
              )}
            </View>
            {location && !loadingLocation && (
              <TouchableOpacity onPress={() => { setLocation(null); setLocationCoords(null); }}>
                <Feather name="x-circle" size={18} color="#aaa" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={s.row} onPress={pickMusic}>
            <Feather name="music" size={20} color="#00ff88" />
            <View style={{ flex: 1 }}>
              {selectedMusicName ? (
                <>
                  <Text style={s.rowTxt} numberOfLines={1}>{selectedMusicName}</Text>
                  <Text style={s.subTxt} numberOfLines={1}>{musicArtist}</Text>
                </>
              ) : (
                <Text style={s.rowTxt}>Add music</Text>
              )}
            </View>
            {selectedMusic && (
              <TouchableOpacity onPress={() => { stopMusic(); setSelectedMusic(null); setSelectedMusicName(null); setMusicArtist(null); }}>
                <Feather name="x-circle" size={18} color="#aaa" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={s.scheduleRow} onPress={handleSchedulePost}>
            <View style={s.scheduleIconContainer}>
              <Feather name="clock" size={20} color="#00ff88" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.scheduleTitle}>Schedule Post</Text>
              <Text style={s.scheduleSub}>Plan your content ahead</Text>
            </View>
            <View style={s.scheduleBadge}>
              <Text style={s.scheduleBadgeText}>NEW</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#00ff88" />
          </TouchableOpacity>

          <TouchableOpacity style={s.row} onPress={() => setShowDatePicker(true)}>
            <Feather name="calendar" size={20} color="#00ff88" />
            <View style={{ flex: 1 }}>
              {isScheduled ? (
                <>
                  <Text style={s.rowTxt}>Scheduled</Text>
                  <Text style={s.subTxt}>
                    {scheduleDate.toLocaleDateString()} at {scheduleDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </>
              ) : (
                <Text style={s.rowTxt}>Post immediately</Text>
              )}
            </View>
            {isScheduled && (
              <TouchableOpacity onPress={() => setIsScheduled(false)}>
                <Feather name="x-circle" size={18} color="#aaa" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={showImportGuide} animationType="fade" transparent>
        <View style={s.guideOverlay}>
          <View style={s.guideContent}>
            <View style={s.guideHeader}>
              <Text style={s.guideTitle}>🎬 Editing Guide</Text>
              <TouchableOpacity onPress={() => setShowImportGuide(false)}>
                <Feather name="x" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={s.guideSteps}>
              <View style={s.guideStep}>
                <View style={s.stepNumber}>
                  <Text style={s.stepNumberText}>1</Text>
                </View>
                <View style={s.stepContent}>
                  <Text style={s.stepTitle}>Edit Your Media</Text>
                  <Text style={s.stepDescription}>Use the editing app to apply filters, effects, and templates</Text>
                </View>
              </View>

              <View style={s.guideStep}>
                <View style={s.stepNumber}>
                  <Text style={s.stepNumberText}>2</Text>
                </View>
                <View style={s.stepContent}>
                  <Text style={s.stepTitle}>Save/Export</Text>
                  <Text style={s.stepDescription}>Save or export your edited media to your device</Text>
                </View>
              </View>

              <View style={s.guideStep}>
                <View style={s.stepNumber}>
                  <Text style={s.stepNumberText}>3</Text>
                </View>
                <View style={s.stepContent}>
                  <Text style={s.stepTitle}>Return & Import</Text>
                  <Text style={s.stepDescription}>Come back here and tap "Import Edited Media"</Text>
                </View>
              </View>

              <View style={s.guideStep}>
                <View style={s.stepNumber}>
                  <Text style={s.stepNumberText}>4</Text>
                </View>
                <View style={s.stepContent}>
                  <Text style={s.stepTitle}>Select & Post</Text>
                  <Text style={s.stepDescription}>Choose your edited file and post it!</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={s.guideButton} onPress={importEditedMedia}>
              <MaterialCommunityIcons name="file-import" size={24} color="#000" />
              <Text style={s.guideButtonText}>Import Edited Media Now</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.guideLaterButton} onPress={() => setShowImportGuide(false)}>
              <Text style={s.guideLaterText}>I'll Do It Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {showDatePicker && (
        <DateTimePicker value={scheduleDate} mode="date" display="default" minimumDate={new Date()} onChange={handleDateChange} />
      )}
      {showTimePicker && (
        <DateTimePicker value={scheduleDate} mode="time" display="default" onChange={handleTimeChange} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 12,
    backgroundColor: '#111'
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '600' },
  postBtn: { backgroundColor: '#00ff88', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20 },
  postBtnDis: { backgroundColor: '#555' },
  postTxt: { color: '#000', fontWeight: '600' },

  snapContainer: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  topBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightTools: {
    position: 'absolute',
    right: 20,
    top: '50%',
    transform: [{ translateY: -50 }],
    zIndex: 10,
  },
  tool: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  recordBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: 'rgba(255,255,255,0.3)', zIndex: 10 },
  recordBarFill: { height: '100%', backgroundColor: '#ff0000' },
  bottomBar: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 30,
    zIndex: 10,
  },
  galleryBtn: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 6,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff' },
  recording: { width: 30, height: 30, borderRadius: 5, backgroundColor: '#ff0000' },

  previewRow: { flexDirection: 'row', marginVertical: 12, height: 400, paddingHorizontal: 12 },
  mediaBox: { flex: 1, marginRight: 12, borderRadius: 12, overflow: 'hidden' },
  media: { width: '100%', height: '100%' },
  filterSide: { width: 100 },
  filterChip: {
    backgroundColor: '#222',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 16,
    marginBottom: 8,
    alignItems: 'center',
  },
  filterChipActive: { backgroundColor: '#00ff88' },
  filterEmoji: { fontSize: 24, marginBottom: 4 },
  filterName: { color: '#aaa', fontSize: 11, textAlign: 'center' },
  filterNameActive: { color: '#000', fontWeight: '600' },

  editingSection: {
    marginHorizontal: 12,
    marginVertical: 16,
    backgroundColor: '#0a0a0a',
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: '#00ff88',
  },
  editingSectionHeader: {
    marginBottom: 20,
  },
  editingSectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  editingSectionSubtitle: {
    color: '#999',
    fontSize: 14,
  },
  appGrid: {
    gap: 16,
  },
  appCard: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  appIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  appIcon: {
    fontSize: 32,
  },
  appName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  appDescription: {
    color: '#999',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  appFeatures: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  featureTag: {
    backgroundColor: 'rgba(0,255,136,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,255,136,0.3)',
  },
  featureText: {
    color: '#00ff88',
    fontSize: 11,
    fontWeight: '600',
  },
  appAction: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  appActionText: {
    color: '#00ff88',
    fontSize: 15,
    fontWeight: '600',
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    borderWidth: 2,
    borderColor: '#00ff88',
  },
  importButtonTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  importButtonSubtitle: {
    color: '#999',
    fontSize: 12,
  },

  sec: { paddingHorizontal: 16, marginVertical: 12 },
  secTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  input: {
    backgroundColor: '#111',
    color: '#fff',
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top'
  },
  count: { alignSelf: 'flex-end', color: '#666', fontSize: 11, marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8
  },
  rowTxt: { color: '#fff', marginLeft: 12, flex: 1 },
  subTxt: { color: '#999', fontSize: 13, marginTop: 2, marginLeft: 12 },

  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#00ff88',
  },
  scheduleIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,255,136,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  scheduleTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  scheduleSub: {
    color: '#999',
    fontSize: 12,
    lineHeight: 16,
  },
  scheduleBadge: {
    backgroundColor: '#00ff88',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 8,
  },
  scheduleBadgeText: {
    color: '#000',
    fontSize: 10,
    fontWeight: 'bold',
  },

  guideOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  guideContent: {
    backgroundColor: '#111',
    borderRadius: 24,
    padding: 24,
    borderWidth: 2,
    borderColor: '#00ff88',
  },
  guideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  guideTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  guideSteps: {
    marginBottom: 24,
  },
  guideStep: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  stepNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#00ff88',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  stepNumberText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  stepDescription: {
    color: '#999',
    fontSize: 14,
    lineHeight: 20,
  },
  guideButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00ff88',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  guideButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  guideLaterButton: {
    alignItems: 'center',
    padding: 12,
    marginTop: 8,
  },
  guideLaterText: {
    color: '#999',
    fontSize: 14,
  },

  permissionText: { color: '#fff', fontSize: 16, textAlign: 'center', marginTop: 100 },
  permissionButton: {
    backgroundColor: '#00ff88',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: 20,
  },
  permissionButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
});
	
