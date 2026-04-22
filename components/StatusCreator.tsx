// components/StatusCreator.tsx - WhatsApp-Style Text & Voice Status
import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Animated, Modal, ScrollView, Alert
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';

interface StatusCreatorProps {
  visible: boolean;
  onClose: () => void;
  onPost: (content: string, type: 'text' | 'voice', backgroundColor?: string, voiceUri?: string) => void;
}

// ✅ FIX: Define type for background
type BackgroundColor = {
  readonly id: string;
  readonly colors: readonly [string, string];
  readonly name: string;
};

// ✅ FIX: Add 'as const' to make arrays readonly
const BACKGROUND_COLORS: readonly BackgroundColor[] = [
  { id: 'purple', colors: ['#667eea', '#764ba2'] as const, name: 'Purple Dream' },
  { id: 'sunset', colors: ['#f83600', '#f9d423'] as const, name: 'Sunset' },
  { id: 'ocean', colors: ['#2E3192', '#1BFFFF'] as const, name: 'Ocean Blue' },
  { id: 'forest', colors: ['#134E5E', '#71B280'] as const, name: 'Forest' },
  { id: 'fire', colors: ['#eb3349', '#f45c43'] as const, name: 'Fire' },
  { id: 'midnight', colors: ['#232526', '#414345'] as const, name: 'Midnight' },
  { id: 'rose', colors: ['#f857a6', '#ff5858'] as const, name: 'Rose' },
  { id: 'mint', colors: ['#00b09b', '#96c93d'] as const, name: 'Mint' },
] as const;

const FONTS = [
  { id: 'default', name: 'Default', style: {} },
  { id: 'bold', name: 'Bold', style: { fontWeight: 'bold' as const } },
  { id: 'italic', name: 'Italic', style: { fontStyle: 'italic' as const } },
  { id: 'bolditalic', name: 'Bold Italic', style: { fontWeight: 'bold' as const, fontStyle: 'italic' as const } },
];

