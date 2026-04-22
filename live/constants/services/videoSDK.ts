// FILE: features/live/services/videoSDK.ts
// Kinsta Live — Video SDK Abstraction Layer
//
// ─────────────────────────────────────────────────────────────────
// INSTRUCTIONS: When you're ready to activate live video streaming,
// pick ONE of the two options below and follow the steps.
//
// OPTION A — 100ms (RECOMMENDED for your stack)
//   1. npm install @100mslive/react-native-hms
//   2. Follow iOS/Android setup at: https://www.100ms.live/docs/react-native/v2/how-to-guides/install-the-sdk/integration
//   3. Uncomment the 100ms section below and delete the MOCK section
//
// OPTION B — Agora
//   1. npm install react-native-agora
//   2. Follow setup at: https://docs.agora.io/en/voice-calling/get-started/get-started-sdk?platform=react-native
//   3. Uncomment the Agora section below and delete the MOCK section
//
// ─────────────────────────────────────────────────────────────────
// Until then, this file runs in MOCK MODE.
// All screens, gifts, chat, battles — everything works EXCEPT
// actual video/audio. That's the only thing missing.
// ─────────────────────────────────────────────────────────────────

export interface VideoSDKUser {
  userId: string;
  displayName: string;
  isHost: boolean;
  videoTrack?: any;
  audioTrack?: any;
}

export interface VideoSDKCallbacks {
  onUserJoined: (user: VideoSDKUser) => void;
  onUserLeft: (userId: string) => void;
  onConnectionStateChange: (state: 'connecting' | 'connected' | 'disconnected' | 'failed') => void;
  onError: (error: Error) => void;
}

// ─────────────────────────────────────────────
// MOCK SDK (Active until you add 100ms or Agora)
// ─────────────────────────────────────────────
class MockVideoSDK {
  private callbacks: VideoSDKCallbacks | null = null;
  private isConnected = false;

  async init(_appId: string) {
    console.log('[VideoSDK MOCK] init called — no real video until SDK is added');
  }

  async joinChannel(params: {
    channelName: string;
    token: string;
    userId: string;
    displayName: string;
    isHost: boolean;
    callbacks: VideoSDKCallbacks;
  }) {
    this.callbacks = params.callbacks;
    this.isConnected = true;
    console.log(`[VideoSDK MOCK] Joined channel: ${params.channelName}`);
    params.callbacks.onConnectionStateChange('connected');
    return { success: true };
  }

  async leaveChannel() {
    this.isConnected = false;
    console.log('[VideoSDK MOCK] Left channel');
    this.callbacks?.onConnectionStateChange('disconnected');
  }

  async muteLocalAudio(_muted: boolean) {
    console.log('[VideoSDK MOCK] muteLocalAudio:', _muted);
  }

  async muteLocalVideo(_muted: boolean) {
    console.log('[VideoSDK MOCK] muteLocalVideo:', _muted);
  }

  async switchCamera() {
    console.log('[VideoSDK MOCK] switchCamera');
  }

  async inviteGuest(_guestId: string) {
    console.log('[VideoSDK MOCK] inviteGuest:', _guestId);
  }

  async removeGuest(_guestId: string) {
    console.log('[VideoSDK MOCK] removeGuest:', _guestId);
  }

  getLocalVideoView() {
    // Returns null until real SDK is added
    return null;
  }

  getRemoteVideoView(_userId: string) {
    return null;
  }

  isReady() {
    return this.isConnected;
  }
}

