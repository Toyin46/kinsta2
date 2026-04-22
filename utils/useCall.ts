// hooks/useCall.ts
// ─────────────────────────────────────────────────────────────
// LumVibe — useCall Hook
// Manages all Agora call state for video and voice calls
// ─────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import agoraService, { CallType } from '@/utils/agoraService';

export interface CallState {
  isInCall: boolean;
  callType: CallType;
  channelName: string;
  localUid: number;
  remoteUid: number | null;
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeakerOn: boolean;
  isFrontCamera: boolean;
  callDuration: number;
  isConnecting: boolean;
  remoteUserJoined: boolean;
}

const initialState: CallState = {
  isInCall: false,
  callType: 'voice',
  channelName: '',
  localUid: 0,
  remoteUid: null,
  isMuted: false,
  isVideoOff: false,
  isSpeakerOn: false,
  isFrontCamera: true,
  callDuration: 0,
  isConnecting: false,
  remoteUserJoined: false,
};

export function useCall(currentUserId: string | null) {
  const [callState, setCallState] = useState<CallState>(initialState);
  const [durationTimer, setDurationTimer] = useState<ReturnType<typeof setInterval> | null>(null);

  // Request permissions
  const requestPermissions = async (callType: CallType): Promise<boolean> => {
    try {
      if (Platform.OS === 'android') {
        const micPermission = await request(PERMISSIONS.ANDROID.RECORD_AUDIO);
        if (micPermission !== RESULTS.GRANTED) {
          Alert.alert('Permission Required', 'Microphone permission is needed for calls.');
          return false;
        }

        if (callType === 'video') {
          const cameraPermission = await request(PERMISSIONS.ANDROID.CAMERA);
          if (cameraPermission !== RESULTS.GRANTED) {
            Alert.alert('Permission Required', 'Camera permission is needed for video calls.');
            return false;
          }
        }
      } else if (Platform.OS === 'ios') {
        const micPermission = await request(PERMISSIONS.IOS.MICROPHONE);
        if (micPermission !== RESULTS.GRANTED) {
          Alert.alert('Permission Required', 'Microphone permission is needed for calls.');
          return false;
        }

        if (callType === 'video') {
          const cameraPermission = await request(PERMISSIONS.IOS.CAMERA);
          if (cameraPermission !== RESULTS.GRANTED) {
            Alert.alert('Permission Required', 'Camera permission is needed for video calls.');
            return false;
          }
        }
      }
      return true;
    } catch (error) {
      console.error('requestPermissions error:', error);
      return false;
    }
  };

  // Start a call
  const startCall = useCallback(async (
    conversationId: string,
    callType: CallType,
    otherUserName: string
  ): Promise<boolean> => {
    if (!currentUserId) return false;

    try {
      // Request permissions
      const hasPermissions = await requestPermissions(callType);
      if (!hasPermissions) return false;

      // Initialize Agora
      await agoraService.initialize();

      const channelName = agoraService.generateChannelName(conversationId);
      const localUid = agoraService.generateUID(currentUserId);

      setCallState(prev => ({
        ...prev,
        isInCall: true,
        callType,
        channelName,
        localUid,
        isConnecting: true,
        isSpeakerOn: callType === 'video',
      }));

      // Join the Agora channel
      const joined = await agoraService.joinCall(
        channelName,
        localUid,
        callType,
        (remoteUid) => {
          // Remote user joined
          setCallState(prev => ({
            ...prev,
            remoteUid,
            isConnecting: false,
            remoteUserJoined: true,
          }));

          // Start duration timer
          const timer = setInterval(() => {
            setCallState(prev => ({
              ...prev,
              callDuration: prev.callDuration + 1,
            }));
          }, 1000);
          setDurationTimer(timer);
        },
        (remoteUid) => {
          // Remote user left
          endCall();
        },
        () => {
          // Call ended
          endCall();
        }
      );

      if (!joined) {
        setCallState(initialState);
        return false;
      }

      // Set speaker for video calls
      if (callType === 'video') {
        agoraService.toggleSpeaker(true);
      }

      return true;
    } catch (error) {
      console.error('startCall error:', error);
      setCallState(initialState);
      return false;
    }
  }, [currentUserId]);

  // End the call
  const endCall = useCallback(async () => {
    try {
      if (durationTimer) {
        clearInterval(durationTimer);
        setDurationTimer(null);
      }
      await agoraService.leaveCall();
      setCallState(initialState);
    } catch (error) {
      console.error('endCall error:', error);
      setCallState(initialState);
    }
  }, [durationTimer]);

  // Toggle mute
  const toggleMute = useCallback(async () => {
    const newMuted = !callState.isMuted;
    await agoraService.toggleMute(newMuted);
    setCallState(prev => ({ ...prev, isMuted: newMuted }));
  }, [callState.isMuted]);

  // Toggle camera
  const toggleCamera = useCallback(async () => {
    const newVideoOff = !callState.isVideoOff;
    await agoraService.toggleCamera(newVideoOff);
    setCallState(prev => ({ ...prev, isVideoOff: newVideoOff }));
  }, [callState.isVideoOff]);

  // Toggle speaker
  const toggleSpeaker = useCallback(async () => {
    const newSpeaker = !callState.isSpeakerOn;
    await agoraService.toggleSpeaker(newSpeaker);
    setCallState(prev => ({ ...prev, isSpeakerOn: newSpeaker }));
  }, [callState.isSpeakerOn]);

  // Switch camera
  const switchCamera = useCallback(async () => {
    await agoraService.switchCamera();
    setCallState(prev => ({ ...prev, isFrontCamera: !prev.isFrontCamera }));
  }, []);

  // Format call duration
  const formatDuration = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (durationTimer) clearInterval(durationTimer);
    };
  }, [durationTimer]);

  return {
    callState,
    startCall,
    endCall,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
    switchCamera,
    formatDuration,
    agoraEngine: agoraService.getEngine(),
  };
} 
