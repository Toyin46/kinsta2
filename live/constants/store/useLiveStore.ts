// FILE: features/live/store/useLiveStore.ts
// Kinsta Live — Global Live State (Zustand)

import { create } from 'zustand';
import { Gift } from '../gifts'; 

export interface LiveMessage {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  content: string;
  messageType: 'chat' | 'gift' | 'system' | 'join';
  giftData?: {
    giftId: string;
    giftName: string;
    giftEmoji: string;
    coinCost: number;
    quantity: number;
  };
  loyaltyRank?: string;
  loyaltyEmoji?: string;
  createdAt: string;
}

export interface LiveGiftAnimation {
  id: string;
  senderId: string;
  senderName: string;
  gift: Gift;
  quantity: number;
}

export interface LiveRoom {
  id: string;
  hostId: string;
  hostName: string;
  hostAvatarUrl?: string;
  title: string;
  category: string;
  mood: string;
  status: 'scheduled' | 'live' | 'ended';
  scheduledAt?: string;
  viewerCount: number;
  peakViewerCount: number;
  totalGiftsReceived: number;
  giftGoalAmount?: number;
  giftGoalLabel?: string;
  sdkChannelName?: string;
  allowGuests: boolean;
  guestFollowerDaysRequired: number;
  isBattleActive: boolean;
}

export interface BattleState {
  battleId: string;
  opponentId: string;
  opponentName: string;
  opponentAvatarUrl?: string;
  coinsA: number;
  coinsB: number;
  timeRemainingSeconds: number;
  isMyRoom: boolean; // true = I am host A
}

interface LiveStore {
  // Current room
  currentRoom: LiveRoom | null;
  setCurrentRoom: (room: LiveRoom | null) => void;
  updateViewerCount: (count: number) => void;
  updateGiftTotal: (coins: number) => void;

  // Messages
  messages: LiveMessage[];
  addMessage: (msg: LiveMessage) => void;
  clearMessages: () => void;

  // Gift animations queue
  giftAnimations: LiveGiftAnimation[];
  addGiftAnimation: (anim: LiveGiftAnimation) => void;
  removeGiftAnimation: (id: string) => void;

  // Battle
  battle: BattleState | null;
  setBattle: (battle: BattleState | null) => void;
  updateBattleCoins: (coinsA: number, coinsB: number) => void;
  updateBattleTimer: (seconds: number) => void;

  // My role in current live
  isHost: boolean;
  isGuest: boolean;
  setRole: (isHost: boolean, isGuest: boolean) => void;

  // Gift goal progress
  giftGoalProgress: number; // 0-100 percentage
  updateGiftGoalProgress: (totalCoins: number, goalAmount?: number) => void;

  // SDK connection status
  sdkConnected: boolean;
  setSdkConnected: (connected: boolean) => void;
}

export const useLiveStore = create<LiveStore>((set, get) => ({
  currentRoom: null,
  setCurrentRoom: (room) => set({ currentRoom: room }),
  updateViewerCount: (count) =>
    set((state) => ({
      currentRoom: state.currentRoom
        ? { ...state.currentRoom, viewerCount: count }
        : null,
    })),
  updateGiftTotal: (coins) =>
    set((state) => ({
      currentRoom: state.currentRoom
        ? {
            ...state.currentRoom,
            totalGiftsReceived: state.currentRoom.totalGiftsReceived + coins,
          }
        : null,
    })),

  messages: [],
  addMessage: (msg) =>
    set((state) => ({
      // Keep last 200 messages max to avoid memory bloat
      messages: [...state.messages.slice(-199), msg],
    })),
  clearMessages: () => set({ messages: [] }),

  giftAnimations: [],
  addGiftAnimation: (anim) =>
    set((state) => ({ giftAnimations: [...state.giftAnimations, anim] })),
  removeGiftAnimation: (id) =>
    set((state) => ({
      giftAnimations: state.giftAnimations.filter((a) => a.id !== id),
    })),

  battle: null,
  setBattle: (battle) => set({ battle }),
  updateBattleCoins: (coinsA, coinsB) =>
    set((state) => ({
      battle: state.battle ? { ...state.battle, coinsA, coinsB } : null,
    })),
  updateBattleTimer: (seconds) =>
    set((state) => ({
      battle: state.battle
        ? { ...state.battle, timeRemainingSeconds: seconds }
        : null,
    })),

  isHost: false,
  isGuest: false,
  setRole: (isHost, isGuest) => set({ isHost, isGuest }),

  giftGoalProgress: 0,
  updateGiftGoalProgress: (totalCoins, goalAmount) => {
    if (!goalAmount || goalAmount === 0) {
      set({ giftGoalProgress: 0 });
      return;
    }
    const progress = Math.min((totalCoins / goalAmount) * 100, 100);
    set({ giftGoalProgress: progress });
  },

  sdkConnected: false,
  setSdkConnected: (connected) => set({ sdkConnected: connected }),
})); 