// ─────────────────────────────────────────────
// ╔══════════════════════════════════════════╗
// ║  OPTION A: 100ms SDK (Uncomment when     ║
// ║  ready — delete MockVideoSDK above too)  ║
// ╚══════════════════════════════════════════╝
// import HMSSDK, { HMSConfig, HMSUpdateListenerActions } from '@100mslive/react-native-hms';
//
// class HmsVideoSDK {
//   private hms: HMSSDK | null = null;
//   private callbacks: VideoSDKCallbacks | null = null;
//
//   async init(_appId: string) {
//     this.hms = await HMSSDK.build();
//   }
//
//   async joinChannel(params: {
//     channelName: string;
//     token: string; // 100ms auth token from your backend
//     userId: string;
//     displayName: string;
//     isHost: boolean;
//     callbacks: VideoSDKCallbacks;
//   }) {
//     if (!this.hms) throw new Error('SDK not initialized');
//     this.callbacks = params.callbacks;
//
//     const config = new HMSConfig({
//       authToken: params.token,
//       username: params.displayName,
//       metadata: JSON.stringify({ userId: params.userId, isHost: params.isHost }),
//     });
//
//     this.hms.addEventListener(HMSUpdateListenerActions.ON_JOIN, () => {
//       params.callbacks.onConnectionStateChange('connected');
//     });
//
//     this.hms.addEventListener(HMSUpdateListenerActions.ON_PEER_UPDATE, (data: any) => {
//       if (data.type === 'PEER_JOINED') {
//         params.callbacks.onUserJoined({
//           userId: data.peer.peerID,
//           displayName: data.peer.name,
//           isHost: data.peer.isLocal,
//         });
//       } else if (data.type === 'PEER_LEFT') {
//         params.callbacks.onUserLeft(data.peer.peerID);
//       }
//     });
//
//     this.hms.addEventListener(HMSUpdateListenerActions.ON_ERROR, (error: any) => {
//       params.callbacks.onError(new Error(error.message));
//     });
//
//     await this.hms.join(config);
//     return { success: true };
//   }
//
//   async leaveChannel() {
//     await this.hms?.leave();
//     this.callbacks?.onConnectionStateChange('disconnected');
//   }
//
//   async muteLocalAudio(muted: boolean) {
//     await this.hms?.localPeer?.localAudioTrack?.setMute(muted);
//   }
//
//   async muteLocalVideo(muted: boolean) {
//     await this.hms?.localPeer?.localVideoTrack?.setMute(muted);
//   }
//
//   async switchCamera() {
//     await this.hms?.localPeer?.localVideoTrack?.switchCamera();
//   }
//
//   getLocalVideoView() {
//     return this.hms?.localPeer?.localVideoTrack;
//   }
//
//   getRemoteVideoView(userId: string) {
//     return this.hms?.remotePeers?.find(p => p.peerID === userId)?.videoTrack;
//   }
//
//   isReady() { return !!this.hms; }
// }

// ─────────────────────────────────────────────
// ╔══════════════════════════════════════════╗
// ║  OPTION B: Agora SDK (Uncomment when     ║
// ║  ready — delete MockVideoSDK above too)  ║
// ╚══════════════════════════════════════════╝
// import RtcEngine, { ChannelProfile, ClientRole } from 'react-native-agora';
//
// class AgoraVideoSDK {
//   private engine: RtcEngine | null = null;
//   private callbacks: VideoSDKCallbacks | null = null;
//
//   async init(appId: string) {
//     this.engine = await RtcEngine.create(appId);
//     await this.engine.setChannelProfile(ChannelProfile.LiveBroadcasting);
//   }
//
//   async joinChannel(params: {
//     channelName: string;
//     token: string;
//     userId: string;
//     displayName: string;
//     isHost: boolean;
//     callbacks: VideoSDKCallbacks;
//   }) {
//     if (!this.engine) throw new Error('Agora not initialized');
//     this.callbacks = params.callbacks;
//
//     await this.engine.setClientRole(
//       params.isHost ? ClientRole.Broadcaster : ClientRole.Audience
//     );
//
//     this.engine.addListener('UserJoined', (uid) => {
//       params.callbacks.onUserJoined({ userId: String(uid), displayName: '', isHost: false });
//     });
//     this.engine.addListener('UserOffline', (uid) => {
//       params.callbacks.onUserLeft(String(uid));
//     });
//     this.engine.addListener('JoinChannelSuccess', () => {
//       params.callbacks.onConnectionStateChange('connected');
//     });
//     this.engine.addListener('Error', (code) => {
//       params.callbacks.onError(new Error(`Agora error: ${code}`));
//     });
//
//     await this.engine.joinChannel(params.token, params.channelName, null, parseInt(params.userId));
//     return { success: true };
//   }
//
//   async leaveChannel() {
//     await this.engine?.leaveChannel();
//     this.callbacks?.onConnectionStateChange('disconnected');
//   }
//
//   async muteLocalAudio(muted: boolean) {
//     await this.engine?.muteLocalAudioStream(muted);
//   }
//
//   async muteLocalVideo(muted: boolean) {
//     await this.engine?.muteLocalVideoStream(muted);
//   }
//
//   async switchCamera() {
//     await this.engine?.switchCamera();
//   }
//
//   isReady() { return !!this.engine; }
// }

// ─────────────────────────────────────────────
// EXPORT — swap the class name when you activate
// ─────────────────────────────────────────────
export const VideoSDK = new MockVideoSDK();
// export const VideoSDK = new HmsVideoSDK();   // ← uncomment for 100ms
// export const VideoSDK = new AgoraVideoSDK(); // ← uncomment for Agora 
