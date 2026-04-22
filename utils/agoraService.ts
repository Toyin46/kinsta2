// utils/agoraService.ts
// ─────────────────────────────────────────────────────────────
// LumVibe — Agora RTC Service
// Handles all video and voice call logic
// ─────────────────────────────────────────────────────────────

import {
  createAgoraRtcEngine,
  IRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  RtcConnection,
  VideoCanvas,
  VideoSourceType,
} from 'react-native-agora';

const AGORA_APP_ID =
  process.env.EXPO_PUBLIC_AGORA_APP_ID || '2203baf2104240b099a85436a2c62488';

export type CallType = 'voice' | 'video';

export interface CallParticipant {
  uid: number;
  isMuted: boolean;
  isVideoOff: boolean;
}

class AgoraService {
  private engine: IRtcEngine | null = null;
  private isInitialized = false;

  // Initialize Agora engine
  async initialize(): Promise<boolean> {
    try {
      if (this.isInitialized) return true;

      this.engine = createAgoraRtcEngine();
      this.engine.initialize({
        appId: AGORA_APP_ID,
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
      });

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Agora initialize error:', error);
      return false;
    }
  }

  // Join a call channel
  async joinCall(
    channelName: string,
    uid: number,
    callType: CallType,
    onUserJoined?: (uid: number) => void,
    onUserLeft?: (uid: number) => void,
    onCallEnded?: () => void
  ): Promise<boolean> {
    try {
      if (!this.engine) await this.initialize();
      if (!this.engine) return false;

      // Enable video for video calls
      if (callType === 'video') {
        this.engine.enableVideo();
        this.engine.startPreview();
      } else {
        this.engine.disableVideo();
      }

      // Enable audio for all calls
      this.engine.enableAudio();

      // Set up event listeners
      this.engine.addListener('onUserJoined', (connection: RtcConnection, uid: number) => {
        onUserJoined?.(uid);
      });

      this.engine.addListener('onUserOffline', (connection: RtcConnection, uid: number) => {
        onUserLeft?.(uid);
        // If remote user leaves, end call
        onCallEnded?.();
      });

      this.engine.addListener('onLeaveChannel', () => {
        onCallEnded?.();
      });

      // Join the channel
      await this.engine.joinChannel(
        '', // Token — empty for testing mode
        channelName,
        uid,
        {
          clientRoleType: ClientRoleType.ClientRoleBroadcaster,
          publishMicrophoneTrack: true,
          publishCameraTrack: callType === 'video',
          autoSubscribeAudio: true,
          autoSubscribeVideo: callType === 'video',
        }
      );

      return true;
    } catch (error) {
      console.error('joinCall error:', error);
      return false;
    }
  }

  // Leave the call
  async leaveCall(): Promise<void> {
    try {
      if (!this.engine) return;
      this.engine.stopPreview();
      this.engine.leaveChannel();
      this.engine.removeAllListeners();
    } catch (error) {
      console.error('leaveCall error:', error);
    }
  }

  // Mute/unmute microphone
  async toggleMute(muted: boolean): Promise<void> {
    try {
      this.engine?.muteLocalAudioStream(muted);
    } catch (error) {
      console.error('toggleMute error:', error);
    }
  }

  // Enable/disable camera
  async toggleCamera(disabled: boolean): Promise<void> {
    try {
      this.engine?.muteLocalVideoStream(disabled);
    } catch (error) {
      console.error('toggleCamera error:', error);
    }
  }

  // Switch between front and back camera
  async switchCamera(): Promise<void> {
    try {
      this.engine?.switchCamera();
    } catch (error) {
      console.error('switchCamera error:', error);
    }
  }

  // Toggle speaker
  async toggleSpeaker(enabled: boolean): Promise<void> {
    try {
      this.engine?.setEnableSpeakerphone(enabled);
    } catch (error) {
      console.error('toggleSpeaker error:', error);
    }
  }

  // Set up local video view
  setupLocalVideo(uid: number): VideoCanvas {
    return {
      uid,
      sourceType: VideoSourceType.VideoSourceCamera,
    };
  }

  // Set up remote video view
  setupRemoteVideo(uid: number): VideoCanvas {
    return {
      uid,
      sourceType: VideoSourceType.VideoSourceRemote,
    };
  }

  // Get engine instance (for RtcSurfaceView)
  getEngine(): IRtcEngine | null {
    return this.engine;
  }

  // Generate a unique channel name for a conversation
  generateChannelName(conversationId: string): string {
    return `lumvibe_${conversationId.replace(/-/g, '_')}`;
  }

  // Generate a numeric UID from user ID string
  generateUID(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash) % 1000000;
  }

  // Destroy engine when app closes
  async destroy(): Promise<void> {
    try {
      this.engine?.release();
      this.engine = null;
      this.isInitialized = false;
    } catch (error) {
      console.error('Agora destroy error:', error);
    }
  }
}

export const agoraService = new AgoraService();
export default agoraService; 