export default function StatusCreator({ visible, onClose, onPost }: StatusCreatorProps) {
  const [mode, setMode] = useState<'text' | 'voice'>('text');
  const [text, setText] = useState('');
  
  // ✅ FIX: Store only the ID, not the whole object
  const [selectedBgId, setSelectedBgId] = useState<string>('purple');
  const [selectedFont, setSelectedFont] = useState(FONTS[0]);
 
  // Voice recording
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
 
  const recordingInterval = useRef<NodeJS.Timeout | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ✅ Helper to get current background object
  const selectedBg = BACKGROUND_COLORS.find(bg => bg.id === selectedBgId) || BACKGROUND_COLORS[0];

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, fadeAnim]);

  useEffect(() => {
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync();
      }
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [recording, sound]);

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Microphone permission is required to record voice');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      setIsRecording(true);
      setRecordingDuration(0);

      recordingInterval.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecordedUri(uri);
      setRecording(null);
      setIsRecording(false);

      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
    }
  };

  const playRecording = async () => {
    if (!recordedUri) return;

    try {
      if (sound) {
        await sound.unloadAsync();
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: recordedUri },
        { shouldPlay: true }
      );

      setSound(newSound);
      setIsPlaying(true);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
        }
      });
    } catch (err) {
      console.error('Failed to play recording', err);
    }
  };

  const deleteRecording = () => {
    setRecordedUri(null);
    setRecordingDuration(0);
    if (sound) {
      sound.unloadAsync();
      setSound(null);
    }
  };

  const handlePost = () => {
    if (mode === 'text') {
      if (!text.trim()) {
        Alert.alert('Empty Status', 'Please type something');
        return;
      }
      // ✅ Pass the ID, not the object
      onPost(text.trim(), 'text', selectedBgId);
      setText('');
    } else {
      if (!recordedUri) {
        Alert.alert('No Recording', 'Please record a voice message first');
        return;
      }
      onPost('', 'voice', undefined, recordedUri);
      setRecordedUri(null);
      setRecordingDuration(0);
    }
    onClose();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Feather name="x" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.modeSelector}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'text' && styles.modeBtnActive]}
              onPress={() => setMode('text')}
            >
              <Text style={[styles.modeBtnText, mode === 'text' && styles.modeBtnTextActive]}>
                Text
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'voice' && styles.modeBtnActive]}
              onPress={() => setMode('voice')}
            >
              <Text style={[styles.modeBtnText, mode === 'voice' && styles.modeBtnTextActive]}>
                Voice
              </Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={handlePost}
            style={styles.postBtn}
          >
            <Feather name="send" size={24} color="#00ff88" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        {mode === 'text' ? (
          <Animated.View style={[styles.textModeContainer, { opacity: fadeAnim }]}>
            {/* Text Preview */}
            <LinearGradient
              colors={selectedBg.colors}
              style={styles.previewContainer}
            >
              <TextInput
                style={[styles.textPreview, selectedFont.style]}
                value={text}
                onChangeText={setText}
                placeholder="Type a status..."
                placeholderTextColor="rgba(255,255,255,0.5)"
                multiline
                maxLength={700}
                autoFocus
              />
              <Text style={styles.charCount}>{text.length}/700</Text>
            </LinearGradient>

            {/* Background Colors */}
            <View style={styles.optionsSection}>
              <Text style={styles.optionTitle}>🎨 Background</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.optionsScroll}>
                {BACKGROUND_COLORS.map((bg) => (
                  <TouchableOpacity
                    key={bg.id}
                    onPress={() => setSelectedBgId(bg.id)}
                    activeOpacity={0.7}
                  >
                    <LinearGradient
                      colors={bg.colors}
                      style={[
                        styles.bgOption,
                        selectedBgId === bg.id && styles.bgOptionSelected
                      ]}
                    >
                      {selectedBgId === bg.id && (
                        <Feather name="check" size={20} color="#fff" />
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Font Styles */}
            <View style={styles.optionsSection}>
              <Text style={styles.optionTitle}>✏️ Font Style</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.optionsScroll}>
                {FONTS.map((font) => (
                  <TouchableOpacity
                    key={font.id}
                    style={[
                      styles.fontOption,
                      selectedFont.id === font.id && styles.fontOptionSelected
                    ]}
                    onPress={() => setSelectedFont(font)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.fontOptionText, font.style]}>
                      {font.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </Animated.View>
        ) : (
          <Animated.View style={[styles.voiceModeContainer, { opacity: fadeAnim }]}>
            <View style={styles.voiceRecordArea}>
              <MaterialCommunityIcons
                name="microphone"
                size={100}
                color={isRecording ? "#ff0000" : "#00ff88"}
              />
             
              {isRecording && (
                <View style={styles.recordingIndicator}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingText}>Recording...</Text>
                </View>
              )}

              <Text style={styles.durationText}>
                {formatDuration(recordingDuration)}
              </Text>

              {recordedUri && !isRecording && (
                <View style={styles.recordedControls}>
                  <TouchableOpacity
                    style={styles.playBtn}
                    onPress={playRecording}
                  >
                    <Feather
                      name={isPlaying ? "pause" : "play"}
                      size={32}
                      color="#00ff88"
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={deleteRecording}
                  >
                    <Feather name="trash-2" size={24} color="#ff0000" />
                  </TouchableOpacity>
                </View>
              )}

              {!recordedUri && (
                <TouchableOpacity
                  style={[
                    styles.recordBtn,
                    isRecording && styles.recordBtnActive
                  ]}
                  onPress={isRecording ? stopRecording : startRecording}
                  onLongPress={startRecording}
                  onPressOut={() => {
                    if (isRecording) stopRecording();
                  }}
                >
                  <Text style={styles.recordBtnText}>
                    {isRecording ? 'Tap to Stop' : 'Tap or Hold to Record'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.voiceInfo}>
              <MaterialCommunityIcons name="information" size={20} color="#666" />
              <Text style={styles.voiceInfoText}>
                Maximum 60 seconds recording
              </Text>
            </View>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#111',
  },
  backBtn: {
    padding: 8,
  },
  modeSelector: {
    flexDirection: 'row',
    backgroundColor: '#222',
    borderRadius: 25,
    padding: 4,
  },
  modeBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },
  modeBtnActive: {
    backgroundColor: '#00ff88',
  },
  modeBtnText: {
    color: '#999',
    fontSize: 15,
    fontWeight: '600',
  },
  modeBtnTextActive: {
    color: '#000',
  },
  postBtn: {
    padding: 8,
  },

  // Text Mode
  textModeContainer: {
    flex: 1,
    padding: 16,
  },
  previewContainer: {
    flex: 1,
    borderRadius: 20,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  textPreview: {
    color: '#fff',
    fontSize: 28,
    textAlign: 'center',
    width: '100%',
    minHeight: 200,
  },
  charCount: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  optionsSection: {
    marginBottom: 20,
  },
  optionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  optionsScroll: {
    flexDirection: 'row',
  },
  bgOption: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bgOptionSelected: {
    borderWidth: 3,
    borderColor: '#fff',
  },
  fontOption: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#222',
    borderRadius: 20,
    marginRight: 12,
  },
  fontOptionSelected: {
    backgroundColor: '#00ff88',
  },
  fontOptionText: {
    color: '#fff',
    fontSize: 14,
  },

  // Voice Mode
  voiceModeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  voiceRecordArea: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    gap: 8,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ff0000',
  },
  recordingText: {
    color: '#ff0000',
    fontSize: 16,
    fontWeight: '600',
  },
  durationText: {
    color: '#00ff88',
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 20,
  },
  recordedControls: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 30,
  },
  playBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#00ff88',
  },
  deleteBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ff0000',
  },
  recordBtn: {
    marginTop: 40,
    paddingHorizontal: 40,
    paddingVertical: 20,
    backgroundColor: '#00ff88',
    borderRadius: 30,
  },
  recordBtnActive: {
    backgroundColor: '#ff0000',
  },
  recordBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  voiceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 40,
  },
  voiceInfoText: {
    color: '#666',
    fontSize: 14,
  },
});