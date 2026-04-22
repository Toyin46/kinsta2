// FILE: features/live/constants/gifts.ts
// Kinsta Live — Gift Catalog
// All prices in KinstaCoins. You control the coin-to-NGN rate.

export interface Gift {
  id: string;
  name: string;
  emoji: string;
  coinCost: number;
  animationType: 'float' | 'explode' | 'fullscreen';
  tier: 'basic' | 'mid' | 'premium' | 'ultra';
  color: string; // for UI glow effect
}

export const GIFTS: Gift[] = [
  // ── BASIC TIER ──────────────────────────────
  {
    id: 'rose',
    name: 'Rose',
    emoji: '🌹',
    coinCost: 1,
    animationType: 'float',
    tier: 'basic',
    color: '#FF4F6D',
  },
  {
    id: 'heart',
    name: 'Heart',
    emoji: '❤️',
    coinCost: 5,
    animationType: 'float',
    tier: 'basic',
    color: '#FF4F6D',
  },
  {
    id: 'fire',
    name: 'Fire',
    emoji: '🔥',
    coinCost: 10,
    animationType: 'float',
    tier: 'basic',
    color: '#FF6B35',
  },
  {
    id: 'star',
    name: 'Star',
    emoji: '⭐',
    coinCost: 20,
    animationType: 'float',
    tier: 'basic',
    color: '#FFD700',
  },
  {
    id: 'diamond',
    name: 'Diamond',
    emoji: '💎',
    coinCost: 49,
    animationType: 'float',
    tier: 'basic',
    color: '#00D4FF',
  },

  // ── MID TIER ───────────────────────────────
  {
    id: 'crown',
    name: 'Crown',
    emoji: '👑',
    coinCost: 100,
    animationType: 'explode',
    tier: 'mid',
    color: '#FFD700',
  },
  {
    id: 'money_rain',
    name: 'Money Rain',
    emoji: '💸',
    coinCost: 200,
    animationType: 'explode',
    tier: 'mid',
    color: '#00C853',
  },
  {
    id: 'rocket',
    name: 'Rocket',
    emoji: '🚀',
    coinCost: 500,
    animationType: 'explode',
    tier: 'mid',
    color: '#7C4DFF',
  },
  {
    id: 'mic',
    name: 'Mic Drop',
    emoji: '🎤',
    coinCost: 750,
    animationType: 'explode',
    tier: 'mid',
    color: '#FF6B35',
  },

  // ── PREMIUM TIER ──────────────────────────
  {
    id: 'lion',
    name: 'Lion',
    emoji: '🦁',
    coinCost: 1000,
    animationType: 'fullscreen',
    tier: 'premium',
    color: '#FF9800',
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    emoji: '🌌',
    coinCost: 2500,
    animationType: 'fullscreen',
    tier: 'premium',
    color: '#3F51B5',
  },
  {
    id: 'thunder',
    name: 'Thunder',
    emoji: '⚡',
    coinCost: 5000,
    animationType: 'fullscreen',
    tier: 'premium',
    color: '#FFEB3B',
  },

  // ── ULTRA TIER ───────────────────────────
  {
    id: 'kinsta_universe',
    name: 'Kinsta Universe',
    emoji: '🌠',
    coinCost: 10000,
    animationType: 'fullscreen',
    tier: 'ultra',
    color: '#E040FB',
  },
  {
    id: 'naija_king',
    name: 'Naija King',
    emoji: '🇳🇬👑',
    coinCost: 25000,
    animationType: 'fullscreen',
    tier: 'ultra',
    color: '#009A44',
  },
];

// Coin packages users can buy (NGN pricing — adjust to your Flutterwave rates)
export interface CoinPackage {
  id: string;
  coins: number;
  priceNGN: number;
  label: string;
  popular?: boolean;
}

export const COIN_PACKAGES: CoinPackage[] = [
  { id: 'starter', coins: 100, priceNGN: 200, label: '100 Coins' },
  { id: 'basic', coins: 500, priceNGN: 900, label: '500 Coins' },
  { id: 'value', coins: 1000, priceNGN: 1700, label: '1,000 Coins', popular: true },
  { id: 'pro', coins: 3000, priceNGN: 4800, label: '3,000 Coins' },
  { id: 'mega', coins: 10000, priceNGN: 15000, label: '10,000 Coins' },
  { id: 'whale', coins: 30000, priceNGN: 42000, label: '30,000 Coins' },
];

// Creator payout rate: 70% of coin value goes to creator
// TikTok pays 50%, Kinsta pays 70% — this is your competitive edge
export const CREATOR_PAYOUT_RATE = 0.70;

// Loyalty rank thresholds (total coins gifted to a specific creator)
export const LOYALTY_RANKS = {
  viewer: { label: 'Viewer', emoji: '👁️', minCoins: 0 },
  supporter: { label: 'Supporter', emoji: '🌟', minCoins: 100 },
  top_fan: { label: 'Top Fan', emoji: '🔥', minCoins: 1000 },
  superfan: { label: 'Superfan', emoji: '👑', minCoins: 10000 },
};

export const getLoyaltyRank = (totalCoins: number): keyof typeof LOYALTY_RANKS => {
  if (totalCoins >= 10000) return 'superfan';
  if (totalCoins >= 1000) return 'top_fan';
  if (totalCoins >= 100) return 'supporter';
  return 'viewer';
}; 
