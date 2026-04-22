// ═══════════════════════════════════════════════════════════
// create.tsx  — LumVibe v5  — CORRECTED — PART 1 of 3
// HOW TO USE: Merge PART1 + PART2 + PART3 into one create.tsx
// ─────────────────────────────────────────────────────────
// CORRECTIONS APPLIED (nothing working was changed):
//  ✅ All "Kinsta" text → "LumVibe" (watermark, dialogs, studio)
//  ✅ "Green Screen" renamed → "Animated Background" (honest name)
//  ✅ "Gesture Effects" renamed → "Effect Burst" (no fake ML claims)
//  ✅ Dual Camera shows ⚠️ disclaimer alert before enabling
//  ✅ Face detection polling removed (caused disk I/O stutter)
//  ✅ recBarFill height:'100%' as any → flex:1 (style fix)
//  ✅ Music upload limit raised 5MB → 15MB + user alert on skip
//  ✅ DRAFTS_STORAGE_KEY updated to lumvibe_drafts_v1
// ═══════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, Image, TouchableOpacity, TextInput, Alert, StyleSheet,
  ScrollView, ActivityIndicator, Dimensions, Animated, Modal, Linking,
  Platform, Switch, AppState, AppStateStatus, PanResponder, FlatList,
} from 'react-native';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio, Video, ResizeMode } from 'expo-av';
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from '../../config/supabase';
import { useAuthStore } from '../../store/authStore';
import { router } from 'expo-router';
import { decode } from 'base64-arraybuffer';
import { LinearGradient } from 'expo-linear-gradient';
import { GLView } from 'expo-gl';
import { getMarketplacePostBridge, clearMarketplacePostBridge } from '../../utils/marketplacePostBridge';
import StatusCreator from '../../components/StatusCreator';
import { ExpoWebGLRenderingContext } from 'expo-gl';


const { width: SW, height: SH } = Dimensions.get('window');

// ─── TYPES ────────────────────────────────────────────────
type MediaType  = 'image' | 'video' | 'text' | 'voice' | null;
type CameraMode = 'photo' | 'video';
type ScreenView = 'camera' | 'compose' | 'drafts';
type CameraFeature = 'normal' | 'animatedbg' | 'effectburst' | 'dualcam';

interface GlParams {
  brightness: number; contrast: number; saturation: number; hue: number;
  rMultiplier: number; gMultiplier: number; bMultiplier: number;
  vignette: number; addNoise: boolean;
}
interface VoiceEffect {
  id: string; name: string; emoji: string; category: string;
  desc: string; explain: string;
  cloudinaryPitch?: number | null; cloudinaryVolume?: number | null; cloudinaryReverse?: boolean;
  rate: number; previewVolume: number;
  reverb: number; echo: number; chorus: boolean; compress: boolean;
  highpass: number; lowpass: number; presence: number;
}
interface FxEffect {
  id: string; name: string; emoji: string; category: string; desc: string;
  brightness: number; contrast: number; saturation: number; hue: number;
  rMultiplier: number; gMultiplier: number; bMultiplier: number;
  vignette: number; addNoise: boolean;
}
interface FilterDef {
  id: string; name: string; emoji: string;
  tintColor: string | null; dbTint: string | null; dbKey: string;
  cinematicBars: boolean; glitchEffect?: boolean;
  gl: GlParams;
}
interface Draft {
  id: string; createdAt: string;
  mediaUri: string | null; originalMediaUri: string | null; mediaType: MediaType;
  caption: string; statusContent: string; statusType: 'text' | 'voice';
  statusBackground: string; statusVoiceUri: string | null; statusVoiceDuration: number;
  filter: string; speedId: string; blurEnabled: boolean; selectedVibe: string | null;
  selectedFx: string; selectedMusic: string | null; selectedMusicName: string | null;
  musicArtist: string | null; musicVolume: number; originalVolume: number;
  location: string | null; locationCoords: { latitude: number; longitude: number } | null;
  addWatermark: boolean; autoOptimize: boolean; isScheduled: boolean; scheduledFor: string | null;
}
interface FaceData {
  x: number; y: number; width: number; height: number;
  leftEye?: { x: number; y: number }; rightEye?: { x: number; y: number };
  nose?: { x: number; y: number }; mouth?: { x: number; y: number };
}
interface PostInsertData {
  user_id: string; caption: string;
  likes_count: number; comments_count: number; views_count: number; coins_received: number;
  created_at: string; is_published: boolean; scheduled_for: string | null;
  has_watermark: boolean; auto_optimized: boolean; applied_filter: string;
  video_effect: string; video_filter_tint: string | null; playback_rate: number | null;
  vibe_type: string | null; voice_auto_tune: boolean; blur_enabled: boolean;
  media_url?: string; media_type?: string; cloudinary_public_id?: string;
  status_background?: string; voice_duration?: number; location?: string;
  latitude?: number; longitude?: number; music_name?: string; music_artist?: string;
  music_volume?: number; original_volume?: number; music_url?: string;
  marketplace_listing_id?: string; marketplace_price?: string | null; marketplace_title?: string | null;
}

// ─── CONSTANTS ────────────────────────────────────────────
const CLOUDINARY_CLOUD_NAME    = 'dvllxm0wg';
const CLOUDINARY_UPLOAD_PRESET = 'Kinsta_unsigned';
const DRAFTS_STORAGE_KEY       = 'lumvibe_drafts_v1';   // ✅ renamed
const MAX_DRAFTS               = 20;
const IMAGE_COMPRESSION = { maxWidth: 1080, quality: 0.72, format: ImageManipulator.SaveFormat.JPEG };
const VIDEO_SIZE_LIMIT_MB      = 50;
const MUSIC_UPLOAD_LIMIT_MB    = 15;   // ✅ raised from 5MB

// ─── AR EFFECTS ───────────────────────────────────────────
const AR_EFFECTS = [
  { id:'ar_none',      name:'None',       emoji:'✖️', type:'none'  },
  { id:'ar_flowers',   name:'Flowers',    emoji:'🌸', type:'float' },
  { id:'ar_stars',     name:'Stars',      emoji:'⭐', type:'float' },
  { id:'ar_hearts',    name:'Hearts',     emoji:'❤️', type:'float' },
  { id:'ar_money',     name:'Money Rain', emoji:'💸', type:'float' },
  { id:'ar_fire',      name:'Fire',       emoji:'🔥', type:'float' },
  { id:'ar_bunny',     name:'Bunny Face', emoji:'🐰', type:'face'  },
  { id:'ar_crown',     name:'Crown',      emoji:'👑', type:'face'  },
  { id:'ar_glasses',   name:'Glasses',    emoji:'🕶️', type:'face'  },
  { id:'ar_party',     name:'Party',      emoji:'🎉', type:'float' },
  { id:'ar_sparkle',   name:'Sparkle',    emoji:'✨', type:'float' },
  { id:'ar_rainbow',   name:'Rainbow',    emoji:'🌈', type:'top'   },
  { id:'ar_sunflower', name:'Sunflower',  emoji:'🌻', type:'float' },
  { id:'ar_diamond',   name:'Diamonds',   emoji:'💎', type:'float' },
];

// ─── VOICE EFFECTS ────────────────────────────────────────
const VOICE_EFFECTS: VoiceEffect[] = [
  { id:'none',          name:'Original',     emoji:'🎤', category:'clean',   rate:1.0,  previewVolume:1.0,  reverb:0,    echo:0,    chorus:false, compress:false, highpass:60,  lowpass:20000, presence:0, cloudinaryPitch:null, cloudinaryVolume:null, cloudinaryReverse:false, desc:'Pure raw voice',               explain:'No effects — your voice exactly as recorded.' },
  { id:'studio_clean',  name:'Studio Clean', emoji:'🎙️', category:'clean',   rate:1.0,  previewVolume:1.2,  reverb:0.08, echo:0,    chorus:false, compress:true,  highpass:80,  lowpass:16000, presence:3, cloudinaryPitch:null, cloudinaryVolume:120,  cloudinaryReverse:false, desc:'Professional broadcast voice', explain:'Boosts volume and clarity — sounds like a radio host.' },
  { id:'deep',          name:'Deep Voice',   emoji:'🔊', category:'pitch',   rate:0.82, previewVolume:1.1,  reverb:0.15, echo:0,    chorus:false, compress:true,  highpass:40,  lowpass:8000,  presence:0, cloudinaryPitch:-300, cloudinaryVolume:110,  cloudinaryReverse:false, desc:'Low & commanding',             explain:'Drops your pitch — movie trailer narrator effect.' },
  { id:'chipmunk',      name:'Chipmunk',     emoji:'🐿️', category:'pitch',   rate:1.35, previewVolume:1.0,  reverb:0.05, echo:0,    chorus:false, compress:false, highpass:200, lowpass:20000, presence:0, cloudinaryPitch:400,  cloudinaryVolume:null, cloudinaryReverse:false, desc:'High & fun',                   explain:'Raises pitch way up — like Alvin and the Chipmunks.' },
  { id:'giant',         name:'Giant',        emoji:'👹', category:'pitch',   rate:0.72, previewVolume:1.0,  reverb:0.4,  echo:0.1,  chorus:false, compress:false, highpass:30,  lowpass:7000,  presence:0, cloudinaryPitch:-500, cloudinaryVolume:null, cloudinaryReverse:false, desc:'Massive & monstrous',          explain:'Extreme low pitch — horror/villain content.' },
  { id:'helium',        name:'Helium',       emoji:'🎈', category:'pitch',   rate:1.5,  previewVolume:1.0,  reverb:0,    echo:0,    chorus:false, compress:false, highpass:300, lowpass:20000, presence:0, cloudinaryPitch:600,  cloudinaryVolume:null, cloudinaryReverse:false, desc:'Squeaky balloon voice',        explain:'Sounds like you inhaled helium.' },
  { id:'robot',         name:'Robot',        emoji:'🤖', category:'pitch',   rate:0.85, previewVolume:1.05, reverb:0,    echo:0.08, chorus:true,  compress:false, highpass:120, lowpass:8000,  presence:0, cloudinaryPitch:-150, cloudinaryVolume:105,  cloudinaryReverse:false, desc:'Mechanical synthetic voice',   explain:'Makes your voice sound robotic — like a machine.' },
  { id:'reverse',       name:'Reverse',      emoji:'⏪', category:'special', rate:1.0,  previewVolume:1.0,  reverb:0,    echo:0,    chorus:false, compress:false, highpass:60,  lowpass:20000, presence:0, cloudinaryPitch:null, cloudinaryVolume:null, cloudinaryReverse:true,  desc:'Reversed playback',            explain:'Plays your voice backwards via Cloudinary.' },
  { id:'autotune',      name:'Auto-Tune',    emoji:'🎵', category:'clean',   rate:1.02, previewVolume:1.15, reverb:0.12, echo:0,    chorus:false, compress:true,  highpass:80,  lowpass:15000, presence:4, cloudinaryPitch:50,   cloudinaryVolume:115,  cloudinaryReverse:false, desc:'Studio pitch correction',      explain:'Locks pitch to nearest note — the T-Pain / Afrobeats effect.' },
  { id:'afrobeats_vox', name:'Afro Vocals',  emoji:'🌍', category:'genre',   rate:1.0,  previewVolume:1.2,  reverb:0.3,  echo:0.12, chorus:true,  compress:true,  highpass:80,  lowpass:15000, presence:4, cloudinaryPitch:30,   cloudinaryVolume:120,  cloudinaryReverse:false, desc:'Afrobeats vocal preset',       explain:'Tuned for Afrobeats — warm presence like Wizkid, Burna Boy.' },
  { id:'gospel_vox',    name:'Gospel',       emoji:'✝️', category:'genre',   rate:1.0,  previewVolume:1.25, reverb:0.6,  echo:0.1,  chorus:true,  compress:true,  highpass:70,  lowpass:16000, presence:2, cloudinaryPitch:null, cloudinaryVolume:125,  cloudinaryReverse:false, desc:'Powerful praise voice',        explain:'Boosts volume for powerful praise music.' },
  { id:'telephone',     name:'Telephone',    emoji:'📞', category:'echo',    rate:1.0,  previewVolume:0.9,  reverb:0,    echo:0.05, chorus:false, compress:false, highpass:300, lowpass:3400,  presence:0, cloudinaryPitch:null, cloudinaryVolume:90,   cloudinaryReverse:false, desc:'Old phone call sound',         explain:'Cuts bass and treble — exactly like a telephone.' },
  { id:'whisper',       name:'ASMR Whisper', emoji:'🤫', category:'special', rate:0.96, previewVolume:0.8,  reverb:0.12, echo:0,    chorus:false, compress:true,  highpass:60,  lowpass:12000, presence:2, cloudinaryPitch:-80,  cloudinaryVolume:80,   cloudinaryReverse:false, desc:'Intimate ASMR feel',           explain:'Close and soft — ASMR effect. Great for storytelling.' },
  { id:'horror',        name:'Horror',       emoji:'👻', category:'special', rate:0.75, previewVolume:1.0,  reverb:0.9,  echo:0.6,  chorus:true,  compress:false, highpass:40,  lowpass:9000,  presence:0, cloudinaryPitch:-400, cloudinaryVolume:null, cloudinaryReverse:false, desc:'Dark spine-chilling voice',    explain:'Extreme low — truly terrifying. Horror/Halloween.' },
];

const EFFECT_CATEGORIES = [
  { id:'all',     name:'All',     emoji:'🎛️' },
  { id:'clean',   name:'Studio',  emoji:'🎙️' },
  { id:'pitch',   name:'Pitch',   emoji:'🎚️' },
  { id:'genre',   name:'Genre',   emoji:'🌍' },
  { id:'special', name:'Special', emoji:'✨' },
  { id:'echo',    name:'Echo',    emoji:'🏔️' },
];

// ─── STUDIO BEATS ─────────────────────────────────────────
const STUDIO_GENRES = [
  {id:'all',name:'All',emoji:'🎵'},{id:'afrobeats',name:'Afrobeats',emoji:'🌍'},
  {id:'amapiano',name:'Amapiano',emoji:'🎹'},{id:'afropop',name:'Afropop',emoji:'🎤'},
  {id:'hiphop',name:'Hip-Hop',emoji:'🎧'},{id:'rnb',name:'R&B',emoji:'💜'},
  {id:'gospel',name:'Gospel',emoji:'✝️'},{id:'dancehall',name:'Dancehall',emoji:'🇯🇲'},
  {id:'lofi',name:'Lo-Fi',emoji:'🌙'},{id:'afrodrill',name:'Afro Drill',emoji:'💥'},
];
const STUDIO_BEATS = [
  {id:'af001',name:'Lagos Nights',    genre:'afrobeats',bpm:112,mood:'🌃',artist:'Kevin MacLeod',url:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Funkorama.mp3'},
  {id:'af002',name:'Naija Vibes',     genre:'afrobeats',bpm:105,mood:'🔥',artist:'Kevin MacLeod',url:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Disco%20Medusae.mp3'},
  {id:'af003',name:'Surulere',        genre:'afrobeats',bpm:108,mood:'💃',artist:'Kevin MacLeod',url:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Reggae%20Bump.mp3'},
  {id:'am001',name:'Log Drum Session',genre:'amapiano', bpm:112,mood:'🎹',artist:'Kevin MacLeod',url:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Take%20the%20Lead.mp3'},
  {id:'am002',name:'Piano Riddim',    genre:'amapiano', bpm:110,mood:'🎵',artist:'Kevin MacLeod',url:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Piano%20Man.mp3'},
  {id:'hh001',name:'Street Bars',     genre:'hiphop',   bpm:90, mood:'🎧',artist:'Kevin MacLeod',url:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Sneaky%20Snitch.mp3'},
  {id:'hh002',name:'Trap Lagos',      genre:'hiphop',   bpm:140,mood:'🔥',artist:'Kevin MacLeod',url:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Rynos%20Theme.mp3'},
  {id:'rb001',name:'Smooth Night',    genre:'rnb',      bpm:80, mood:'💜',artist:'Kevin MacLeod',url:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Crossing%20the%20Chasm.mp3'},
  {id:'rb002',name:'Love Vibes',      genre:'rnb',      bpm:75, mood:'❤️',artist:'Kevin MacLeod',url:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Pamgaea.mp3'},
  {id:'go001',name:'Sunday Morning',  genre:'gospel',   bpm:80, mood:'✝️',artist:'Kevin MacLeod',url:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Halcyon%20Days.mp3'},
  {id:'go002',name:'Praise Break',    genre:'gospel',   bpm:120,mood:'🙌',artist:'Kevin MacLeod',url:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Gospel%20Truth.mp3'},
  {id:'dh001',name:'Riddim Skank',    genre:'dancehall',bpm:92, mood:'🇯🇲',artist:'Kevin MacLeod',url:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Jamming%20With%20Dr%20Jones.mp3'},
  {id:'lf001',name:'Study Session',   genre:'lofi',     bpm:76, mood:'📚',artist:'Kevin MacLeod',url:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Chill%20Wave.mp3'},
  {id:'lf002',name:'Chill Sunday',    genre:'lofi',     bpm:72, mood:'☕',artist:'Kevin MacLeod',url:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Teddy%20Bear%20Waltz.mp3'},
  {id:'ad001',name:'Lagos Drill',     genre:'afrodrill',bpm:143,mood:'💥',artist:'Kevin MacLeod',url:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Rynos%20Theme.mp3'},
  {id:'ap001',name:'Wizkid Type',     genre:'afropop',  bpm:103,mood:'⭐',artist:'Kevin MacLeod',url:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Kool%20Kats.mp3'},
  {id:'ap002',name:'Burna Style',     genre:'afropop',  bpm:108,mood:'🔥',artist:'Kevin MacLeod',url:'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Vicious.mp3'},
];

// ─── FX EFFECTS ───────────────────────────────────────────
const FX_EFFECTS: FxEffect[] = [
  {id:'fx_none',           name:'No FX',        emoji:'✖️',category:'basic',     desc:'Remove all FX',            brightness:0,    contrast:1,    saturation:1,    hue:0,   rMultiplier:1,    gMultiplier:1,    bMultiplier:1,    vignette:0,   addNoise:false},
  {id:'fx_vhs',            name:'VHS Tape',      emoji:'📼',category:'retro',     desc:'Old camcorder look',       brightness:-0.04,contrast:0.92, saturation:0.65, hue:8,   rMultiplier:1.08, gMultiplier:0.92, bMultiplier:0.82, vignette:0.5, addNoise:true },
  {id:'fx_fire',           name:'Fire Grade',    emoji:'🔥',category:'mood',      desc:'Inferno colour burn',      brightness:0.02, contrast:1.3,  saturation:1.5,  hue:0,   rMultiplier:1.25, gMultiplier:0.75, bMultiplier:0.2,  vignette:0.3, addNoise:false},
  {id:'fx_ice',            name:'Ice Cold',      emoji:'🧊',category:'mood',      desc:'Frozen blue world',        brightness:0,    contrast:1.15, saturation:0.8,  hue:-10, rMultiplier:0.75, gMultiplier:0.9,  bMultiplier:1.2,  vignette:0.2, addNoise:false},
  {id:'fx_neon_burn',      name:'Neon Burn',     emoji:'🌈',category:'creative',  desc:'Cyberpunk neon city',      brightness:-0.05,contrast:1.4,  saturation:2.2,  hue:0,   rMultiplier:1.15, gMultiplier:0.85, bMultiplier:1.1,  vignette:0.2, addNoise:false},
  {id:'fx_duotone_purple', name:'Purple Haze',   emoji:'💜',category:'creative',  desc:'Duotone purple grade',     brightness:0,    contrast:1.2,  saturation:0.0,  hue:0,   rMultiplier:0.7,  gMultiplier:0.25, bMultiplier:1.1,  vignette:0.1, addNoise:false},
  {id:'fx_duotone_gold',   name:'Gold Rush',     emoji:'🏆',category:'creative',  desc:'Duotone gold & black',     brightness:0.02, contrast:1.3,  saturation:0.0,  hue:0,   rMultiplier:1.1,  gMultiplier:0.88, bMultiplier:0.12, vignette:0.1, addNoise:false},
  {id:'fx_light_leak',     name:'Light Leak',    emoji:'🌟',category:'retro',     desc:'Film light bleed',         brightness:0.05, contrast:0.95, saturation:1.1,  hue:5,   rMultiplier:1.15, gMultiplier:1.0,  bMultiplier:0.72, vignette:0.4, addNoise:true },
  {id:'fx_bleach',         name:'Bleach Out',    emoji:'⬜',category:'editorial', desc:'Washed out overexpose',    brightness:0.08, contrast:0.85, saturation:0.7,  hue:0,   rMultiplier:1.0,  gMultiplier:1.0,  bMultiplier:1.0,  vignette:0,   addNoise:false},
  {id:'fx_noir_contrast',  name:'Hard Noir',     emoji:'🖤',category:'editorial', desc:'Maximum B&W contrast',     brightness:-0.05,contrast:1.8,  saturation:0.0,  hue:0,   rMultiplier:1.0,  gMultiplier:1.0,  bMultiplier:1.0,  vignette:0.6, addNoise:false},
  {id:'fx_sunrise',        name:'Sunrise',       emoji:'🌄',category:'mood',      desc:'Golden morning warmth',    brightness:0.04, contrast:1.1,  saturation:1.3,  hue:8,   rMultiplier:1.18, gMultiplier:0.98, bMultiplier:0.68, vignette:0.3, addNoise:false},
  {id:'fx_deep_ocean',     name:'Deep Ocean',    emoji:'🌊',category:'mood',      desc:'Underwater blue depth',    brightness:0,    contrast:1.2,  saturation:1.1,  hue:-15, rMultiplier:0.6,  gMultiplier:0.95, bMultiplier:1.25, vignette:0.4, addNoise:false},
  {id:'fx_lomo',           name:'Lomography',    emoji:'🔴',category:'retro',     desc:'Lomo film look',           brightness:0,    contrast:1.25, saturation:1.6,  hue:5,   rMultiplier:1.1,  gMultiplier:0.95, bMultiplier:0.88, vignette:0.6, addNoise:true },
  {id:'fx_teal_orange',    name:'Hollywood',     emoji:'🎬',category:'editorial', desc:'Teal & orange blockbuster',brightness:0,    contrast:1.12, saturation:1.15, hue:0,   rMultiplier:1.1,  gMultiplier:0.9,  bMultiplier:0.88, vignette:0.2, addNoise:false},
  {id:'fx_grunge',         name:'Grunge',        emoji:'🤘',category:'creative',  desc:'Dirty gritty texture',     brightness:0,    contrast:1.4,  saturation:0.7,  hue:0,   rMultiplier:1.0,  gMultiplier:0.95, bMultiplier:0.85, vignette:0.5, addNoise:true },
  {id:'fx_pastel',         name:'Pastel Dream',  emoji:'🌸',category:'mood',      desc:'Soft dreamy pastels',      brightness:0.05, contrast:0.9,  saturation:0.75, hue:5,   rMultiplier:1.05, gMultiplier:1.0,  bMultiplier:1.06, vignette:0,   addNoise:false},
  {id:'fx_midnight',       name:'Midnight',      emoji:'🌑',category:'mood',      desc:'Dark moody night',         brightness:-0.06,contrast:1.25, saturation:0.9,  hue:-8,  rMultiplier:0.85, gMultiplier:0.9,  bMultiplier:1.1,  vignette:0.5, addNoise:false},
  {id:'fx_chrome',         name:'Chrome',        emoji:'🔩',category:'editorial', desc:'Metallic silver grade',    brightness:0,    contrast:1.15, saturation:0.3,  hue:0,   rMultiplier:1.0,  gMultiplier:1.0,  bMultiplier:1.05, vignette:0.2, addNoise:false},
  {id:'fx_pop_art',        name:'Pop Art',       emoji:'🎨',category:'creative',  desc:'Bold pop art colours',     brightness:0,    contrast:1.5,  saturation:2.5,  hue:15,  rMultiplier:1.2,  gMultiplier:0.85, bMultiplier:1.1,  vignette:0,   addNoise:false},
  {id:'fx_cross_process',  name:'Cross Process', emoji:'🌀',category:'retro',     desc:'Cross-processed film',     brightness:0,    contrast:1.2,  saturation:1.4,  hue:20,  rMultiplier:0.85, gMultiplier:1.1,  bMultiplier:0.75, vignette:0.3, addNoise:false},
  {id:'fx_aura',           name:'Aura Glow',     emoji:'✨',category:'creative',  desc:'Soft purple aura',         brightness:0.02, contrast:1.05, saturation:1.2,  hue:-20, rMultiplier:1.0,  gMultiplier:0.85, bMultiplier:1.15, vignette:0.2, addNoise:false},
];
const FX_CATEGORIES = [
  {id:'all',name:'All',emoji:'🎛️'},{id:'mood',name:'Mood',emoji:'🌈'},
  {id:'retro',name:'Retro',emoji:'📼'},{id:'editorial',name:'Editorial',emoji:'🎬'},
  {id:'creative',name:'Creative',emoji:'🎨'},
];
const FX_OVERLAY_TINTS: Record<string,string> = {
  fx_none:'transparent', fx_vhs:'rgba(180,120,60,0.28)', fx_fire:'rgba(255,80,0,0.32)',
  fx_ice:'rgba(80,160,255,0.30)', fx_neon_burn:'rgba(0,255,180,0.28)',
  fx_duotone_purple:'rgba(120,0,220,0.38)', fx_duotone_gold:'rgba(220,160,0,0.36)',
  fx_light_leak:'rgba(255,220,100,0.22)', fx_bleach:'rgba(255,255,255,0.25)',
  fx_noir_contrast:'rgba(0,0,0,0.45)', fx_sunrise:'rgba(255,120,30,0.28)',
  fx_deep_ocean:'rgba(0,60,180,0.35)', fx_lomo:'rgba(120,0,0,0.30)',
  fx_teal_orange:'rgba(0,180,160,0.22)', fx_grunge:'rgba(60,40,20,0.40)',
  fx_pastel:'rgba(255,200,220,0.28)', fx_midnight:'rgba(10,10,60,0.45)',
  fx_chrome:'rgba(180,180,180,0.30)', fx_pop_art:'rgba(255,0,120,0.30)',
  fx_cross_process:'rgba(0,200,100,0.25)', fx_aura:'rgba(180,100,255,0.25)',
};

// ─── FILTERS ──────────────────────────────────────────────
const FILTERS: FilterDef[] = [
  { id:'original', name:'Original', emoji:'✨', tintColor:null,                     dbTint:null,                     dbKey:'none',      cinematicBars:false, gl:{brightness:0,    contrast:1,    saturation:1,    hue:0,   rMultiplier:1,    gMultiplier:1,    bMultiplier:1,    vignette:0,   addNoise:false} },
  { id:'beauty',   name:'Beauty',   emoji:'💄', tintColor:'rgba(255,200,200,0.18)', dbTint:'rgba(255,200,200,0.18)', dbKey:'beauty',    cinematicBars:false, gl:{brightness:0.04, contrast:0.95, saturation:1.15, hue:5,   rMultiplier:1.08, gMultiplier:0.98, bMultiplier:1.0,  vignette:0.1, addNoise:false} },
  { id:'vintage',  name:'Vintage',  emoji:'📷', tintColor:'rgba(180,120,60,0.25)',  dbTint:'rgba(180,120,60,0.25)',  dbKey:'vintage',   cinematicBars:false, gl:{brightness:-0.02,contrast:0.9,  saturation:0.7,  hue:10,  rMultiplier:1.12, gMultiplier:0.98, bMultiplier:0.75, vignette:0.45,addNoise:true } },
  { id:'cool',     name:'Cool',     emoji:'❄️', tintColor:'rgba(100,180,255,0.22)', dbTint:'rgba(100,180,255,0.22)', dbKey:'cool',      cinematicBars:false, gl:{brightness:0,    contrast:1.1,  saturation:0.9,  hue:-8,  rMultiplier:0.85, gMultiplier:0.95, bMultiplier:1.18, vignette:0.15,addNoise:false} },
  { id:'warm',     name:'Warm',     emoji:'🔥', tintColor:'rgba(255,160,50,0.22)',  dbTint:'rgba(255,160,50,0.22)',  dbKey:'warm',      cinematicBars:false, gl:{brightness:0.03, contrast:1.05, saturation:1.2,  hue:8,   rMultiplier:1.15, gMultiplier:0.95, bMultiplier:0.75, vignette:0.2, addNoise:false} },
  { id:'dramatic', name:'Dramatic', emoji:'🎭', tintColor:'rgba(0,0,0,0.35)',       dbTint:'rgba(0,0,0,0.35)',       dbKey:'dramatic',  cinematicBars:false, gl:{brightness:-0.05,contrast:1.5,  saturation:0.85, hue:0,   rMultiplier:1.0,  gMultiplier:0.95, bMultiplier:0.9,  vignette:0.55,addNoise:false} },
  { id:'bright',   name:'Bright',   emoji:'☀️', tintColor:'rgba(255,255,200,0.18)', dbTint:'rgba(255,255,200,0.18)', dbKey:'bright',    cinematicBars:false, gl:{brightness:0.1,  contrast:0.95, saturation:1.1,  hue:0,   rMultiplier:1.05, gMultiplier:1.05, bMultiplier:0.95, vignette:0,   addNoise:false} },
  { id:'noir',     name:'Noir',     emoji:'🎬', tintColor:'rgba(0,0,0,0.5)',        dbTint:'rgba(0,0,0,0.5)',        dbKey:'noir',      cinematicBars:false, gl:{brightness:-0.04,contrast:1.6,  saturation:0.0,  hue:0,   rMultiplier:1.0,  gMultiplier:1.0,  bMultiplier:1.0,  vignette:0.6, addNoise:false} },
  { id:'neon',     name:'Neon',     emoji:'💚', tintColor:'rgba(0,255,136,0.2)',    dbTint:'rgba(0,255,136,0.2)',    dbKey:'neon',      cinematicBars:false, gl:{brightness:0,    contrast:1.3,  saturation:2.0,  hue:0,   rMultiplier:0.85, gMultiplier:1.2,  bMultiplier:0.95, vignette:0.25,addNoise:false} },
  { id:'sunset',   name:'Sunset',   emoji:'🌅', tintColor:'rgba(255,80,80,0.25)',   dbTint:'rgba(255,80,80,0.25)',   dbKey:'sunset',    cinematicBars:false, gl:{brightness:0.02, contrast:1.2,  saturation:1.4,  hue:5,   rMultiplier:1.2,  gMultiplier:0.85, bMultiplier:0.65, vignette:0.3, addNoise:false} },
  { id:'cinematic',name:'Cinematic',emoji:'🎥', tintColor:'rgba(20,10,40,0.45)',    dbTint:'rgba(20,10,40,0.45)',    dbKey:'cinematic', cinematicBars:true,  gl:{brightness:-0.03,contrast:1.25, saturation:0.8,  hue:-5,  rMultiplier:0.9,  gMultiplier:0.88, bMultiplier:1.1,  vignette:0.5, addNoise:false} },
  { id:'golden',   name:'Golden',   emoji:'✨', tintColor:'rgba(255,200,50,0.22)',  dbTint:'rgba(255,200,50,0.22)',  dbKey:'golden',    cinematicBars:false, gl:{brightness:0.04, contrast:1.08, saturation:1.3,  hue:12,  rMultiplier:1.18, gMultiplier:1.05, bMultiplier:0.6,  vignette:0.2, addNoise:false} },
  { id:'rose',     name:'Rose',     emoji:'🌸', tintColor:'rgba(255,100,150,0.22)', dbTint:'rgba(255,100,150,0.22)', dbKey:'rose',      cinematicBars:false, gl:{brightness:0.03, contrast:1.0,  saturation:1.1,  hue:-10, rMultiplier:1.12, gMultiplier:0.88, bMultiplier:1.0,  vignette:0.15,addNoise:false} },
  { id:'glitch',   name:'Glitch',   emoji:'⚡', tintColor:'rgba(255,0,80,0.15)',    dbTint:'rgba(255,0,80,0.15)',    dbKey:'glitch',    cinematicBars:false, glitchEffect:true, gl:{brightness:0,contrast:1.35,saturation:1.8,hue:0,rMultiplier:1.2,gMultiplier:0.8,bMultiplier:1.1,vignette:0.3,addNoise:true} },
];

const SPEED_OPTIONS = [
  {id:'slow_025',label:'0.25x',emoji:'🐌',rate:0.25,dbKey:'slow_025'},
  {id:'slow_05', label:'0.5x', emoji:'🐢',rate:0.5, dbKey:'slow_05' },
  {id:'normal',  label:'1x',   emoji:'▶️', rate:1.0, dbKey:'none'    },
  {id:'fast_15', label:'1.5x', emoji:'⚡', rate:1.5, dbKey:'fast_15' },
  {id:'fast_2',  label:'2x',   emoji:'🚀',rate:2.0, dbKey:'fast_2'  },
];
const VIBE_TYPES = [
  {id:'fire',    label:'Fire',      emoji:'🔥',color:'#ff4500',description:'Hot & trending'  },
  {id:'funny',   label:'Funny',     emoji:'😂',color:'#ffd700',description:'Made me laugh'   },
  {id:'shocking',label:'Shocking',  emoji:'😱',color:'#ff6b35',description:"Can't believe it"},
  {id:'love',    label:'Love',      emoji:'❤️',color:'#ff1744',description:'Heartfelt'       },
  {id:'mindblow',label:'Mind-blown',emoji:'🤯',color:'#aa00ff',description:'This is crazy'   },
  {id:'dead',    label:'Dead 💀',   emoji:'💀',color:'#00e5ff',description:'Too funny'       },
  {id:'hype',    label:'Hype',      emoji:'🚀',color:'#00ff88',description:'Gets you hyped'  },
  {id:'sad',     label:'Sad',       emoji:'😢',color:'#448aff',description:'Emotional'       },
];
const EDITING_APPS = [
  {id:'capcut',  name:'CapCut',  icon:'🎬',color:'#000000',description:'Professional video editor',  features:['Templates','Transitions'],appStore:'https://apps.apple.com/app/capcut-video-editor/id1500855883',     playStore:'https://play.google.com/store/apps/details?id=com.lemon.lvoverseas',     scheme:'capcut://',   type:'video'},
  {id:'snapchat',name:'Snapchat',icon:'👻',color:'#FFFC00',description:'Amazing AR filters and lenses',features:['AR Filters','Face Lenses'],appStore:'https://apps.apple.com/app/snapchat/id447188370',                playStore:'https://play.google.com/store/apps/details?id=com.snapchat.android',       scheme:'snapchat://', type:'both'},
];

// ─── ANIMATED BACKGROUNDS ─────────────────────────────────
// These are animated colour overlays for the camera view.
// Button label: "BG" (right tool panel) — renamed from "Green Screen"
const ANIMATED_BACKGROUNDS = [
  { id:'bg_none',       name:'None',          emoji:'✖️', type:'solid',    value:'transparent' },
  { id:'bg_city',       name:'City Night',    emoji:'🌃', type:'animated', colors:['#0a0a2e','#1a1a4e','#0d0d1f'] },
  { id:'bg_beach',      name:'Beach Sunset',  emoji:'🏖️', type:'animated', colors:['#ff6b35','#f7c59f','#4ecdc4'] },
  { id:'bg_space',      name:'Deep Space',    emoji:'🌌', type:'animated', colors:['#0a0010','#1a0030','#000820'] },
  { id:'bg_club',       name:'Club Lights',   emoji:'🎉', type:'animated', colors:['#ff0080','#7c3aed','#00ff88'] },
  { id:'bg_forest',     name:'Forest',        emoji:'🌲', type:'animated', colors:['#134e5e','#71b280','#1a3a1a'] },
  { id:'bg_fire',       name:'Fire Inferno',  emoji:'🔥', type:'animated', colors:['#ff4500','#ff8c00','#cc0000'] },
  { id:'bg_ocean',      name:'Deep Ocean',    emoji:'🌊', type:'animated', colors:['#001219','#0077b6','#00b4d8'] },
  { id:'bg_gold',       name:'Golden Hour',   emoji:'✨', type:'animated', colors:['#f9c74f','#f8961e','#f3722c'] },
  { id:'bg_matrix',     name:'Matrix',        emoji:'💻', type:'animated', colors:['#000000','#003300','#00ff00'] },
  { id:'bg_white',      name:'Pure White',    emoji:'⬜', type:'solid',    value:'#ffffff' },
  { id:'bg_black',      name:'Pure Black',    emoji:'⬛', type:'solid',    value:'#000000' },
];

// ─── EFFECT BURSTS ────────────────────────────────────────
// One-tap visual burst effects. Button label: "Burst" (right tool panel)
// Renamed from "Gesture Effects" — no ML detection, user taps to fire.
const EFFECT_BURSTS = [
  { id:'burst_fireworks', emoji:'🎆', name:'Fireworks', effect:'fireworks', desc:'Tap → fireworks 🎆' },
  { id:'burst_hearts',    emoji:'❤️', name:'Hearts',    effect:'hearts',    desc:'Tap → hearts ❤️'   },
  { id:'burst_explosion', emoji:'💥', name:'Explosion', effect:'explosion', desc:'Tap → explosion 💥' },
  { id:'burst_rainbow',   emoji:'🌈', name:'Rainbow',   effect:'rainbow',   desc:'Tap → rainbow 🌈'  },
  { id:'burst_lightning', emoji:'⚡', name:'Lightning', effect:'lightning', desc:'Tap → lightning ⚡' },
  { id:'burst_sparkle',   emoji:'✨', name:'Sparkle',   effect:'sparkle',   desc:'Tap → sparkle ✨'   },
];

// ─── HELPERS ──────────────────────────────────────────────
function isRemoteUrl(uri: string) {
  return !!uri && (uri.startsWith('http://') || uri.startsWith('https://'));
}
function getGradientColors(bgId: string): readonly [string,string] {
  const g: Record<string,readonly [string,string]> = {
    purple:['#667eea','#764ba2'],sunset:['#f83600','#f9d423'],ocean:['#2E3192','#1BFFFF'],
    forest:['#134E5E','#71B280'],fire:['#eb3349','#f45c43'],midnight:['#232526','#414345'],
    rose:['#f857a6','#ff5858'],mint:['#00b09b','#96c93d'],
  };
  return g[bgId] || ['#667eea','#764ba2'];
}
function buildCloudinaryAudioUrl(url: string, eff: VoiceEffect): string {
  if (!url || eff.id === 'none' || !url.includes('cloudinary.com')) return url;
  const t: string[] = [];
  if (eff.cloudinaryPitch)  t.push(`e_pitch:${eff.cloudinaryPitch}`);
  if (eff.cloudinaryVolume && eff.cloudinaryVolume !== 100) t.push(`e_volume:${eff.cloudinaryVolume}`);
  if (eff.cloudinaryReverse) t.push('e_reverse');
  if (!t.length) return url;
  const idx = url.indexOf('/upload/');
  if (idx === -1) return url;
  return url.slice(0,idx+8) + t.join(',') + '/' + url.slice(idx+8);
}

// ─── DRAFTS ───────────────────────────────────────────────
async function loadDrafts(): Promise<Draft[]> {
  try { const r = await AsyncStorage.getItem(DRAFTS_STORAGE_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
async function saveDrafts(d: Draft[]) {
  try { await AsyncStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(d)); } catch {}
}
async function addDraft(d: Draft) {
  const ex = await loadDrafts(); const up = [d,...ex].slice(0,MAX_DRAFTS);
  await saveDrafts(up); return up;
}
async function deleteDraft(id: string) {
  const ex = await loadDrafts(); const up = ex.filter(d => d.id !== id);
  await saveDrafts(up); return up;
}
async function compressImage(uri: string): Promise<string> {
  try {
    const r = await ImageManipulator.manipulateAsync(uri,[{resize:{width:IMAGE_COMPRESSION.maxWidth}}],{compress:IMAGE_COMPRESSION.quality,format:IMAGE_COMPRESSION.format});
    return r.uri;
  } catch { return uri; }
}

// ─── GL SHADER (filter baking) ────────────────────────────
async function applyGlShader(inputUri: string, p: GlParams): Promise<string> {
  const compressed = await compressImage(inputUri);
  if (p.brightness===0&&p.contrast===1&&p.saturation===1&&p.hue===0&&
      p.rMultiplier===1&&p.gMultiplier===1&&p.bMultiplier===1&&p.vignette===0&&!p.addNoise)
    return compressed;
  try {
    const gl: WebGLRenderingContext = await GLView.createContextAsync();
    gl.viewport(0,0,1080,1920);
    const v = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(v,`attribute vec2 a;varying vec2 uv;void main(){uv=a*.5+.5;gl_Position=vec4(a,0,1);}`);
    gl.compileShader(v);
    const f = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(f,`
      precision mediump float;
      varying vec2 uv; uniform sampler2D tex;
      uniform float br,co,sa,hu,r,g,b,vi,no,seed;
      mat3 hrot(float a){float c=cos(a),s=sin(a);
        return mat3(.299+.701*c+.168*s,.587-.587*c+.330*s,.114-.114*c-.497*s,
                    .299-.299*c-.328*s,.587+.413*c+.035*s,.114-.114*c+.292*s,
                    .299-.300*c+1.25*s,.587-.588*c-1.05*s,.114+.886*c-.203*s);}
      float rnd(vec2 c){return fract(sin(dot(c+seed,vec2(12.9898,78.233)))*43758.5453);}
      void main(){
        vec4 src=texture2D(tex,uv);vec3 col=src.rgb;
        col*=vec3(r,g,b);
        float l=dot(col,vec3(.2126,.7152,.0722));
        col=mix(vec3(l),col,sa);
        if(abs(hu)>.001)col=hrot(radians(hu))*col;
        col=(col+br-.5)*co+.5;
        if(vi>0.){vec2 d=uv-.5;float vd=dot(d,d)*4.;col*=mix(1.,1.-vd*vi,vi);}
        if(no>0.){float gr=(rnd(uv)-.5)*no;col+=vec3(gr);}
        gl_FragColor=vec4(clamp(col,0.,1.),src.a);}
    `);
    gl.compileShader(f);
    const prog = gl.createProgram()!;
    gl.attachShader(prog,v); gl.attachShader(prog,f); gl.linkProgram(prog); gl.useProgram(prog);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,{uri:compressed} as any);
    const ul=(n:string)=>gl.getUniformLocation(prog,n);
    gl.uniform1i(ul('tex'),0);
    gl.uniform1f(ul('br'),p.brightness); gl.uniform1f(ul('co'),p.contrast);
    gl.uniform1f(ul('sa'),p.saturation); gl.uniform1f(ul('hu'),p.hue);
    gl.uniform1f(ul('r'),p.rMultiplier); gl.uniform1f(ul('g'),p.gMultiplier);
    gl.uniform1f(ul('b'),p.bMultiplier); gl.uniform1f(ul('vi'),p.vignette);
    gl.uniform1f(ul('no'),p.addNoise?0.06:0); gl.uniform1f(ul('seed'),Math.random());
    const buf=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,buf);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const ap=gl.getAttribLocation(prog,'a');
    gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap,2,gl.FLOAT,false,0,0);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4); gl.flush();
    const snap = await GLView.takeSnapshotAsync(
  gl as unknown as ExpoWebGLRenderingContext,
  { format: 'jpeg' }
);
    return typeof snap.uri === 'string' ? snap.uri : '';

  } catch(e){ console.warn('GL shader failed, using compressed fallback:',e); return compressed; }
}

async function checkVideoSize(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri,{size:true});
    if (info.exists && 'size' in info && (info.size as number) > VIDEO_SIZE_LIMIT_MB*1024*1024) {
      const mb = ((info.size as number)/1024/1024).toFixed(0);
      return new Promise(res=>Alert.alert('⚠️ Large Video',`This video is ${mb}MB. Continue?`,[
        {text:'Cancel',style:'cancel',onPress:()=>res(false)},
        {text:'Upload Anyway',onPress:()=>res(true)},
      ]));
    }
    return true;
  } catch { return true; }
}

async function uploadVideoToCloudinary(uri: string, onProgress:(p:number)=>void): Promise<{url:string;publicId:string}> {
  return new Promise((resolve,reject)=>{
    const xhr = new XMLHttpRequest();
    const fd  = new FormData();
    fd.append('file',{uri,type:'video/mp4',name:`v_${Date.now()}.mp4`} as any);
    fd.append('upload_preset',CLOUDINARY_UPLOAD_PRESET);
    fd.append('cloud_name',CLOUDINARY_CLOUD_NAME);
    xhr.upload.onprogress=e=>{ if(e.lengthComputable) onProgress(Math.round(e.loaded/e.total*100)); };
    xhr.onload=()=>{
      if(xhr.status===200){ try{ const d=JSON.parse(xhr.responseText); resolve({url:d.secure_url,publicId:d.public_id}); }catch{ reject(new Error('Parse error')); } }
      else reject(new Error(`Cloudinary ${xhr.status}`));
    };
    xhr.onerror=()=>reject(new Error('Network error'));
    xhr.open('POST',`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`);
    xhr.send(fd);
  });
}

// ─── UPLOAD PROGRESS CIRCLE ───────────────────────────────
function UploadProgressCircle({progress,stage}:{progress:number;stage:string}) {
  const pct=Math.min(Math.max(progress,0),100);
  const S=140,ST=10;
  const glow=useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    Animated.loop(Animated.sequence([
      Animated.timing(glow,{toValue:1,duration:900,useNativeDriver:false}),
      Animated.timing(glow,{toValue:0,duration:900,useNativeDriver:false}),
    ])).start();
  },[]);
  const gSz=glow.interpolate({inputRange:[0,1],outputRange:[4,18]});
  const gOp=glow.interpolate({inputRange:[0,1],outputRange:[0.4,1.0]});
  const ld=pct<=50?(pct/50)*180:180;
  const rd=pct>50?((pct-50)/50)*180:0;
  const ds=stage.includes('Cloudinary')||stage.includes('video')?'Video uploading...':stage==='Posted! 🎉'?'Saved & uploaded ✓':stage;
  return (
    <View style={up.overlay}>
      <View style={up.card}>
        <Animated.View style={[up.glow,{shadowRadius:gSz,shadowOpacity:gOp,opacity:gOp}]} pointerEvents="none"/>
        <View style={{width:S,height:S,alignItems:'center',justifyContent:'center'}}>
          <View style={{position:'absolute',width:S,height:S,borderRadius:S/2,borderWidth:ST,borderColor:'#1a1a1a'}}/>
          <View style={{position:'absolute',width:S,height:S,overflow:'hidden',left:S/2}}>
            <View style={{position:'absolute',width:S,height:S,borderRadius:S/2,borderWidth:ST,borderColor:'#00ff88',borderLeftColor:'transparent',borderBottomColor:'transparent',transform:[{rotate:`${rd-180}deg`}],left:-S/2}}/>
          </View>
          <View style={{position:'absolute',width:S,height:S,overflow:'hidden',right:S/2}}>
            <View style={{position:'absolute',width:S,height:S,borderRadius:S/2,borderWidth:ST,borderColor:pct>50?'#00ff88':'transparent',borderRightColor:'transparent',borderTopColor:'transparent',transform:[{rotate:`${ld}deg`}],right:-S/2}}/>
          </View>
          <Animated.View style={{alignItems:'center',opacity:gOp}}>
            <Text style={up.pct}>{Math.round(pct)}%</Text>
            <Text style={up.lbl}>uploading</Text>
          </Animated.View>
        </View>
        <Text style={up.stage}>{ds}</Text>
        <Text style={up.hint}>Please keep the app open</Text>
      </View>
    </View>
  );
}
const up = StyleSheet.create({
  overlay:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(0,0,0,0.88)',alignItems:'center',justifyContent:'center',zIndex:999},
  card:{backgroundColor:'#111',borderRadius:24,padding:32,alignItems:'center',borderWidth:1.5,borderColor:'#00ff88',width:260},
  glow:{position:'absolute',width:160,height:160,borderRadius:80,borderWidth:2,borderColor:'#00ff88',shadowColor:'#00ff88',shadowOffset:{width:0,height:0}},
  pct:{color:'#00ff88',fontSize:32,fontWeight:'800'},
  lbl:{color:'#666',fontSize:11,marginTop:2},
  stage:{color:'#fff',fontSize:14,fontWeight:'600',marginTop:20,textAlign:'center'},
  hint:{color:'#555',fontSize:11,marginTop:8,textAlign:'center'},
});

// ─── VOLUME SLIDER ────────────────────────────────────────
function VolumeSlider({value,onValueChange,color='#00ff88',label,emoji}:{value:number;onValueChange:(v:number)=>void;color?:string;label:string;emoji:string}) {
  const TW=SW-80;
  const tx=useRef(new Animated.Value(value*TW)).current;
  const cv=useRef(value); const sv=useRef(value);
  useEffect(()=>{ tx.setValue(value*TW); cv.current=value; },[value]);
  const pan=useRef(PanResponder.create({
    onStartShouldSetPanResponder:()=>true, onMoveShouldSetPanResponder:()=>true,
    onPanResponderGrant:()=>{ sv.current=cv.current; },
    onPanResponderMove:(_,gs)=>{ const x=Math.min(Math.max(sv.current*TW+gs.dx,0),TW); tx.setValue(x); onValueChange(Math.round(x/TW*100)/100); },
    onPanResponderRelease:(_,gs)=>{ const x=Math.min(Math.max(sv.current*TW+gs.dx,0),TW); const v=Math.round(x/TW*100)/100; cv.current=v; onValueChange(v); },
  })).current;
  const pct=Math.round(value*100);
  return (
    <View style={sl.row}>
      <Text style={sl.emoji}>{emoji}</Text>
      <View style={{flex:1}}>
        <View style={sl.lblRow}><Text style={sl.lbl}>{label}</Text><Text style={[sl.pct,{color}]}>{pct}%</Text></View>
        <View style={sl.track}>
          <View style={[sl.fill,{width:`${pct}%` as any,backgroundColor:color}]}/>
          <Animated.View style={[sl.thumb,{backgroundColor:color,transform:[{translateX:Animated.subtract(tx,10)}]}]} {...pan.panHandlers}/>
        </View>
      </View>
    </View>
  );
}
const sl=StyleSheet.create({
  row:{flexDirection:'row',alignItems:'center',marginBottom:14,paddingHorizontal:4},
  emoji:{fontSize:20,marginRight:12,width:28,textAlign:'center'},
  lblRow:{flexDirection:'row',justifyContent:'space-between',marginBottom:6},
  lbl:{color:'#ccc',fontSize:13,fontWeight:'600'}, pct:{fontSize:13,fontWeight:'700'},
  track:{height:6,backgroundColor:'#2a2a2a',borderRadius:3,position:'relative',overflow:'visible'},
  fill:{position:'absolute',left:0,top:0,height:6,borderRadius:3},
  thumb:{position:'absolute',top:-7,width:20,height:20,borderRadius:10,elevation:4},
});

// ─── STUDIO SLIDER ────────────────────────────────────────
function StudioSlider({value,onChange,color}:{value:number;onChange:(v:number)=>void;color:string}) {
  const TW=SW-100;
  const tx=useRef(new Animated.Value(value*TW)).current;
  const cv=useRef(value);
  useEffect(()=>{ tx.setValue(value*TW); cv.current=value; },[value]);
  const pan=useRef(PanResponder.create({
    onStartShouldSetPanResponder:()=>true, onMoveShouldSetPanResponder:()=>true,
    onPanResponderGrant:()=>{},
    onPanResponderMove:(_,gs)=>{ const x=Math.min(Math.max(cv.current*TW+gs.dx,0),TW); tx.setValue(x); onChange(Math.round(x/TW*100)/100); },
    onPanResponderRelease:(_,gs)=>{ const x=Math.min(Math.max(cv.current*TW+gs.dx,0),TW); const v=Math.round(x/TW*100)/100; cv.current=v; onChange(v); },
  })).current;
  const pct=Math.round(value*100);
  return (
    <View style={{height:6,backgroundColor:'#2a2a2a',borderRadius:3,marginVertical:8}}>
      <View style={{position:'absolute',left:0,top:0,height:6,width:`${pct}%` as any,backgroundColor:color,borderRadius:3}}/>
      <Animated.View style={{position:'absolute',top:-7,width:20,height:20,borderRadius:10,backgroundColor:color,transform:[{translateX:Animated.subtract(tx,10)}]}} {...pan.panHandlers}/>
    </View>
  );
}

// ─── STUDIO WAVEFORM ──────────────────────────────────────
function StudioWave({active}:{active:boolean}) {
  const bars=useRef(Array.from({length:32},()=>new Animated.Value(0.3))).current;
  const ar=useRef<Animated.CompositeAnimation|null>(null);
  useEffect(()=>{
    if(active){
      ar.current=Animated.parallel(bars.map((b,i)=>Animated.loop(Animated.sequence([
        Animated.timing(b,{toValue:Math.random()*.7+.3,duration:160+i*9,useNativeDriver:false}),
        Animated.timing(b,{toValue:Math.random()*.3+.1,duration:160+i*9,useNativeDriver:false}),
      ]))));
      ar.current.start();
    } else { ar.current?.stop(); bars.forEach(b=>b.setValue(.3)); }
    return ()=>{ ar.current?.stop(); };
  },[active]);
  return (
    <View style={{flexDirection:'row',alignItems:'center',height:48,gap:2,paddingHorizontal:4}}>
      {bars.map((b,i)=>(
        <Animated.View key={i} style={{width:3,borderRadius:2,backgroundColor:active?'#00ff88':'#333',height:b.interpolate({inputRange:[0,1],outputRange:[3,44]})}}/>
      ))}
    </View>
  );
}

// ─── AR OVERLAY ───────────────────────────────────────────
// faceData is always null — face detection polling removed for performance.
// Face AR effects show a "move closer" hint. Float/top types work normally.
function AROverlay({effectId,faceData,cW,cH}:{effectId:string;faceData:FaceData|null;cW:number;cH:number}) {
  const floatAnims=useRef(Array.from({length:14},()=>({
    x:new Animated.Value(Math.random()*SW),y:new Animated.Value(-80),
    op:new Animated.Value(0),rot:new Animated.Value(0),sc:new Animated.Value(.6+Math.random()*.8),
  }))).current;
  const running=useRef(false);
  const eff=AR_EFFECTS.find(e=>e.id===effectId);
  useEffect(()=>{
    if(!eff||eff.type==='none'||eff.type==='face'||eff.type==='top'){
      running.current=false; floatAnims.forEach(a=>{a.op.setValue(0);a.y.setValue(-80);}); return;
    }
    running.current=true;
    const start=(i:number)=>{
      const a=floatAnims[i];
      a.x.setValue(Math.random()*SW); a.y.setValue(-80); a.op.setValue(0);
      a.rot.setValue(0); a.sc.setValue(.5+Math.random()*.9);
      const dur=2400+Math.random()*1800;
      Animated.parallel([
        Animated.timing(a.y,{toValue:SH+80,duration:dur,useNativeDriver:true}),
        Animated.sequence([
          Animated.timing(a.op,{toValue:.95,duration:350,useNativeDriver:true}),
          Animated.timing(a.op,{toValue:.85,duration:dur-600,useNativeDriver:true}),
          Animated.timing(a.op,{toValue:0,duration:250,useNativeDriver:true}),
        ]),
        Animated.timing(a.rot,{toValue:Math.random()>.5?360:-360,duration:dur,useNativeDriver:true}),
      ]).start(()=>{ if(running.current) setTimeout(()=>start(i),Math.random()*400); });
    };
    floatAnims.forEach((_,i)=>setTimeout(()=>start(i),i*150+Math.random()*200));
    return ()=>{ running.current=false; };
  },[effectId]);
  if(!eff||eff.type==='none') return null;
  if(eff.type==='face') return (
    <View style={{position:'absolute',bottom:260,left:0,right:0,alignItems:'center'}} pointerEvents="none">
      <View style={{backgroundColor:'rgba(0,0,0,0.6)',borderRadius:8,paddingHorizontal:12,paddingVertical:6}}>
        <Text style={{color:'#ffd700',fontSize:12,fontWeight:'600'}}>Face AR — move closer to camera</Text>
      </View>
    </View>
  );
  if(eff.type==='top') return (
    <View style={{position:'absolute',top:0,left:0,right:0,alignItems:'center',paddingTop:20}} pointerEvents="none">
      <Text style={{fontSize:60}}>🌈</Text>
    </View>
  );
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {floatAnims.map((a,i)=>(
        <Animated.Text key={i} style={{position:'absolute',fontSize:20+(i%4)*7,
          transform:[{translateX:a.x},{translateY:a.y},{rotate:a.rot.interpolate({inputRange:[-360,360],outputRange:['-360deg','360deg']})},{scale:a.sc}],
          opacity:a.op}}>
          {eff.emoji}
        </Animated.Text>
      ))}
    </View>
  );
}

// ─── ANIMATED BACKGROUND LAYER ────────────────────────────
function AnimatedBackground({backgroundId,intensity=1}:{backgroundId:string;intensity?:number}) {
  const bg = ANIMATED_BACKGROUNDS.find(b=>b.id===backgroundId);
  const anim  = useRef(new Animated.Value(0)).current;
  const anim2 = useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    if(!bg||bg.type!=='animated') return;
    Animated.loop(Animated.sequence([
      Animated.timing(anim,{toValue:1,duration:3000,useNativeDriver:false}),
      Animated.timing(anim,{toValue:0,duration:3000,useNativeDriver:false}),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(anim2,{toValue:1,duration:2200,useNativeDriver:false}),
      Animated.timing(anim2,{toValue:0,duration:2200,useNativeDriver:false}),
    ])).start();
  },[backgroundId]);
  if(!bg||bg.id==='bg_none') return null;
  if(bg.type==='solid') return <View style={[StyleSheet.absoluteFill,{backgroundColor:bg.value as string,zIndex:0}]} pointerEvents="none"/>;
  const colors=(bg as any).colors as string[];
  const bgColor=anim.interpolate({inputRange:[0,0.5,1],outputRange:[colors[0],colors[1],colors[2]||colors[0]]});
  const overlayOp=anim2.interpolate({inputRange:[0,1],outputRange:[0.3,0.7]});
  return (
    <View style={[StyleSheet.absoluteFill,{zIndex:0}]} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill,{backgroundColor:bgColor,opacity:intensity}]}/>
      {backgroundId==='bg_club'&&<Animated.View style={[StyleSheet.absoluteFill,{backgroundColor:'rgba(255,0,128,0.15)',opacity:overlayOp}]}/>}
      {backgroundId==='bg_matrix'&&(
        <View style={StyleSheet.absoluteFill}>
          {Array.from({length:8}).map((_,i)=>(
            <Animated.Text key={i} style={{position:'absolute',left:(i/8)*SW,
              top:anim.interpolate({inputRange:[0,1],outputRange:[-50,SH+50]}) as any,
              color:'#00ff00',fontSize:12,fontFamily:'monospace',opacity:0.6}}>
              {['01','10','11','00','01'][i%5]}
            </Animated.Text>
          ))}
        </View>
      )}
      <View style={{position:'absolute',bottom:260,left:0,right:0,alignItems:'center'}} pointerEvents="none">
        <View style={{backgroundColor:'rgba(0,0,0,0.55)',borderRadius:10,paddingHorizontal:14,paddingVertical:5}}>
          <Text style={{color:'#00ff88',fontSize:11,fontWeight:'700'}}>🎨 Animated BG: {bg.name}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── EFFECT BURST OVERLAY ─────────────────────────────────
function EffectBurstOverlay({effect,visible}:{effect:string;visible:boolean}) {
  const anims=useRef(Array.from({length:20},()=>({
    x:new Animated.Value(SW/2),y:new Animated.Value(SH/2),
    op:new Animated.Value(0),sc:new Animated.Value(0),
  }))).current;
  useEffect(()=>{
    if(!visible) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    anims.forEach((a,i)=>{
      const angle=(i/anims.length)*Math.PI*2;
      const dist=80+Math.random()*120;
      a.x.setValue(SW/2); a.y.setValue(SH/2); a.op.setValue(0); a.sc.setValue(0);
      Animated.sequence([
        Animated.delay(i*30),
        Animated.parallel([
          Animated.timing(a.op,{toValue:1,duration:150,useNativeDriver:true}),
          Animated.timing(a.sc,{toValue:1,duration:200,useNativeDriver:true}),
          Animated.timing(a.x,{toValue:SW/2+Math.cos(angle)*dist,duration:600,useNativeDriver:true}),
          Animated.timing(a.y,{toValue:SH/2+Math.sin(angle)*dist,duration:600,useNativeDriver:true}),
        ]),
        Animated.timing(a.op,{toValue:0,duration:300,useNativeDriver:true}),
      ]).start();
    });
  },[visible]);
  if(!visible) return null;
  const EMOJI:Record<string,string>={fireworks:'🎆',hearts:'❤️',explosion:'💥',rainbow:'🌈',lightning:'⚡',sparkle:'✨'};
  const emoji=EMOJI[effect]||'✨';
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {anims.map((a,i)=>(
        <Animated.Text key={i} style={{position:'absolute',fontSize:18+(i%3)*8,
          transform:[{translateX:a.x},{translateY:a.y},{scale:a.sc}],opacity:a.op}}>
          {emoji}
        </Animated.Text>
      ))}
    </View>
  );
}

// ─── EFFECT BURST PANEL ───────────────────────────────────
function EffectBurstPanel({visible,activeBurst,onBurstSelect,onClose}:
  {visible:boolean;activeBurst:string|null;onBurstSelect:(id:string)=>void;onClose:()=>void}) {
  if(!visible) return null;
  return (
    <View style={ep.panel}>
      <View style={ep.panelHeader}>
        <Text style={ep.panelTitle}>✨ Effect Bursts</Text>
        <TouchableOpacity onPress={onClose}><Feather name="x" size={18} color="#666"/></TouchableOpacity>
      </View>
      <Text style={ep.panelSub}>Select an effect, then tap the burst button while recording</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:10,paddingHorizontal:4}}>
        {EFFECT_BURSTS.map(b=>{
          const isActive=activeBurst===b.id;
          return (
            <TouchableOpacity key={b.id} style={[ep.chip,isActive&&ep.chipActive]}
              onPress={()=>{onBurstSelect(b.id);Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);}}>
              <Text style={ep.chipEmoji}>{b.emoji}</Text>
              <Text style={[ep.chipName,isActive&&{color:'#00ff88'}]}>{b.name}</Text>
              <Text style={ep.chipDesc}>{b.desc}</Text>
              {isActive&&<View style={ep.chipCheck}><Feather name="check" size={8} color="#000"/></View>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {activeBurst&&(
        <View style={ep.hint}><Text style={ep.hintTxt}>✅ Ready — tap the 🎆 button to fire burst!</Text></View>
      )}
    </View>
  );
}
const ep=StyleSheet.create({
  panel:{position:'absolute',bottom:195,left:0,right:0,backgroundColor:'rgba(0,0,0,0.92)',paddingVertical:14,paddingHorizontal:12,zIndex:15,borderTopWidth:1,borderTopColor:'#1a1a1a'},
  panelHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:4},
  panelTitle:{color:'#fff',fontSize:14,fontWeight:'700'},
  panelSub:{color:'#666',fontSize:11,marginBottom:10},
  chip:{alignItems:'center',backgroundColor:'#111',borderRadius:14,padding:10,minWidth:80,borderWidth:1,borderColor:'#222',position:'relative'},
  chipActive:{backgroundColor:'#001a0a',borderColor:'#00ff88'},
  chipEmoji:{fontSize:26,marginBottom:4},
  chipName:{color:'#fff',fontSize:10,fontWeight:'700',textAlign:'center'},
  chipDesc:{color:'#555',fontSize:8,textAlign:'center',marginTop:2},
  chipCheck:{position:'absolute',top:4,right:4,width:14,height:14,borderRadius:7,backgroundColor:'#00ff88',alignItems:'center',justifyContent:'center'},
  hint:{marginTop:8,backgroundColor:'#001a0a',borderRadius:8,padding:8,borderWidth:1,borderColor:'#00ff8833'},
  hintTxt:{color:'#00ff88',fontSize:11,textAlign:'center',fontWeight:'600'},
});

// ─── DUAL CAMERA VIEW (EXPERIMENTAL) ─────────────────────
// Two CameraView instances shown simultaneously.
// Results vary by device — the PiP feed may be black on some Android phones.
// An ⚠️ disclaimer alert is shown before enabling (see right tools panel).
function DualCameraView({facing,flash,isRecording,onToggleFacing}:
  {facing:'back'|'front';flash:'off'|'on';isRecording:boolean;onToggleFacing:()=>void}) {
  const pipScale=useRef(new Animated.Value(1)).current;
  useEffect(()=>{
    if(isRecording){
      Animated.loop(Animated.sequence([
        Animated.timing(pipScale,{toValue:1.03,duration:800,useNativeDriver:true}),
        Animated.timing(pipScale,{toValue:1.0,duration:800,useNativeDriver:true}),
      ])).start();
    } else { pipScale.setValue(1); }
  },[isRecording]);
  return (
    <View style={dualS.container}>
      <CameraView style={StyleSheet.absoluteFill} facing={facing==='back'?'back':'front'} enableTorch={flash==='on'} mode="video"/>
      <Animated.View style={[dualS.pip,{transform:[{scale:pipScale}]}]}>
        <CameraView style={StyleSheet.absoluteFill} facing={facing==='back'?'front':'back'} mode="video"/>
        {isRecording&&<View style={dualS.pipRecDot}/>}
        <TouchableOpacity style={dualS.pipFlip} onPress={onToggleFacing}>
          <MaterialCommunityIcons name="camera-flip" size={16} color="#fff"/>
        </TouchableOpacity>
      </Animated.View>
      <View style={dualS.badge}><View style={dualS.badgeDot}/><Text style={dualS.badgeTxt}>DUAL CAM</Text></View>
      <View style={dualS.expBadge}><Text style={dualS.expTxt}>⚠️ Experimental</Text></View>
      <View style={dualS.hint}><Text style={dualS.hintTxt}>📱 Front + Back — results vary by device</Text></View>
    </View>
  );
}
const dualS=StyleSheet.create({
  container:{flex:1,position:'relative'},
  pip:{position:'absolute',top:100,right:16,width:SW*0.28,height:SW*0.28*1.4,borderRadius:16,overflow:'hidden',borderWidth:2.5,borderColor:'#00ff88',zIndex:20,shadowColor:'#00ff88',shadowOffset:{width:0,height:0},shadowOpacity:0.8,shadowRadius:8,elevation:20},
  pipRecDot:{position:'absolute',top:8,left:8,width:8,height:8,borderRadius:4,backgroundColor:'#ff0000'},
  pipFlip:{position:'absolute',bottom:6,right:6,width:28,height:28,borderRadius:14,backgroundColor:'rgba(0,0,0,0.6)',alignItems:'center',justifyContent:'center'},
  badge:{position:'absolute',top:55,left:16,flexDirection:'row',alignItems:'center',gap:5,backgroundColor:'rgba(0,255,136,0.15)',borderRadius:10,paddingHorizontal:10,paddingVertical:4,borderWidth:1,borderColor:'#00ff88',zIndex:15},
  badgeDot:{width:6,height:6,borderRadius:3,backgroundColor:'#00ff88'},
  badgeTxt:{color:'#00ff88',fontSize:10,fontWeight:'800',letterSpacing:1},
  expBadge:{position:'absolute',top:55,right:16,backgroundColor:'rgba(255,160,0,0.2)',borderRadius:10,paddingHorizontal:10,paddingVertical:4,borderWidth:1,borderColor:'#ffa000',zIndex:15},
  expTxt:{color:'#ffa000',fontSize:9,fontWeight:'700'},
  hint:{position:'absolute',bottom:210,left:0,right:0,alignItems:'center',zIndex:15},
  hintTxt:{color:'rgba(255,255,255,0.7)',fontSize:11,backgroundColor:'rgba(0,0,0,0.55)',paddingHorizontal:12,paddingVertical:5,borderRadius:10},
});

// ─── DRAFTS SCREEN ────────────────────────────────────────
function DraftsScreen({drafts,onLoad,onDelete,onClose}:{drafts:Draft[];onLoad:(d:Draft)=>void;onDelete:(id:string)=>void;onClose:()=>void}) {
  const fmt=(iso:string)=>{
    const d=new Date(iso),now=new Date(),diff=now.getTime()-d.getTime();
    const m=Math.floor(diff/60000),h=Math.floor(diff/3600000),dy=Math.floor(diff/86400000);
    if(m<1)return 'Just now'; if(m<60)return `${m}m ago`;
    if(h<24)return `${h}h ago`; if(dy<7)return `${dy}d ago`;
    return d.toLocaleDateString();
  };
  const badge=(dr:Draft)=>{
    if(dr.statusType==='voice'&&dr.statusVoiceUri)return{label:'🎙️ Voice',color:'#aa00ff'};
    if(dr.statusContent)return{label:'📝 Text',color:'#00b4ff'};
    if(dr.mediaType==='video')return{label:'🎬 Video',color:'#ff4500'};
    if(dr.mediaType==='image')return{label:'🖼️ Image',color:'#00ff88'};
    return{label:'📄 Draft',color:'#888'};
  };
  const renderItem=({item:d}:{item:Draft})=>{
    const bd=badge(d);
    return (
      <View style={drs.card}>
        <View style={drs.thumb}>
          {d.mediaUri?<Image source={{uri:d.mediaUri}} style={drs.tImg} resizeMode="cover"/>
           :d.statusContent?<LinearGradient colors={getGradientColors(d.statusBackground)} style={drs.tGrad}><Text style={drs.tTxt} numberOfLines={3}>{d.statusContent}</Text></LinearGradient>
           :<View style={drs.tEmpty}><MaterialCommunityIcons name="file-document-outline" size={28} color="#444"/></View>}
          <View style={[drs.badge,{backgroundColor:bd.color+'22',borderColor:bd.color}]}>
            <Text style={[drs.badgeTxt,{color:bd.color}]}>{bd.label}</Text>
          </View>
        </View>
        <View style={drs.info}>
          <Text style={drs.cap} numberOfLines={2}>{d.caption||d.statusContent||'No caption'}</Text>
          <View style={drs.tags}>
            {d.filter!=='original'&&<View style={drs.tag}><Text style={drs.tagT}>{FILTERS.find(f=>f.id===d.filter)?.emoji} {d.filter}</Text></View>}
            {d.selectedVibe&&<View style={drs.tag}><Text style={drs.tagT}>{VIBE_TYPES.find(v=>v.id===d.selectedVibe)?.emoji}</Text></View>}
            {d.selectedMusicName&&<View style={drs.tag}><Text style={drs.tagT}>🎵</Text></View>}
          </View>
          <Text style={drs.date}>{fmt(d.createdAt)}</Text>
        </View>
        <View style={drs.acts}>
          <TouchableOpacity style={drs.editBtn} onPress={()=>onLoad(d)}><Text style={drs.editBtnTxt}>Edit</Text></TouchableOpacity>
          <TouchableOpacity style={drs.delBtn} onPress={()=>Alert.alert('Delete Draft','Remove this draft?',[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:()=>onDelete(d.id)}])}>
            <Feather name="trash-2" size={16} color="#ff4444"/>
          </TouchableOpacity>
        </View>
      </View>
    );
  };
  return (
    <View style={drs.screen}>
      <View style={drs.hdr}>
        <TouchableOpacity onPress={onClose} style={drs.back}><Feather name="arrow-left" size={22} color="#00ff88"/></TouchableOpacity>
        <Text style={drs.title}>Drafts</Text>
        <View style={drs.pill}><Text style={drs.pillTxt}>{drafts.length}/{MAX_DRAFTS}</Text></View>
      </View>
      {drafts.length===0
        ?<View style={drs.empty}><Text style={drs.emptyEmoji}>📝</Text><Text style={drs.emptyTitle}>No drafts yet</Text><Text style={drs.emptySub}>Tap "Draft" while creating to save here</Text></View>
        :<FlatList data={drafts} keyExtractor={d=>d.id} renderItem={renderItem} contentContainerStyle={{padding:16,gap:12}} showsVerticalScrollIndicator={false}/>
      }
    </View>
  );
}
const drs=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#000'},
  hdr:{flexDirection:'row',alignItems:'center',paddingHorizontal:16,paddingTop:52,paddingBottom:14,backgroundColor:'#0a0a0a',borderBottomWidth:1,borderBottomColor:'#1a1a1a'},
  back:{width:40,height:40,alignItems:'center',justifyContent:'center'},
  title:{flex:1,color:'#fff',fontSize:20,fontWeight:'700',marginLeft:8},
  pill:{backgroundColor:'#00ff8822',borderRadius:12,paddingHorizontal:10,paddingVertical:4,borderWidth:1,borderColor:'#00ff8855'},
  pillTxt:{color:'#00ff88',fontSize:12,fontWeight:'700'},
  empty:{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:40},
  emptyEmoji:{fontSize:56,marginBottom:16},emptyTitle:{color:'#fff',fontSize:20,fontWeight:'700',marginBottom:8},
  emptySub:{color:'#666',fontSize:14,textAlign:'center',lineHeight:20},
  card:{flexDirection:'row',backgroundColor:'#0d0d0d',borderRadius:16,overflow:'hidden',borderWidth:1,borderColor:'#1e1e1e'},
  thumb:{width:90,height:110,position:'relative'},
  tImg:{width:'100%',height:'100%'},
  tGrad:{width:'100%',height:'100%',alignItems:'center',justifyContent:'center',padding:6},
  tTxt:{color:'#fff',fontSize:10,textAlign:'center',fontWeight:'600'},
  tEmpty:{width:'100%',height:'100%',backgroundColor:'#111',alignItems:'center',justifyContent:'center'},
  badge:{position:'absolute',bottom:4,left:4,right:4,borderRadius:6,borderWidth:1,paddingVertical:2,alignItems:'center'},
  badgeTxt:{fontSize:9,fontWeight:'800'},
  info:{flex:1,padding:12,justifyContent:'space-between'},
  cap:{color:'#ddd',fontSize:13,lineHeight:18,fontWeight:'500'},
  tags:{flexDirection:'row',flexWrap:'wrap',gap:4,marginVertical:4},
  tag:{backgroundColor:'#1a1a1a',borderRadius:6,paddingHorizontal:6,paddingVertical:2},
  tagT:{color:'#888',fontSize:10},
  date:{color:'#555',fontSize:11},
  acts:{paddingVertical:12,paddingRight:12,justifyContent:'space-between',alignItems:'center'},
  editBtn:{backgroundColor:'#00ff88',borderRadius:10,paddingHorizontal:12,paddingVertical:6},
  editBtnTxt:{color:'#000',fontSize:12,fontWeight:'700'},
  delBtn:{width:32,height:32,borderRadius:16,backgroundColor:'#ff444420',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#ff444440'},
});

// ══════════════════════════════════════════════════════════
// END OF PART 1 — continue with create_PART2.tsx
// ══════════════════════════════════════════════════════════ 
// ══════════════════════════════════════════════════════════
// create_PART2.tsx — LumVibe v5 — CORRECTED — PART 2 of 3
// Paste this directly after the last line of PART 1
// Contains: AudioStudio component (unchanged from original)
// ══════════════════════════════════════════════════════════

type StudioTab = 'record'|'beats'|'effects'|'mix';
interface AudioStudioProps {
  visible:boolean; onClose:()=>void;
  onDone:(r:{voiceUri:string|null;beatUri:string|null;beatName:string|null;beatArtist:string|null;voiceVolume:number;beatVolume:number;effectName:string|null;effectId:string|null;effectReverb:number;effectEcho:number;effectChorus:boolean;duration:number;autoTuneEnabled:boolean;})=>void;
}

function AudioStudio({visible,onClose,onDone}:AudioStudioProps) {
  const [tab,setTab]               = useState<StudioTab>('record');
  const [recActive,setRecActive]   = useState(false);
  const [recDur,setRecDur]         = useState(0);
  const [voiceUri,setVoiceUri]     = useState<string|null>(null);
  const [playVoice,setPlayVoice]   = useState(false);
  const [playBeat,setPlayBeat]     = useState(false);
  const [selBeat,setSelBeat]       = useState<typeof STUDIO_BEATS[0]|null>(null);
  const [selEffect,setSelEffect]   = useState<VoiceEffect>(VOICE_EFFECTS[0]);
  const [voiceVol,setVoiceVol]     = useState(1.0);
  const [beatVol,setBeatVol]       = useState(0.7);
  const [search,setSearch]         = useState('');
  const [genre,setGenre]           = useState('all');
  const [customBeat,setCustomBeat] = useState<{uri:string;name:string}|null>(null);
  const [loadingId,setLoadingId]   = useState<string|null>(null);
  const [autoTune,setAutoTune]     = useState(false);
  const [atPrev,setAtPrev]         = useState(false);
  const [playingMix,setPlayingMix] = useState(false);
  const [effCat,setEffCat]         = useState('all');
  const [showInfo,setShowInfo]     = useState<string|null>(null);

  const recRef  = useRef<Audio.Recording|null>(null);
  const voiceSnd= useRef<Audio.Sound|null>(null);
  const beatSnd = useRef<Audio.Sound|null>(null);
  const atSnd   = useRef<Audio.Sound|null>(null);
  const mixVSnd = useRef<Audio.Sound|null>(null);
  const mixBSnd = useRef<Audio.Sound|null>(null);
  const timerRef= useRef<ReturnType<typeof setInterval>|null>(null);

  useEffect(()=>{ if(!visible) stopAll(); return()=>{ stopAll(); if(timerRef.current) clearInterval(timerRef.current); }; },[visible]);

  const stopAll=async()=>{
    for(const sRef of [voiceSnd,beatSnd,atSnd,mixVSnd,mixBSnd]){
      try{ if(sRef.current){ await sRef.current.unloadAsync(); sRef.current=null; } }catch{}
    }
    setPlayVoice(false); setPlayBeat(false); setAtPrev(false); setPlayingMix(false);
  };
  const fmt=(s:number)=>Math.floor(s/60).toString().padStart(2,'0')+':'+(s%60).toString().padStart(2,'0');

  const startRec=async()=>{
    try{
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({allowsRecordingIOS:true,playsInSilentModeIOS:true});
      const{recording}=await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recRef.current=recording; setRecActive(true); setRecDur(0);
      timerRef.current=setInterval(()=>setRecDur(d=>d+1),1000);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }catch(e:any){ Alert.alert('Error','Could not start recording: '+e.message); }
  };
  const stopRec=async()=>{
    if(!recRef.current)return;
    try{
      await recRef.current.stopAndUnloadAsync();
      const uri=recRef.current.getURI(); recRef.current=null; setRecActive(false);
      if(timerRef.current){ clearInterval(timerRef.current); timerRef.current=null; }
      if(uri){ setVoiceUri(uri); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); Alert.alert('✅ Recorded!','Voice ready. Go to Effects tab to add pitch effects.'); }
    }catch(e:any){ Alert.alert('Error',e.message); }
  };
  const pickVoice=async()=>{
    try{
      const r=await DocumentPicker.getDocumentAsync({type:'audio/*',copyToCacheDirectory:true});
      if(!r.canceled&&r.assets[0]){ setVoiceUri(r.assets[0].uri); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
    }catch{ Alert.alert('Error','Could not pick audio'); }
  };
  const toggleVoice=async()=>{
    if(!voiceUri)return;
    if(playVoice){ try{await voiceSnd.current?.pauseAsync();}catch{} setPlayVoice(false); return; }
    try{
      if(voiceSnd.current){ try{await voiceSnd.current.unloadAsync();}catch{} voiceSnd.current=null; }
      await Audio.setAudioModeAsync({allowsRecordingIOS:false,playsInSilentModeIOS:true});
      const isRev=selEffect.cloudinaryReverse===true;
      const rate=isRev?1.0:Math.abs(selEffect.rate);
      const vol=selEffect.cloudinaryVolume?Math.min((selEffect.cloudinaryVolume/100)*voiceVol,1.0):selEffect.previewVolume*voiceVol;
      const{sound}=await Audio.Sound.createAsync({uri:voiceUri},{shouldPlay:true,volume:Math.min(vol,1.0),rate,shouldCorrectPitch:selEffect.id!=='none',pitchCorrectionQuality:Audio.PitchCorrectionQuality.High});
      voiceSnd.current=sound; setPlayVoice(true);
      sound.setOnPlaybackStatusUpdate(st=>{ if((st as any).didJustFinish) setPlayVoice(false); });
      if(isRev) Alert.alert('⏪ Reverse Effect','Reverse is applied by Cloudinary after upload. This preview plays your original voice.');
    }catch(e:any){ Alert.alert('Playback Error',e.message); }
  };
  const toggleAtPreview=async()=>{
    if(!voiceUri){ Alert.alert('No Voice','Record or pick a voice first.'); return; }
    if(atPrev){
      try{await atSnd.current?.stopAsync();}catch{}
      try{await atSnd.current?.unloadAsync();}catch{}
      atSnd.current=null; setAtPrev(false); return;
    }
    try{await voiceSnd.current?.stopAsync();}catch{} setPlayVoice(false); setAtPrev(true);
    try{
      await Audio.setAudioModeAsync({allowsRecordingIOS:false,playsInSilentModeIOS:true});
      const{sound}=await Audio.Sound.createAsync({uri:voiceUri},{shouldPlay:true,volume:voiceVol,rate:1.02,shouldCorrectPitch:true,pitchCorrectionQuality:Audio.PitchCorrectionQuality.High});
      atSnd.current=sound;
      sound.setOnPlaybackStatusUpdate(st=>{ if((st as any).didJustFinish||(st as any).error){ setAtPrev(false); atSnd.current=null; } });
    }catch(e:any){ setAtPrev(false); Alert.alert('Preview Error',e?.message||'Could not preview Auto-Tune'); }
  };
  const toggleBeat=async(beat:typeof STUDIO_BEATS[0]|null,cUri?:string)=>{
    const uri=cUri||beat?.url; if(!uri)return;
    if(playBeat&&selBeat?.id===beat?.id){ try{await beatSnd.current?.pauseAsync();}catch{} setPlayBeat(false); return; }
    setLoadingId(beat?.id||'custom');
    try{
      if(beatSnd.current){ try{await beatSnd.current.unloadAsync();}catch{} beatSnd.current=null; }
      await Audio.setAudioModeAsync({allowsRecordingIOS:false,playsInSilentModeIOS:true,staysActiveInBackground:false});
      const{sound}=await Audio.Sound.createAsync({uri},{shouldPlay:true,isLooping:true,volume:beatVol},undefined,true);
      beatSnd.current=sound; setPlayBeat(true);
      if(beat) setSelBeat(beat);
      sound.setOnPlaybackStatusUpdate(st=>{ if((st as any).error) setPlayBeat(false); });
    }catch{ Alert.alert('Beat Error','Could not load this beat. Try another.'); }
    finally{ setLoadingId(null); }
  };
  const previewMix=async()=>{
    const beatUri=customBeat?.uri||selBeat?.url;
    if(!voiceUri&&!beatUri){ Alert.alert('Nothing to preview','Record a voice and/or pick a beat first.'); return; }
    if(playingMix){
      try{await mixVSnd.current?.stopAsync();await mixVSnd.current?.unloadAsync();}catch{}
      try{await mixBSnd.current?.stopAsync();await mixBSnd.current?.unloadAsync();}catch{}
      mixVSnd.current=null; mixBSnd.current=null; setPlayingMix(false); return;
    }
    try{await voiceSnd.current?.stopAsync();}catch{} try{await beatSnd.current?.stopAsync();}catch{}
    setPlayVoice(false); setPlayBeat(false); setAtPrev(false); setPlayingMix(true);
    try{
      await Audio.setAudioModeAsync({allowsRecordingIOS:false,playsInSilentModeIOS:true,staysActiveInBackground:false,shouldDuckAndroid:false});
      const rate=selEffect.id!=='none'?Math.abs(selEffect.rate):1.0;
      const vol=selEffect.cloudinaryVolume?Math.min((selEffect.cloudinaryVolume/100)*voiceVol,1.0):selEffect.previewVolume*voiceVol;
      if(voiceUri&&voiceVol>0){
        const{sound:vs}=await Audio.Sound.createAsync({uri:voiceUri},{shouldPlay:true,volume:Math.min(vol,1.0),rate,shouldCorrectPitch:autoTune||selEffect.id!=='none',pitchCorrectionQuality:Audio.PitchCorrectionQuality.High});
        mixVSnd.current=vs;
        vs.setOnPlaybackStatusUpdate(st=>{
          if((st as any).didJustFinish){
            try{mixBSnd.current?.stopAsync();mixBSnd.current?.unloadAsync();}catch{}
            mixBSnd.current=null; mixVSnd.current=null; setPlayingMix(false);
          }
        });
      }
      if(beatUri&&beatVol>0){
        const{sound:bs}=await Audio.Sound.createAsync({uri:beatUri},{shouldPlay:true,isLooping:true,volume:beatVol},undefined,true);
        mixBSnd.current=bs;
      }
      if(!voiceUri) setTimeout(async()=>{
        try{await mixBSnd.current?.stopAsync();await mixBSnd.current?.unloadAsync();}catch{}
        mixBSnd.current=null; setPlayingMix(false);
      },30000);
    }catch(e:any){
      setPlayingMix(false);
      try{await mixVSnd.current?.unloadAsync();}catch{}
      try{await mixBSnd.current?.unloadAsync();}catch{}
      mixVSnd.current=null; mixBSnd.current=null;
      Alert.alert('Mix Preview Error',e?.message||'Could not preview mix.');
    }
  };
  const pickBeat=async()=>{
    try{
      const r=await DocumentPicker.getDocumentAsync({type:'audio/*',copyToCacheDirectory:true});
      if(!r.canceled&&r.assets[0]){
        const name=r.assets[0].name?.replace(/\.[^.]+$/,'')||'Custom Beat';
        setCustomBeat({uri:r.assets[0].uri,name}); setSelBeat(null);
        await toggleBeat(null,r.assets[0].uri);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    }catch{ Alert.alert('Error','Could not pick beat'); }
  };

  const filtered=STUDIO_BEATS.filter(b=>(genre==='all'||b.genre===genre)&&(!search||b.name.toLowerCase().includes(search.toLowerCase())));
  const canDone=!!(voiceUri||selBeat||customBeat);
  const done=async()=>{
    await stopAll();
    onDone({voiceUri,beatUri:customBeat?.uri||selBeat?.url||null,beatName:customBeat?.name||selBeat?.name||null,
      beatArtist:selBeat?.artist||(customBeat?'Custom Beat':null),voiceVolume:voiceVol,beatVolume:beatVol,
      effectName:selEffect.id!=='none'?selEffect.name:null,effectId:selEffect.id!=='none'?selEffect.id:null,
      effectReverb:selEffect.reverb,effectEcho:selEffect.echo,effectChorus:selEffect.chorus,
      duration:recDur,autoTuneEnabled:autoTune});
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={at.c}>
        <View style={at.hdr}>
          <TouchableOpacity onPress={onClose} style={at.closeBtn}><Feather name="x" size={22} color="#fff"/></TouchableOpacity>
          <View style={{alignItems:'center'}}><Text style={at.hTitle}>🎙️ Audio Studio</Text><Text style={at.hSub}>Voice & beat mixer</Text></View>
          <TouchableOpacity style={[at.doneBtn,!canDone&&at.doneBtnOff]} onPress={done} disabled={!canDone}><Text style={at.doneTxt}>Done</Text></TouchableOpacity>
        </View>
        <View style={at.sBar}>
          {[{icon:'mic',val:voiceUri,label:voiceUri?'✓ Voice':'No voice',color:'#00ff88'},{icon:'music',val:selBeat||customBeat,label:customBeat?.name||selBeat?.name||'No beat',color:'#ffd700'},{icon:'zap',val:selEffect.id!=='none',label:selEffect.id!=='none'?selEffect.name:'No effect',color:'#aa00ff'}].map((it,i)=>(
            <React.Fragment key={i}>
              <View style={at.sItem}><Feather name={it.icon as any} size={12} color={it.val?it.color:'#444'}/><Text style={[at.sTxt,{color:it.val?it.color:'#444'}]} numberOfLines={1}>{it.label}</Text></View>
              {i<2&&<View style={at.sDot}/>}
            </React.Fragment>
          ))}
        </View>
        <View style={at.tabs}>
          {(['record','beats','effects','mix'] as StudioTab[]).map(t=>(
            <TouchableOpacity key={t} style={[at.tab,tab===t&&at.tabOn]} onPress={()=>setTab(t)}>
              <Text style={at.tabEmoji}>{t==='record'?'🎙️':t==='beats'?'🎵':t==='effects'?'⚡':'🎚️'}</Text>
              <Text style={[at.tabLbl,tab===t&&at.tabLblOn]}>{t.charAt(0).toUpperCase()+t.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <ScrollView style={{flex:1}} showsVerticalScrollIndicator={false}>
          {tab==='record'&&(
            <View style={at.tc}>
              <Text style={at.st}>🎙️ Voice Recording</Text>
              <View style={at.waveBox}>
                <StudioWave active={recActive||playVoice}/>
                {recActive&&<View style={at.recBadge}><View style={at.recDot}/><Text style={at.recTxt}>{fmt(recDur)}</Text></View>}
              </View>
              <View style={at.recRow}>
                <TouchableOpacity style={[at.recBtn,recActive&&at.recBtnOn]} onPress={recActive?stopRec:startRec}>
                  <LinearGradient colors={recActive?['#ff4444','#cc0000']:['#00ff88','#00cc6a']} style={at.recInner}>
                    <Feather name={recActive?'square':'mic'} size={28} color="#000"/>
                    <Text style={at.recLbl}>{recActive?'Stop':'Record'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
                {voiceUri&&<TouchableOpacity style={at.pvBtn} onPress={toggleVoice}><Feather name={playVoice?'pause':'play'} size={20} color="#00ff88"/><Text style={at.pvTxt}>{playVoice?'Stop':'Preview'}</Text></TouchableOpacity>}
              </View>
              {voiceUri&&(
                <View style={at.vReady}>
                  <Feather name="check-circle" size={15} color="#00ff88"/>
                  <Text style={at.vReadyTxt}>Voice ready · {fmt(recDur)}</Text>
                  <TouchableOpacity onPress={()=>{setVoiceUri(null);setRecDur(0);}}><Feather name="trash-2" size={14} color="#ff4444"/></TouchableOpacity>
                </View>
              )}
              <View style={at.orRow}><Text style={at.orTxt}>OR</Text></View>
              <TouchableOpacity style={at.pickBtn} onPress={pickVoice}>
                <Feather name="folder" size={17} color="#00ff88"/>
                <View style={{flex:1,marginLeft:10}}><Text style={at.pickTxt}>Pick Voice from Device</Text><Text style={at.pickSub}>MP3, M4A, AAC, WAV supported</Text></View>
                <Feather name="chevron-right" size={15} color="#666"/>
              </TouchableOpacity>
              <View style={at.tip}><Text style={at.tipTxt}>💡 Record in a quiet room. Go to Effects tab to add Cloudinary pitch effects.</Text></View>
              <View style={at.atCard}>
                <LinearGradient colors={autoTune?['#1a0a00','#2a1200']:['#0d0d0d','#141414']} style={at.atGrad}>
                  <View style={at.atHdr}>
                    <LinearGradient colors={autoTune?['#ffd700','#ff8800']:['#2a2a2a','#333']} style={at.atIcon}><Text style={{fontSize:20}}>🎵</Text></LinearGradient>
                    <View style={{flex:1,marginLeft:12}}><Text style={at.atTitle}>Studio Auto-Tune</Text><Text style={at.atSub}>Pitch-perfect voice</Text></View>
                    <Switch value={autoTune} onValueChange={v=>{setAutoTune(v);Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);if(!v&&atPrev)toggleAtPreview();}} trackColor={{false:'#2a2a2a',true:'#ffd70055'}} thumbColor={autoTune?'#ffd700':'#555'}/>
                  </View>
                  <View style={at.atPills}>
                    {['Pitch Lock','Smooth Tone','Studio Quality','No Wobble'].map(f=>(
                      <View key={f} style={[at.atPill,autoTune&&at.atPillOn]}><Text style={[at.atPillTxt,autoTune&&{color:'#ffd700'}]}>{f}</Text></View>
                    ))}
                  </View>
                  {autoTune&&(
                    <>
                      <View style={at.atActive}><View style={at.atActiveDot}/><Text style={at.atActiveTxt}>🎵 Auto-Tune ON — pitch correction active</Text></View>
                      <TouchableOpacity style={[at.atPrevBtn,atPrev&&at.atPrevBtnOn]} onPress={toggleAtPreview} disabled={!voiceUri}>
                        <Feather name={atPrev?'pause':'play'} size={15} color={atPrev?'#000':'#ffd700'}/>
                        <Text style={[at.atPrevTxt,atPrev&&{color:'#000'}]}>{atPrev?'Stop Auto-Tune Preview':'▶ Preview Auto-Tune'}</Text>
                      </TouchableOpacity>
                      {!voiceUri&&<Text style={at.atNoVoice}>Record a voice first to preview</Text>}
                    </>
                  )}
                </LinearGradient>
              </View>
            </View>
          )}
          {tab==='beats'&&(
            <View style={at.tc}>
              <Text style={at.st}>🎵 Beat Library</Text>
              <TouchableOpacity style={at.custBtn} onPress={pickBeat}>
                <LinearGradient colors={['#1a0035','#0d001a']} style={at.custInner}>
                  <Feather name="upload" size={18} color="#aa00ff"/>
                  <View style={{flex:1,marginLeft:10}}><Text style={at.custTitle}>📁 Use My Own Beat</Text><Text style={at.custSub}>Pick MP3, M4A or WAV from device</Text></View>
                  {customBeat&&<Feather name="check-circle" size={16} color="#00ff88"/>}
                </LinearGradient>
              </TouchableOpacity>
              {customBeat&&(
                <View style={[at.beatItem,at.beatItemOn]}>
                  <View style={[at.beatPlay,at.beatPlayOn]}><Feather name="music" size={14} color="#000"/></View>
                  <View style={{flex:1}}><Text style={at.beatName}>{customBeat.name}</Text><Text style={at.beatMeta}>Your custom beat</Text></View>
                  <TouchableOpacity onPress={()=>setCustomBeat(null)}><Feather name="x" size={14} color="#ff4444"/></TouchableOpacity>
                </View>
              )}
              <View style={at.srchBox}>
                <Feather name="search" size={14} color="#666"/>
                <TextInput style={at.srchInput} value={search} onChangeText={setSearch} placeholder="Search beats..." placeholderTextColor="#555"/>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:10}} contentContainerStyle={{gap:6}}>
                {STUDIO_GENRES.map(g=>(
                  <TouchableOpacity key={g.id} style={[at.gPill,genre===g.id&&at.gPillOn]} onPress={()=>setGenre(g.id)}>
                    <Text style={{fontSize:10}}>{g.emoji}</Text>
                    <Text style={[at.gName,genre===g.id&&{color:'#00ff88'}]}>{g.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={at.beatCnt}>{filtered.length} beats</Text>
              {filtered.map(beat=>{
                const isAct=selBeat?.id===beat.id&&playBeat;
                const isLd=loadingId===beat.id;
                return (
                  <TouchableOpacity key={beat.id} style={[at.beatItem,selBeat?.id===beat.id&&at.beatItemOn]} onPress={()=>toggleBeat(beat)}>
                    <View style={[at.beatPlay,selBeat?.id===beat.id&&at.beatPlayOn]}>
                      {isLd?<ActivityIndicator size="small" color={selBeat?.id===beat.id?'#000':'#00ff88'}/>:<Feather name={isAct?'pause':'play'} size={12} color={selBeat?.id===beat.id?'#000':'#00ff88'}/>}
                    </View>
                    <View style={{flex:1}}><Text style={at.beatName}>{beat.mood} {beat.name}</Text><Text style={at.beatMeta}>{beat.artist} · {beat.bpm} BPM</Text></View>
                    {selBeat?.id===beat.id&&<Feather name="check" size={14} color="#00ff88"/>}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {tab==='effects'&&(
            <View style={at.tc}>
              <Text style={at.st}>⚡ Voice Effects</Text>
              <View style={{backgroundColor:'#0a1a0a',borderRadius:10,padding:12,marginBottom:14,borderWidth:1,borderColor:'#00ff8833'}}>
                <Text style={{color:'#00ff88',fontSize:12,fontWeight:'700',marginBottom:4}}>☁️ Powered by Cloudinary</Text>
                <Text style={{color:'#888',fontSize:11,lineHeight:16}}>Effects are applied after upload. Preview approximates the saved result.</Text>
              </View>
              {showInfo&&(()=>{
                const eff=VOICE_EFFECTS.find(e=>e.id===showInfo); if(!eff)return null;
                return (
                  <View style={at.infoBox}>
                    <View style={{flexDirection:'row',alignItems:'center',marginBottom:8,gap:8}}>
                      <Text style={{fontSize:24}}>{eff.emoji}</Text>
                      <Text style={{color:'#fff',fontSize:16,fontWeight:'800',flex:1}}>{eff.name}</Text>
                      <TouchableOpacity onPress={()=>setShowInfo(null)}><Feather name="x" size={18} color="#666"/></TouchableOpacity>
                    </View>
                    <Text style={{color:'#00ff88',fontSize:11,fontWeight:'700',marginBottom:6,textTransform:'uppercase'}}>{eff.desc}</Text>
                    <Text style={{color:'#bbb',fontSize:13,lineHeight:20}}>{eff.explain}</Text>
                    <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:10}}>
                      {eff.cloudinaryPitch&&eff.cloudinaryPitch!==0&&<View style={at.effTag}><Text style={at.effTagTxt}>🎚️ Pitch {eff.cloudinaryPitch>0?'+':''}{eff.cloudinaryPitch}</Text></View>}
                      {eff.cloudinaryVolume&&eff.cloudinaryVolume!==100&&<View style={at.effTag}><Text style={at.effTagTxt}>🔊 Vol {eff.cloudinaryVolume}%</Text></View>}
                      {eff.cloudinaryReverse&&<View style={at.effTag}><Text style={at.effTagTxt}>⏪ Reverse (cloud only)</Text></View>}
                    </View>
                  </View>
                );
              })()}
              {!voiceUri&&<View style={at.warn}><Feather name="alert-circle" size={15} color="#ffd700"/><Text style={at.warnTxt}>Record or pick a voice first to preview effects</Text></View>}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:6,paddingBottom:10}}>
                {EFFECT_CATEGORIES.map(cat=>(
                  <TouchableOpacity key={cat.id} style={[at.effCat,effCat===cat.id&&at.effCatOn]} onPress={()=>setEffCat(cat.id)}>
                    <Text style={{fontSize:11}}>{cat.emoji}</Text>
                    <Text style={[at.effCatTxt,effCat===cat.id&&{color:'#aa00ff'}]}>{cat.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={at.effGrid}>
                {VOICE_EFFECTS.filter(e=>effCat==='all'||e.category===effCat).map(eff=>{
                  const on=selEffect.id===eff.id;
                  const hasCloud=!!(eff.cloudinaryPitch||eff.cloudinaryVolume||eff.cloudinaryReverse);
                  return (
                    <View key={eff.id} style={[at.effCard,on&&at.effCardOn]}>
                      <TouchableOpacity style={{flex:1,alignItems:'center'}} onPress={()=>{setSelEffect(eff);Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);}}>
                        <Text style={at.effEmoji}>{eff.emoji}</Text>
                        <Text style={[at.effName,on&&{color:'#aa00ff'}]}>{eff.name}</Text>
                        <Text style={at.effDesc} numberOfLines={1}>{eff.desc}</Text>
                        {hasCloud&&<Text style={{fontSize:7,color:on?'#00ff88':'#555',fontWeight:'700',marginTop:3}}>☁️ CLOUD</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity style={at.effInfoBtn} onPress={()=>setShowInfo(showInfo===eff.id?null:eff.id)}><Text style={{fontSize:9,color:'#555'}}>ℹ️</Text></TouchableOpacity>
                      {on&&<View style={at.effCheck}><Feather name="check" size={8} color="#000"/></View>}
                    </View>
                  );
                })}
              </View>
              {selEffect.id!=='none'&&(
                <View style={at.effSum}><Text style={at.effSumTitle}>✅ Selected: {selEffect.emoji} {selEffect.name}</Text><Text style={at.effSumDesc}>{selEffect.explain}</Text></View>
              )}
              {voiceUri&&(
                <TouchableOpacity style={[at.prevEff,selEffect.id!=='none'&&{backgroundColor:'#1a0035',borderColor:'#aa00ff',borderWidth:1}]} onPress={toggleVoice}>
                  <Feather name={playVoice?'pause':'play'} size={15} color={selEffect.id!=='none'?'#aa00ff':'#fff'}/>
                  <Text style={[at.prevEffTxt,selEffect.id!=='none'&&{color:'#aa00ff'}]}>{playVoice?'Stop Preview':selEffect.id!=='none'?`▶ Preview: ${selEffect.name}`:'▶ Preview Original Voice'}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {tab==='mix'&&(
            <View style={at.tc}>
              <Text style={at.st}>🎚️ Audio Mix</Text>
              <View style={at.mixSec}>
                <View style={at.mixRow}><Text style={at.mxE}>🎙️</Text><Text style={at.mxL}>Voice Volume</Text><Text style={[at.mxP,{color:'#00ff88'}]}>{Math.round(voiceVol*100)}%</Text></View>
                <StudioSlider value={voiceVol} onChange={setVoiceVol} color="#00ff88"/>
              </View>
              <View style={at.mixSec}>
                <View style={at.mixRow}><Text style={at.mxE}>🎵</Text><Text style={at.mxL}>Beat Volume</Text><Text style={[at.mxP,{color:'#ffd700'}]}>{Math.round(beatVol*100)}%</Text></View>
                <StudioSlider value={beatVol} onChange={async(v)=>{setBeatVol(v);if(beatSnd.current){try{await beatSnd.current.setVolumeAsync(v);}catch{}}}} color="#ffd700"/>
              </View>
              <Text style={[at.st,{marginTop:12}]}>Quick Presets</Text>
              <View style={at.presets}>
                {[{l:'🎤 Voice Only',vv:1.0,bv:0.0},{l:'🎵 Beat Only',vv:0.0,bv:1.0},{l:'⚡ TikTok Mix',vv:0.8,bv:0.6},{l:'🎙️ Podcast',vv:1.0,bv:0.2},{l:'🌙 Soft Mix',vv:0.7,bv:0.4},{l:'🔥 Club Mix',vv:0.6,bv:1.0}].map((p,i)=>(
                  <TouchableOpacity key={i} style={at.preBtn} onPress={()=>{setVoiceVol(p.vv);setBeatVol(p.bv);Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);}}>
                    <Text style={at.preBtnTxt}>{p.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={at.mixSum}>
                <Text style={at.mixSumT}>Mix Summary</Text>
                <Text style={at.mixSumI}>🎙️ {voiceUri?`Ready · ${selEffect.name}`:'Not set'}</Text>
                <Text style={at.mixSumI}>🎵 {customBeat?.name||selBeat?.name||'No beat selected'}</Text>
                <Text style={at.mixSumI}>🎚️ {Math.round(voiceVol*100)}% voice / {Math.round(beatVol*100)}% beat</Text>
                <Text style={[at.mixSumI,autoTune&&{color:'#ffd700',fontWeight:'700'}]}>🎵 Auto-Tune: {autoTune?'ON ✓':'Off'}</Text>
              </View>
              <TouchableOpacity style={[at.mixPrevBtn,playingMix&&at.mixPrevBtnOn]} onPress={previewMix}>
                <Feather name={playingMix?'pause-circle':'play-circle'} size={20} color={playingMix?'#000':'#00ff88'}/>
                <Text style={[at.mixPrevTxt,playingMix&&{color:'#000'}]}>{playingMix?'⏹ Stop Mix Preview':'▶ Preview Mix (Voice + Beat)'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[at.fdBtn,!canDone&&at.doneBtnOff]} onPress={done} disabled={!canDone}>
                <LinearGradient colors={['#00ff88','#00cc6a']} style={at.fdInner}>
                  <Feather name="check-circle" size={17} color="#000"/>
                  <Text style={at.fdTxt}>Done — Add to Post</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const at=StyleSheet.create({
  c:{flex:1,backgroundColor:'#000'},
  hdr:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:16,paddingBottom:12,backgroundColor:'#0a0a0a',borderBottomWidth:1,borderBottomColor:'#1a1a1a'},
  closeBtn:{width:36,height:36,borderRadius:18,backgroundColor:'#1a1a1a',alignItems:'center',justifyContent:'center'},
  hTitle:{color:'#fff',fontSize:17,fontWeight:'800'}, hSub:{color:'#666',fontSize:10,marginTop:2},
  doneBtn:{backgroundColor:'#00ff88',paddingHorizontal:15,paddingVertical:7,borderRadius:16},
  doneBtnOff:{backgroundColor:'#333',opacity:0.5}, doneTxt:{color:'#000',fontWeight:'700',fontSize:13},
  sBar:{flexDirection:'row',alignItems:'center',justifyContent:'center',paddingVertical:8,backgroundColor:'#0d0d0d',gap:6},
  sItem:{flexDirection:'row',alignItems:'center',gap:4,flex:1,justifyContent:'center'},
  sTxt:{fontSize:10,fontWeight:'600'}, sDot:{width:3,height:3,borderRadius:2,backgroundColor:'#333'},
  tabs:{flexDirection:'row',backgroundColor:'#111',borderBottomWidth:1,borderBottomColor:'#1a1a1a'},
  tab:{flex:1,alignItems:'center',paddingVertical:10,gap:2}, tabOn:{borderBottomWidth:2,borderBottomColor:'#00ff88'},
  tabEmoji:{fontSize:15}, tabLbl:{color:'#666',fontSize:10,fontWeight:'600'}, tabLblOn:{color:'#00ff88'},
  tc:{padding:14}, st:{color:'#fff',fontSize:14,fontWeight:'700',marginBottom:12},
  waveBox:{backgroundColor:'#111',borderRadius:12,padding:10,marginBottom:12,borderWidth:1,borderColor:'#222',position:'relative',overflow:'hidden'},
  recBadge:{position:'absolute',top:8,right:10,flexDirection:'row',alignItems:'center',backgroundColor:'rgba(255,68,68,0.9)',borderRadius:10,paddingHorizontal:8,paddingVertical:3,gap:4},
  recDot:{width:6,height:6,borderRadius:3,backgroundColor:'#fff'}, recTxt:{color:'#fff',fontSize:11,fontWeight:'700'},
  recRow:{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:14,marginBottom:12},
  recBtn:{width:80,height:80,borderRadius:40,overflow:'hidden'}, recBtnOn:{borderWidth:2,borderColor:'#ff4444'},
  recInner:{flex:1,alignItems:'center',justifyContent:'center',gap:3}, recLbl:{color:'#000',fontSize:11,fontWeight:'700'},
  pvBtn:{backgroundColor:'#111',borderRadius:10,paddingHorizontal:14,paddingVertical:11,alignItems:'center',gap:4,borderWidth:1,borderColor:'#00ff8844'},
  pvTxt:{color:'#00ff88',fontSize:11,fontWeight:'600'},
  vReady:{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#001a0a',borderRadius:10,padding:11,borderWidth:1,borderColor:'#00ff8833',marginBottom:12},
  vReadyTxt:{color:'#00ff88',fontSize:12,fontWeight:'600',flex:1},
  orRow:{alignItems:'center',marginVertical:10}, orTxt:{color:'#444',fontSize:11,fontWeight:'600'},
  pickBtn:{flexDirection:'row',alignItems:'center',backgroundColor:'#111',borderRadius:10,padding:13,borderWidth:1,borderColor:'#00ff8833',marginBottom:12},
  pickTxt:{color:'#fff',fontSize:13,fontWeight:'600'}, pickSub:{color:'#666',fontSize:10,marginTop:2},
  tip:{backgroundColor:'#0d0d0d',borderRadius:8,padding:11,borderWidth:1,borderColor:'#1a1a1a',marginTop:8},
  tipTxt:{color:'#666',fontSize:11,lineHeight:16},
  custBtn:{marginBottom:11,borderRadius:11,overflow:'hidden',borderWidth:1,borderColor:'#aa00ff55'},
  custInner:{flexDirection:'row',alignItems:'center',padding:13},
  custTitle:{color:'#aa00ff',fontSize:13,fontWeight:'700'}, custSub:{color:'#666',fontSize:10,marginTop:2},
  srchBox:{flexDirection:'row',alignItems:'center',backgroundColor:'#111',borderRadius:8,paddingHorizontal:10,marginBottom:9,borderWidth:1,borderColor:'#222',gap:6},
  srchInput:{flex:1,color:'#fff',fontSize:13,paddingVertical:8},
  gPill:{flexDirection:'row',alignItems:'center',backgroundColor:'#111',borderRadius:14,paddingHorizontal:9,paddingVertical:5,gap:4,borderWidth:1,borderColor:'#222'},
  gPillOn:{backgroundColor:'#00ff8822',borderColor:'#00ff88'}, gName:{color:'#888',fontSize:10,fontWeight:'600'},
  beatCnt:{color:'#555',fontSize:10,marginBottom:7},
  beatItem:{flexDirection:'row',alignItems:'center',backgroundColor:'#111',borderRadius:10,padding:10,marginBottom:6,borderWidth:1,borderColor:'#1a1a1a',gap:9},
  beatItemOn:{backgroundColor:'#001a0a',borderColor:'#00ff88'},
  beatPlay:{width:28,height:28,borderRadius:14,backgroundColor:'#1a1a1a',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#00ff8844'},
  beatPlayOn:{backgroundColor:'#00ff88',borderColor:'#00ff88'},
  beatName:{color:'#fff',fontSize:12,fontWeight:'600'}, beatMeta:{color:'#666',fontSize:10,marginTop:1},
  warn:{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#1a1200',borderRadius:8,padding:11,marginBottom:12,borderWidth:1,borderColor:'#ffd70033'},
  warnTxt:{color:'#ffd700',fontSize:12,flex:1},
  effGrid:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:12},
  effCard:{width:(SW-48)/3,backgroundColor:'#111',borderRadius:11,padding:10,alignItems:'center',borderWidth:1,borderColor:'#222',position:'relative'},
  effCardOn:{backgroundColor:'#0d002a',borderColor:'#aa00ff'},
  effEmoji:{fontSize:20,marginBottom:4}, effName:{color:'#fff',fontSize:10,fontWeight:'700',textAlign:'center'},
  effDesc:{color:'#555',fontSize:8,textAlign:'center',marginTop:2},
  effCheck:{position:'absolute',top:4,right:4,width:15,height:15,borderRadius:8,backgroundColor:'#aa00ff',alignItems:'center',justifyContent:'center'},
  effCat:{flexDirection:'row',alignItems:'center',gap:4,backgroundColor:'#111',borderRadius:14,paddingHorizontal:10,paddingVertical:5,borderWidth:1,borderColor:'#222'},
  effCatOn:{backgroundColor:'#1a0035',borderColor:'#aa00ff'}, effCatTxt:{color:'#888',fontSize:10,fontWeight:'600'},
  infoBox:{backgroundColor:'#0d0d2e',borderRadius:14,padding:14,marginBottom:12,borderWidth:1.5,borderColor:'#aa00ff55'},
  effInfoBtn:{position:'absolute',bottom:4,left:4,width:16,height:16,alignItems:'center',justifyContent:'center'},
  effTag:{backgroundColor:'#1a1a2e',borderRadius:8,paddingHorizontal:8,paddingVertical:3,borderWidth:1,borderColor:'#333'},
  effTagTxt:{color:'#aaa',fontSize:10,fontWeight:'600'},
  effSum:{backgroundColor:'#0d0d0d',borderRadius:12,padding:14,marginBottom:12,borderWidth:1,borderColor:'#aa00ff33'},
  effSumTitle:{color:'#fff',fontSize:13,fontWeight:'700',marginBottom:6}, effSumDesc:{color:'#999',fontSize:12,lineHeight:18},
  prevEff:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'#aa00ff',borderRadius:10,padding:12,marginBottom:12},
  prevEffTxt:{color:'#fff',fontWeight:'700',fontSize:13},
  mixSec:{backgroundColor:'#111',borderRadius:11,padding:13,marginBottom:9,borderWidth:1,borderColor:'#1a1a1a'},
  mixRow:{flexDirection:'row',alignItems:'center',gap:6,marginBottom:2},
  mxE:{fontSize:15}, mxL:{flex:1,color:'#ccc',fontSize:13,fontWeight:'600'}, mxP:{fontSize:13,fontWeight:'700'},
  presets:{flexDirection:'row',flexWrap:'wrap',gap:6,marginBottom:12},
  preBtn:{backgroundColor:'#111',borderRadius:8,paddingHorizontal:11,paddingVertical:7,borderWidth:1,borderColor:'#222'},
  preBtnTxt:{color:'#fff',fontSize:11,fontWeight:'600'},
  mixSum:{backgroundColor:'#0d0d0d',borderRadius:11,padding:13,marginBottom:10,borderWidth:1,borderColor:'#1a1a1a'},
  mixSumT:{color:'#fff',fontSize:13,fontWeight:'700',marginBottom:7}, mixSumI:{color:'#888',fontSize:11,lineHeight:20},
  mixPrevBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'#001a0a',borderRadius:11,padding:14,borderWidth:1.5,borderColor:'#00ff88',marginBottom:10},
  mixPrevBtnOn:{backgroundColor:'#00ff88',borderColor:'#00ff88'}, mixPrevTxt:{color:'#00ff88',fontSize:14,fontWeight:'700'},
  fdBtn:{borderRadius:11,overflow:'hidden',marginBottom:20}, fdInner:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,padding:15},
  fdTxt:{color:'#000',fontSize:15,fontWeight:'800'},
  atCard:{marginTop:16,borderRadius:16,overflow:'hidden',borderWidth:1.5,borderColor:'#ffd70033'},
  atGrad:{padding:16}, atHdr:{flexDirection:'row',alignItems:'center',marginBottom:12},
  atIcon:{width:48,height:48,borderRadius:14,alignItems:'center',justifyContent:'center'},
  atTitle:{color:'#fff',fontSize:15,fontWeight:'800',marginBottom:2}, atSub:{color:'#888',fontSize:11},
  atPills:{flexDirection:'row',flexWrap:'wrap',gap:6,marginBottom:12},
  atPill:{backgroundColor:'#1a1a1a',borderRadius:20,paddingHorizontal:10,paddingVertical:4,borderWidth:1,borderColor:'#2a2a2a'},
  atPillOn:{backgroundColor:'#2a1800',borderColor:'#ffd70055'}, atPillTxt:{color:'#555',fontSize:10,fontWeight:'700'},
  atActive:{flexDirection:'row',alignItems:'center',gap:7,backgroundColor:'#1a1000',borderRadius:8,padding:10,marginBottom:12,borderWidth:1,borderColor:'#ffd70033'},
  atActiveDot:{width:8,height:8,borderRadius:4,backgroundColor:'#ffd700'}, atActiveTxt:{color:'#ffd700',fontSize:11,fontWeight:'600',flex:1},
  atPrevBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:'#1a1a1a',borderRadius:10,padding:13,borderWidth:1,borderColor:'#333'},
  atPrevBtnOn:{backgroundColor:'#ffd700',borderColor:'#ffd700'}, atPrevTxt:{color:'#fff',fontSize:13,fontWeight:'700'},
  atNoVoice:{color:'#444',fontSize:11,textAlign:'center',marginTop:4,fontStyle:'italic'},
});

// ══════════════════════════════════════════════════════════
// END OF PART 2 — continue with create_PART3.tsx
// ══════════════════════════════════════════════════════════ 
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// create_PART3.tsx \u2014 LumVibe v5 \u2014 CORRECTED \u2014 PART 3 of 3
// Paste this directly after the last line of PART 2
// Contains: CreatePostScreen (main export) + all styles
// \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

export default function CreatePostScreen() {
  const { user } = useAuthStore();

  const soundRef          = useRef<Audio.Sound|null>(null);
  const cameraRef         = useRef<CameraView|null>(null);
  const originalMediaRef  = useRef<string|null>(null);
  const recProgress       = useRef(new Animated.Value(0)).current;
  const wmX               = useRef(new Animated.Value(0)).current;
  const wmY               = useRef(new Animated.Value(0)).current;
  const wmOp              = useRef(new Animated.Value(0.9)).current;
  const wmAnimRef         = useRef<Animated.CompositeAnimation|null>(null);
  const wmTimeout         = useRef<ReturnType<typeof setTimeout>|null>(null);
  const recTimerRef       = useRef<ReturnType<typeof setInterval>|null>(null);
  const glitchOffset      = useRef(new Animated.Value(0)).current;
  const glitchAnimRef     = useRef<Animated.CompositeAnimation|null>(null);
  const postInProgress    = useRef(false);
  const appStateRef       = useRef<AppStateStatus>('active');
  const isRecordingRef    = useRef(false);
  const burstTimeoutRef   = useRef<ReturnType<typeof setTimeout>|null>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [facing,setCameraFacing]    = useState<'back'|'front'>('back');
  const [flash,setFlash]            = useState<'off'|'on'>('off');
  const [cameraMode,setCameraMode]  = useState<CameraMode>('photo');

  // Camera feature states
  const [cameraFeature,setCameraFeature]   = useState<CameraFeature>('normal');
  const [selectedAnimBg,setSelectedAnimBg] = useState('bg_none');
  const [showBgPanel,setShowBgPanel]       = useState(false);
  const [activeBurst,setActiveBurst]       = useState<string|null>(null);
  const [showBurstPanel,setShowBurstPanel] = useState(false);
  const [burstVisible,setBurstVisible]     = useState(false);
  const [burstEffect,setBurstEffect]       = useState<string|null>(null);
  const [dualCamEnabled,setDualCamEnabled] = useState(false);

  // Media
  const [selectedMedia,setSelectedMedia]           = useState<string|null>(null);
  const [mediaType,setMediaType]                   = useState<MediaType>(null);
  const [filter,setFilter]                         = useState('original');
  const [isProcessingFilter,setIsProcessingFilter] = useState(false);
  const [selectedSpeed,setSelectedSpeed]           = useState(SPEED_OPTIONS[2]);
  const [blurEnabled,setBlurEnabled]               = useState(false);
  const [selectedFx,setSelectedFx]                 = useState('fx_none');
  const [isProcessingFx,setIsProcessingFx]         = useState(false);
  const [fxCategory,setFxCategory]                 = useState('all');

  // AR \u2014 faceData always null (polling removed for performance)
  const [selectedAr,setSelectedAr]   = useState('ar_none');
  const faceData: FaceData|null      = null;
  const [showArPanel,setShowArPanel] = useState(false);

  // Upload
  const [uploadProgress,setUploadProgress] = useState(0);
  const [uploadStage,setUploadStage]       = useState('');
  const [uploading,setUploading]           = useState(false);

  const [selectedVibe,setSelectedVibe] = useState<string|null>(null);

  // Views / status
  const [screenView,setScreenView]             = useState<ScreenView>('camera');
  const [showStatusCreator,setShowStatusCreator] = useState(false);
  const [statusContent,setStatusContent]       = useState('');
  const [statusType,setStatusType]             = useState<'text'|'voice'>('text');
  const [statusBg,setStatusBg]                 = useState('purple');
  const [statusVoiceUri,setStatusVoiceUri]     = useState<string|null>(null);
  const [statusVoiceDur,setStatusVoiceDur]     = useState(0);

  // Compose
  const [showImportGuide,setShowImportGuide] = useState(false);
  const [isRecording,setIsRecording]         = useState(false);
  const [recDuration,setRecDuration]         = useState(0);
  const [caption,setCaption]                 = useState('');
  const [location,setLocation]               = useState<string|null>(null);
  const [locationCoords,setLocationCoords]   = useState<{latitude:number;longitude:number}|null>(null);
  const [loadingLoc,setLoadingLoc]           = useState(false);
  const [selectedMusic,setSelectedMusic]     = useState<string|null>(null);
  const [musicName,setMusicName]             = useState<string|null>(null);
  const [musicArtist,setMusicArtist]         = useState<string|null>(null);
  const [origVol,setOrigVol]                 = useState(1.0);
  const [musicVol,setMusicVol]               = useState(0.7);
  const [isScheduled,setIsScheduled]         = useState(false);
  const [scheduleDate,setScheduleDate]       = useState(new Date());
  const [showDatePicker,setShowDatePicker]   = useState(false);
  const [showTimePicker,setShowTimePicker]   = useState(false);
  const [addWatermark,setAddWatermark]       = useState(true);
  const [autoOptimize,setAutoOptimize]       = useState(true);
  const [userProfile,setUserProfile]         = useState<{username:string}|null>(null);
  const [savingDraft,setSavingDraft]         = useState(false);
  const [drafts,setDrafts]                   = useState<Draft[]>([]);
  const [showAudioStudio,setShowAudioStudio] = useState(false);
  const [voiceAutoTune,setVoiceAutoTune]     = useState(false);
  const [selVoiceEff,setSelVoiceEff]         = useState<VoiceEffect|null>(null);

  // Marketplace
  const [mktListingId,setMktListingId] = useState<string|null>(null);
  const [mktPrice,setMktPrice]         = useState<string|null>(null);
  const [mktTitle,setMktTitle]         = useState<string|null>(null);

  useEffect(()=>{ isRecordingRef.current=isRecording; },[isRecording]);

  const startGlitch=()=>{
    if(glitchAnimRef.current)return;
    const a=Animated.loop(Animated.sequence([
      Animated.timing(glitchOffset,{toValue:4,duration:80,useNativeDriver:true}),
      Animated.timing(glitchOffset,{toValue:-4,duration:80,useNativeDriver:true}),
      Animated.timing(glitchOffset,{toValue:2,duration:60,useNativeDriver:true}),
      Animated.timing(glitchOffset,{toValue:0,duration:500,useNativeDriver:true}),
    ]));
    glitchAnimRef.current=a; a.start();
  };
  const stopGlitch=()=>{ if(glitchAnimRef.current){glitchAnimRef.current.stop();glitchAnimRef.current=null;} glitchOffset.setValue(0); };

  const startWatermark=()=>{
    const pos=[{x:10,y:10},{x:SW-170,y:10},{x:10,y:310},{x:SW-170,y:310}];
    let idx=0;
    const animate=()=>{
      idx=(idx+1)%4;
      Animated.parallel([
        Animated.timing(wmOp,{toValue:0,duration:300,useNativeDriver:true}),
        Animated.timing(wmX,{toValue:pos[idx].x,duration:300,useNativeDriver:true}),
        Animated.timing(wmY,{toValue:pos[idx].y,duration:300,useNativeDriver:true}),
      ]).start(()=>{
        Animated.timing(wmOp,{toValue:0.9,duration:300,useNativeDriver:true})
          .start(()=>{ wmAnimRef.current=null; wmTimeout.current=setTimeout(animate,3500); });
      });
    };
    wmTimeout.current=setTimeout(animate,3500);
  };
  const stopWatermark=()=>{
    if(wmTimeout.current){clearTimeout(wmTimeout.current);wmTimeout.current=null;}
    if(wmAnimRef.current){wmAnimRef.current.stop();wmAnimRef.current=null;}
  };

  // Trigger effect burst \u2014 user taps button, no ML involved
  const triggerBurst=useCallback(()=>{
    if(!activeBurst)return;
    const b=EFFECT_BURSTS.find(eb=>eb.id===activeBurst); if(!b)return;
    setBurstEffect(b.effect); setBurstVisible(true);
    if(burstTimeoutRef.current)clearTimeout(burstTimeoutRef.current);
    burstTimeoutRef.current=setTimeout(()=>{ setBurstVisible(false); setBurstEffect(null); },1200);
  },[activeBurst]);

  useEffect(()=>{
    (async()=>{
      await Location.requestForegroundPermissionsAsync();
      await ImagePicker.requestMediaLibraryPermissionsAsync();
      if(user){const{data}=await supabase.from('users').select('username').eq('id',user.id).single();if(data)setUserProfile(data);}
      setDrafts(await loadDrafts());
      const bridge=getMarketplacePostBridge();
      if(bridge){
        clearMarketplacePostBridge();
        if(bridge.caption)setCaption(bridge.caption);
        if(bridge.listingId)setMktListingId(bridge.listingId);
        if(bridge.price)setMktPrice(bridge.price);
        if(bridge.title)setMktTitle(bridge.title);
        if(bridge.mediaUri){
          originalMediaRef.current=bridge.mediaUri;
          if(bridge.isVideo){setSelectedMedia(bridge.mediaUri);setMediaType('video');}
          else{setIsProcessingFilter(true);const c=await compressImage(bridge.mediaUri);setSelectedMedia(c);setIsProcessingFilter(false);setMediaType('image');}
          setScreenView('compose');
        } else if(bridge.caption||bridge.listingId) setScreenView('compose');
      }
    })();
    const sub=AppState.addEventListener('change',(next:AppStateStatus)=>{
      if(appStateRef.current==='active'&&next!=='active'&&isRecordingRef.current)stopRecording();
      appStateRef.current=next;
    });
    return()=>{ stopMusic();stopWatermark();stopGlitch();if(recTimerRef.current)clearInterval(recTimerRef.current);if(burstTimeoutRef.current)clearTimeout(burstTimeoutRef.current);sub.remove(); };
  },[user]);

  useEffect(()=>{ if(selectedMedia&&addWatermark)startWatermark(); else stopWatermark(); },[selectedMedia,addWatermark]);
  useEffect(()=>{ const f=FILTERS.find(f=>f.id===filter); if(selectedMedia&&(f as any)?.glitchEffect)startGlitch(); else stopGlitch(); },[filter,selectedMedia]);

  const handleStatusPost=(content:string,type:'text'|'voice',bg?:string,vUri?:string,vDur?:number)=>{
    setStatusContent(content);setStatusType(type);setStatusBg(bg||'purple');
    setStatusVoiceUri(vUri||null);setStatusVoiceDur(vDur||0);
    setMediaType(type);setScreenView('compose');setShowStatusCreator(false);
  };

  const applyFilter=async(filterId:string)=>{
    setFilter(filterId);
    if(originalMediaRef.current&&mediaType==='image'){
      setIsProcessingFilter(true);
      try{
        const fd=FILTERS.find(f=>f.id===filterId);
        const baked=await applyGlShader(originalMediaRef.current,fd?fd.gl:{brightness:0,contrast:1,saturation:1,hue:0,rMultiplier:1,gMultiplier:1,bMultiplier:1,vignette:0,addNoise:false});
        setSelectedMedia(baked);
      }catch{const c=await compressImage(originalMediaRef.current);setSelectedMedia(c);}
      finally{setIsProcessingFilter(false);}
    }
  };

  const applyFx=async(fxId:string)=>{
    if(fxId===selectedFx)fxId='fx_none';
    setSelectedFx(fxId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if(!originalMediaRef.current)return;
    setIsProcessingFx(true);
    try{
      if(mediaType==='image'){
        const fxDef=FX_EFFECTS.find(f=>f.id===fxId);
        if(fxDef&&fxDef.id!=='fx_none'){
          setSelectedMedia(await applyGlShader(originalMediaRef.current,fxDef));
        } else {
          const fd=FILTERS.find(f=>f.id===filter);
          setSelectedMedia(await applyGlShader(originalMediaRef.current,fd?fd.gl:{brightness:0,contrast:1,saturation:1,hue:0,rMultiplier:1,gMultiplier:1,bMultiplier:1,vignette:0,addNoise:false}));
        }
      } else { setSelectedMedia(await compressImage(originalMediaRef.current)); }
    }catch{console.warn('applyFx error');}
    finally{setIsProcessingFx(false);}
  };

  const activeFxTint=selectedFx!=='fx_none'?(FX_OVERLAY_TINTS[selectedFx]||'transparent'):'transparent';

  const takePicture=async()=>{
    if(!cameraRef.current||cameraMode!=='photo')return;
    try{
      const photo=await cameraRef.current.takePictureAsync({quality:0.9});
      if(photo){originalMediaRef.current=photo.uri;setIsProcessingFilter(true);const c=await compressImage(photo.uri);setSelectedMedia(c);setIsProcessingFilter(false);setMediaType('image');setScreenView('compose');}
    }catch{Alert.alert('Error','Failed to take picture');}
  };

  const startRecording=async()=>{
    if(!cameraRef.current||isRecording||cameraMode!=='video')return;
    try{
      setIsRecording(true);setRecDuration(0);
      Animated.timing(recProgress,{toValue:1,duration:60000,useNativeDriver:false}).start();
      recTimerRef.current=setInterval(()=>setRecDuration(p=>p+1),1000);
      const video=await cameraRef.current.recordAsync({maxDuration:60});
      if(video){originalMediaRef.current=video.uri;setSelectedMedia(video.uri);setMediaType('video');setScreenView('compose');}
      setIsRecording(false);recProgress.setValue(0);
      if(recTimerRef.current)clearInterval(recTimerRef.current);setRecDuration(0);
    }catch{setIsRecording(false);recProgress.setValue(0);if(recTimerRef.current)clearInterval(recTimerRef.current);setRecDuration(0);}
  };

  const stopRecording=async()=>{
    if(!cameraRef.current||!isRecording)return;
    try{cameraRef.current.stopRecording();}catch{}
    setIsRecording(false);recProgress.setValue(0);if(recTimerRef.current)clearInterval(recTimerRef.current);setRecDuration(0);
  };

  const fmtDur=(s:number)=>`${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  const pickFromGallery=async()=>{
    try{
      const r=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images','videos'],allowsEditing:true,aspect:[9,16],quality:0.9});
      if(!r.canceled&&r.assets[0]){
        const a=r.assets[0]; originalMediaRef.current=a.uri;
        if(a.type==='video'){setSelectedMedia(a.uri);setMediaType('video');}
        else{setIsProcessingFilter(true);const c=await compressImage(a.uri);setSelectedMedia(c);setIsProcessingFilter(false);setMediaType('image');}
        setScreenView('compose');
      }
    }catch{Alert.alert('Error','Failed to pick media');}
  };

  const addLocation=async()=>{
    setLoadingLoc(true);
    try{
      const{status}=await Location.getForegroundPermissionsAsync();
      if(status!=='granted'){const{status:ns}=await Location.requestForegroundPermissionsAsync();if(ns!=='granted'){Alert.alert('Permission Denied','Location permission required');setLoadingLoc(false);return;}}
      const pos=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
      const{latitude,longitude}=pos.coords; setLocationCoords({latitude,longitude});
      const geo=await Location.reverseGeocodeAsync({latitude,longitude});
      if(geo?.[0]){const p=geo[0];const parts=[p.city,p.region,p.country].filter(Boolean);setLocation(parts.slice(0,2).join(', ')||'Unknown location');Alert.alert('Location Added',parts.slice(0,2).join(', '));}
      else{setLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);Alert.alert('Location Added','Coordinates saved');}
    }catch(e:any){Alert.alert('Location Error',e.message||'Could not get location');}
    finally{setLoadingLoc(false);}
  };

  const pickMusic=async()=>{
    try{
      const r=await DocumentPicker.getDocumentAsync({type:'audio/*',copyToCacheDirectory:true});
      if(r.canceled)return;
      const a=r.assets[0]; const full=a.name||'Unknown Track';
      const parts=full.replace(/\.[^.]+$/,'').split('-').map((p:string)=>p.trim());
      if(parts.length>=2){setMusicArtist(parts[0]);setMusicName(parts.slice(1).join(' - '));}
      else{setMusicArtist('Unknown Artist');setMusicName(parts[0]);}
      setSelectedMusic(a.uri); await playMusic(a.uri);
    }catch{Alert.alert('Music Error','Could not load music file');}
  };

  const playMusic=async(uri:string)=>{
    try{
      await stopMusic();
      await Audio.setAudioModeAsync({playsInSilentModeIOS:true,staysActiveInBackground:false,shouldDuckAndroid:true,allowsRecordingIOS:false});
      const{sound}=await Audio.Sound.createAsync({uri},{shouldPlay:true,isLooping:true,volume:musicVol});
      soundRef.current=sound;
    }catch(e){console.warn('playMusic error:',e);}
  };

  useEffect(()=>{ if(soundRef.current)soundRef.current.setVolumeAsync(musicVol).catch(()=>{}); },[musicVol]);
  const stopMusic=async()=>{ if(soundRef.current){try{await soundRef.current.unloadAsync();soundRef.current=null;}catch{}} };

  const openEditingApp=async(app:typeof EDITING_APPS[0])=>{
    try{
      const can=await Linking.canOpenURL(app.scheme);
      if(can){await Linking.openURL(app.scheme);setTimeout(()=>setShowImportGuide(true),1000);}
      else Alert.alert(`${app.name} Not Installed`,`Install ${app.name}?`,[{text:'Cancel',style:'cancel'},{text:'Install',onPress:()=>Linking.openURL(Platform.OS==='ios'?app.appStore:app.playStore)}]);
    }catch{Alert.alert('Error','Could not open app');}
  };

  const importEditedMedia=async()=>{
    try{
      const r=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images','videos'],allowsEditing:false,quality:1});
      if(!r.canceled&&r.assets[0]){
        const a=r.assets[0]; originalMediaRef.current=a.uri;
        if(a.type==='video'){setSelectedMedia(a.uri);setMediaType('video');}
        else{setSelectedMedia(a.uri);setMediaType('image');}
        setShowImportGuide(false); Alert.alert('Success! \ud83c\udf89','Media imported!');
      }
    }catch{Alert.alert('Error','Failed to import media');}
  };

  const handleAudioStudioDone=async(r:{voiceUri:string|null;beatUri:string|null;beatName:string|null;beatArtist:string|null;voiceVolume:number;beatVolume:number;effectName:string|null;effectId:string|null;effectReverb:number;effectEcho:number;effectChorus:boolean;duration:number;autoTuneEnabled:boolean;})=>{
    setShowAudioStudio(false); setVoiceAutoTune(r.autoTuneEnabled);
    if(r.effectId){const eff=VOICE_EFFECTS.find(e=>e.id===r.effectId);if(eff)setSelVoiceEff(eff);}
    if(r.voiceUri){setStatusVoiceUri(r.voiceUri);setStatusVoiceDur(r.duration);setStatusType('voice');setMediaType('voice');setScreenView('compose');}
    if(r.beatUri){setSelectedMusic(r.beatUri);setMusicName(r.beatName||'Beat');setMusicArtist(r.beatArtist||'LumVibe Studio');setMusicVol(r.beatVolume);setOrigVol(r.voiceVolume);await playMusic(r.beatUri);}  // \u2705 "LumVibe Studio"
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleSaveDraft=async()=>{
    if(!selectedMedia&&!caption.trim()&&!statusContent.trim()&&!statusVoiceUri){Alert.alert('Nothing to save','Add content before saving a draft');return;}
    setSavingDraft(true);
    try{
      const draft:Draft={
        id:`draft_${Date.now()}_${Math.random().toString(36).substr(2,6)}`,createdAt:new Date().toISOString(),
        mediaUri:selectedMedia,originalMediaUri:originalMediaRef.current,mediaType,caption,statusContent,
        statusType,statusBackground:statusBg,statusVoiceUri,statusVoiceDuration:statusVoiceDur,
        filter,speedId:selectedSpeed.id,blurEnabled,selectedVibe,selectedFx,
        selectedMusic,selectedMusicName:musicName,musicArtist,musicVolume:musicVol,originalVolume:origVol,
        location,locationCoords,addWatermark,autoOptimize,isScheduled,
        scheduledFor:isScheduled?scheduleDate.toISOString():null,
      };
      const updated=await addDraft(draft); setDrafts(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('\u2705 Draft Saved','Your post has been saved to Drafts',[{text:'View Drafts',onPress:()=>setScreenView('drafts')},{text:'OK'}]);
    }catch{Alert.alert('Error','Could not save draft');}
    finally{setSavingDraft(false);}
  };

  const handleLoadDraft=(d:Draft)=>{
    originalMediaRef.current=d.originalMediaUri;
    setSelectedMedia(d.mediaUri);setMediaType(d.mediaType);setCaption(d.caption);
    setStatusContent(d.statusContent);setStatusType(d.statusType);setStatusBg(d.statusBackground);
    setStatusVoiceUri(d.statusVoiceUri);setStatusVoiceDur(d.statusVoiceDuration);
    setFilter(d.filter);setSelectedSpeed(SPEED_OPTIONS.find(s=>s.id===d.speedId)||SPEED_OPTIONS[2]);
    setBlurEnabled(d.blurEnabled);setSelectedVibe(d.selectedVibe);setSelectedFx(d.selectedFx||'fx_none');
    setSelectedMusic(d.selectedMusic);setMusicName(d.selectedMusicName);setMusicArtist(d.musicArtist);
    setMusicVol(d.musicVolume);setOrigVol(d.originalVolume);
    setLocation(d.location);setLocationCoords(d.locationCoords);
    setAddWatermark(d.addWatermark);setAutoOptimize(d.autoOptimize);setIsScheduled(d.isScheduled);
    if(d.scheduledFor)setScheduleDate(new Date(d.scheduledFor));
    if(d.selectedMusic&&!isRemoteUrl(d.selectedMusic)){
      FileSystem.getInfoAsync(d.selectedMusic).then(info=>{if(!info.exists){setSelectedMusic(null);setMusicName(null);setMusicArtist(null);}}).catch(()=>{});
    }
    setScreenView('compose');
  };

  const handleDeleteDraft=async(id:string)=>{ const u=await deleteDraft(id);setDrafts(u);Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); };

  const resetAll=()=>{
    stopMusic();stopWatermark();stopGlitch();
    setSelectedMedia(null);setMediaType(null);setCaption('');setStatusContent('');setStatusVoiceUri(null);setStatusVoiceDur(0);
    setLocation(null);setLocationCoords(null);setSelectedMusic(null);setMusicName(null);setMusicArtist(null);
    setOrigVol(1.0);setMusicVol(0.7);setIsScheduled(false);setFilter('original');
    setSelectedSpeed(SPEED_OPTIONS[2]);setBlurEnabled(false);setScreenView('camera');
    setSelectedVibe(null);setSelectedFx('fx_none');setUploadProgress(0);setUploadStage('');
    setVoiceAutoTune(false);setSelVoiceEff(null);setSelectedAr('ar_none');
    setMktListingId(null);setMktPrice(null);setMktTitle(null);
    setCameraFeature('normal');setSelectedAnimBg('bg_none');setShowBgPanel(false);
    setActiveBurst(null);setShowBurstPanel(false);setDualCamEnabled(false);
    originalMediaRef.current=null;
  };

  const handlePost=async()=>{
    if(postInProgress.current||uploading)return;
    if(!user){Alert.alert('Not Logged In','Please login to post');return;}
    if(!selectedMedia&&!caption.trim()&&!statusContent.trim()&&!statusVoiceUri){Alert.alert('Nothing to Post','Add a photo, video, text, or voice.');return;}
    if(caption.trim().length>2200){Alert.alert('Caption Too Long','Maximum 2200 characters.');return;}
    if(isScheduled&&scheduleDate<=new Date()){Alert.alert('Invalid Schedule','Pick a future date and time.');return;}
    const vibe=selectedVibe?VIBE_TYPES.find(v=>v.id===selectedVibe):null;
    Alert.alert(
      vibe?`${vibe.emoji} Post Your Content`:'Post Your Content',
      `Posting to: LumVibe${vibe?`\n${vibe.emoji} ${vibe.label} Vibe`:''}`,  // \u2705 "LumVibe"
      [{text:'Cancel',style:'cancel'},{text:'Post Now',onPress:executePost}]
    );
  };

  const executePost=async()=>{
    if(postInProgress.current)return;
    postInProgress.current=true;
    setUploading(true);setUploadProgress(0);setUploadStage('Preparing your post...');
    await new Promise(r=>setTimeout(r,120));setUploadProgress(8);
    try{
      let publicUrl:string|null=null;
      let cloudinaryPublicId:string|null=null;
      const activeFilter=FILTERS.find(f=>f.id===filter);

      if(statusType==='voice'&&statusVoiceUri){
        setUploadStage('Uploading voice message...');setUploadProgress(20);
        const info=await FileSystem.getInfoAsync(statusVoiceUri);
        if(!info.exists)throw new Error('Voice file does not exist');
        const b64=await FileSystem.readAsStringAsync(statusVoiceUri,{encoding:FileSystem.EncodingType.Base64});
        setUploadProgress(50);
        const ext=statusVoiceUri.split('.').pop()?.toLowerCase()||'m4a';
        const mime=ext==='aac'?'audio/aac':ext==='3gp'?'audio/3gpp':'audio/m4a';
        const fn=`${user!.id}/voice_${Date.now()}.${ext}`;
        const{error:ue}=await supabase.storage.from('posts').upload(fn,decode(b64),{contentType:mime,cacheControl:'3600',upsert:false});
        if(ue)throw new Error(`Voice upload failed: ${ue.message}`);
        publicUrl=supabase.storage.from('posts').getPublicUrl(fn).data.publicUrl;
        if(selVoiceEff&&selVoiceEff.id!=='none'&&publicUrl)publicUrl=buildCloudinaryAudioUrl(publicUrl,selVoiceEff);
        setUploadProgress(80);
      } else if(selectedMedia&&mediaType==='video'){
        setUploadStage('Checking video size...');setUploadProgress(5);
        const videoUri=originalMediaRef.current||selectedMedia;
        const ok=await checkVideoSize(videoUri);
        if(!ok){setUploading(false);postInProgress.current=false;return;}
        setUploadStage('Uploading video to Cloudinary...');setUploadProgress(10);
        const{url,publicId}=await uploadVideoToCloudinary(videoUri,p=>setUploadProgress(10+Math.round(p*.75)));
        publicUrl=url;cloudinaryPublicId=publicId;
        setUploadProgress(88);setUploadStage('Saving to database...');
      } else if(selectedMedia&&mediaType==='image'){
        setUploadStage('Compressing image...');setUploadProgress(10);
        let img=selectedMedia||originalMediaRef.current||'';
        if(!img)throw new Error('No image to upload');
        if(blurEnabled){
          try{
            const bl=await ImageManipulator.manipulateAsync(img,[{resize:{width:540}}],{compress:0.9,format:ImageManipulator.SaveFormat.JPEG});
            const upImg=await ImageManipulator.manipulateAsync(bl.uri,[{resize:{width:1080}}],{compress:0.72,format:ImageManipulator.SaveFormat.JPEG});
            img=upImg.uri;
          }catch{}
        }
        setUploadProgress(35);setUploadStage('Uploading image...');
        const info=await FileSystem.getInfoAsync(img);
        if(!info.exists)throw new Error('File does not exist');
        const b64=await FileSystem.readAsStringAsync(img,{encoding:FileSystem.EncodingType.Base64});
        setUploadProgress(65);
        const fn=`${user!.id}/${Date.now()}.jpg`;
        const{error:ue}=await supabase.storage.from('posts').upload(fn,decode(b64),{contentType:'image/jpeg',cacheControl:'3600',upsert:false});
        if(ue)throw new Error(`Upload failed: ${ue.message}`);
        publicUrl=supabase.storage.from('posts').getPublicUrl(fn).data.publicUrl;
        setUploadProgress(80);setUploadStage('Almost done...');
      }

      setUploadStage('Saving post...');setUploadProgress(90);
      const postData:PostInsertData={
        user_id:user!.id,caption:statusContent||caption.trim()||'',
        likes_count:0,comments_count:0,views_count:0,coins_received:0,
        created_at:new Date().toISOString(),is_published:!isScheduled,
        scheduled_for:isScheduled?scheduleDate.toISOString():null,
        has_watermark:addWatermark&&!!selectedMedia,auto_optimized:autoOptimize,
        applied_filter:filter,
        video_effect:mediaType==='video'?(selectedSpeed.dbKey!=='none'?selectedSpeed.dbKey:(activeFilter?.dbKey||'none')):(activeFilter?.dbKey||'none'),
        video_filter_tint:activeFilter?.dbTint||null,
        playback_rate:mediaType==='video'?selectedSpeed.rate:null,
        vibe_type:selectedVibe||null,voice_auto_tune:voiceAutoTune,
        blur_enabled:blurEnabled&&mediaType==='image',
      };

      if(mktListingId){postData.marketplace_listing_id=mktListingId;postData.marketplace_price=mktPrice||null;postData.marketplace_title=mktTitle||null;}
      if(publicUrl)postData.media_url=publicUrl;
      if(mediaType)postData.media_type=mediaType;
      if(cloudinaryPublicId)postData.cloudinary_public_id=cloudinaryPublicId;
      if(statusContent&&statusType==='text')postData.status_background=statusBg;
      if(statusType==='voice'&&statusVoiceDur>0)postData.voice_duration=statusVoiceDur;
      if(location){postData.location=location;if(locationCoords){postData.latitude=locationCoords.latitude;postData.longitude=locationCoords.longitude;}}
      if(musicName&&musicArtist){postData.music_name=musicName;postData.music_artist=musicArtist;postData.music_volume=musicVol;postData.original_volume=origVol;}

      if(selectedMusic){
        try{
          if(isRemoteUrl(selectedMusic)){postData.music_url=selectedMusic;}
          else{
            const mi=await FileSystem.getInfoAsync(selectedMusic);
            if(mi.exists){
              const ext=selectedMusic.split('.').pop()?.toLowerCase()||'m4a';
              const fn=`${user!.id}/music_${Date.now()}.${ext}`;
              const mime=ext==='mp3'?'audio/mpeg':ext==='aac'?'audio/aac':'audio/m4a';
              const sizeMb=('size' in mi?(mi.size as number):0)/1024/1024;
              if(sizeMb<=MUSIC_UPLOAD_LIMIT_MB){  // \u2705 15MB limit
                const b64=await FileSystem.readAsStringAsync(selectedMusic,{encoding:FileSystem.EncodingType.Base64});
                const{error:me}=await supabase.storage.from('posts').upload(fn,decode(b64),{contentType:mime,cacheControl:'3600',upsert:false});
                if(!me)postData.music_url=supabase.storage.from('posts').getPublicUrl(fn).data.publicUrl;
              } else {
                // \u2705 Alert user instead of silently skipping
                Alert.alert('\ud83c\udfb5 Music File Too Large',
                  `Your music file is ${sizeMb.toFixed(1)}MB. Files over ${MUSIC_UPLOAD_LIMIT_MB}MB can't be uploaded.\n\nThe post will be saved without music.`,
                  [{text:'OK'}]);
              }
            }
          }
        }catch(me){console.warn('Music upload skipped:',me);}
      }

      const{error:dbe}=await supabase.from('posts').insert(postData).select().single();
      if(dbe)throw new Error(`Database error: ${dbe.message}`);

      setUploadProgress(96);
      const{data:ud}=await supabase.from('users').select('points').eq('id',user!.id).single();
      await supabase.from('users').update({points:(ud?.points||0)+50}).eq('id',user!.id);
      setUploadProgress(100);setUploadStage('Posted! \ud83c\udf89');
      await new Promise(r=>setTimeout(r,2000));
      setUploading(false);postInProgress.current=false;

      if(isScheduled){
        const sc=scheduleDate.toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
        Alert.alert('\u23f0 Post Scheduled!',`Your post will go live on ${sc}`,[{text:'Done',onPress:()=>{resetAll();router.back();}}]);
      } else {
        const vibe=selectedVibe?VIBE_TYPES.find(v=>v.id===selectedVibe):null;
        Alert.alert(vibe?`${vibe.emoji} Posted!`:'\ud83c\udf89 Posted!',`Your post is live! +50 Points${vibe?` \u00b7 ${vibe.label} vibe`:''}`,[{text:'Done',onPress:()=>{resetAll();router.back();}}]);
      }
    }catch(error:any){
      setUploading(false);postInProgress.current=false;setUploadProgress(0);setUploadStage('');
      Alert.alert('\u274c Upload Failed',error.message||'Failed to create post',[{text:'Retry',onPress:executePost},{text:'Cancel',style:'cancel'}]);
    }
  };

  const handleDateChange=(_:any,d?:Date)=>{ setShowDatePicker(false); if(d){setScheduleDate(d);setShowTimePicker(true);} };
  const handleTimeChange=(_:any,t?:Date)=>{ setShowTimePicker(false); if(t){const c=new Date(scheduleDate);c.setHours(t.getHours());c.setMinutes(t.getMinutes());setScheduleDate(c);setIsScheduled(true);} };

  if(screenView==='drafts') return <DraftsScreen drafts={drafts} onLoad={handleLoadDraft} onDelete={handleDeleteDraft} onClose={()=>setScreenView('camera')}/>;

  // \u2500\u2500 CAMERA VIEW \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  if(screenView==='camera'){
    if(!permission)return<View style={s.container}><ActivityIndicator size="large" color="#00ff88"/></View>;
    if(!permission.granted)return(
      <View style={s.container}>
        <Text style={s.permTxt}>Camera permission needed</Text>
        <TouchableOpacity style={s.permBtn} onPress={requestPermission}><Text style={s.permBtnTxt}>Grant Permission</Text></TouchableOpacity>
      </View>
    );
    const activeFilt=FILTERS.find(f=>f.id===filter);
    return (
      <>
        <View style={s.snapContainer}>
          {dualCamEnabled?(
            <DualCameraView facing={facing} flash={flash} isRecording={isRecording} onToggleFacing={()=>setCameraFacing(f=>f==='back'?'front':'back')}/>
          ):(
            <>
              <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} enableTorch={flash==='on'} mode={cameraMode==='photo'?'picture':'video'}/>
              {cameraFeature==='animatedbg'&&selectedAnimBg!=='bg_none'&&<AnimatedBackground backgroundId={selectedAnimBg} intensity={0.85}/>}
              {activeFilt?.tintColor&&<View style={{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:activeFilt.tintColor}} pointerEvents="none"/>}
              {activeFilt?.cinematicBars&&(<><View style={s.cinTop} pointerEvents="none"/><View style={s.cinBot} pointerEvents="none"/></>)}
              {activeFilt?.glitchEffect&&<Animated.View style={[{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(255,0,60,0.12)'},{transform:[{translateX:glitchOffset}]}]} pointerEvents="none"/>}
              <AROverlay effectId={selectedAr} faceData={faceData} cW={SW} cH={SH}/>
              <EffectBurstOverlay effect={burstEffect||''} visible={burstVisible}/>
            </>
          )}

          {/* Top bar */}
          <View style={s.topBar}>
            <TouchableOpacity onPress={()=>router.back()} style={s.topBtn}><Feather name="x" size={30} color="#fff"/></TouchableOpacity>
            {isRecording&&<View style={s.recTimer}><View style={s.recDot}/><Text style={s.recTimerTxt}>{fmtDur(recDuration)}</Text></View>}
            <View style={{flexDirection:'row',gap:10}}>
              <TouchableOpacity onPress={()=>setScreenView('drafts')} style={s.topBtn}>
                <MaterialCommunityIcons name="file-document-outline" size={24} color="#fff"/>
                {drafts.length>0&&<View style={s.draftsBadge}><Text style={s.draftsBadgeTxt}>{drafts.length}</Text></View>}
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>setFlash(f=>f==='off'?'on':'off')} style={s.topBtn}>
                <Ionicons name={flash==='on'?'flash':'flash-off'} size={28} color="#fff"/>
              </TouchableOpacity>
            </View>
          </View>

          {/* Right tools */}
          <View style={s.rightTools}>
            <TouchableOpacity onPress={()=>setCameraFacing(f=>f==='back'?'front':'back')} style={s.tool}><MaterialCommunityIcons name="camera-flip" size={32} color="#fff"/><Text style={s.toolLbl}>Flip</Text></TouchableOpacity>
            <TouchableOpacity onPress={()=>setBlurEnabled(b=>!b)} style={[s.tool,blurEnabled&&s.toolActive]}><MaterialCommunityIcons name="blur" size={28} color={blurEnabled?'#00ff88':'#fff'}/><Text style={[s.toolLbl,blurEnabled&&{color:'#00ff88'}]}>Blur</Text></TouchableOpacity>
            <TouchableOpacity onPress={()=>setShowArPanel(p=>!p)} style={[s.tool,showArPanel&&s.toolActive]}><Text style={{fontSize:24}}>\u2728</Text><Text style={[s.toolLbl,showArPanel&&{color:'#00ff88'}]}>AR</Text></TouchableOpacity>

            {/* \ud83c\udfa8 Animated Background \u2014 button label "BG" */}
            <TouchableOpacity
              onPress={()=>{
                const next=cameraFeature==='animatedbg'?'normal':'animatedbg';
                setCameraFeature(next);
                if(next==='animatedbg'){setShowBgPanel(true);setDualCamEnabled(false);setShowBurstPanel(false);}
                else{setShowBgPanel(false);setSelectedAnimBg('bg_none');}
              }}
              style={[s.tool,cameraFeature==='animatedbg'&&s.toolActive]}>
              <Text style={{fontSize:22}}>\ud83c\udfa8</Text>
              <Text style={[s.toolLbl,cameraFeature==='animatedbg'&&{color:'#00ff88'}]}>BG</Text>
            </TouchableOpacity>

            {/* \ud83c\udf86 Effect Burst \u2014 button label "Burst" */}
            <TouchableOpacity
              onPress={()=>{
                const next=cameraFeature==='effectburst'?'normal':'effectburst';
                setCameraFeature(next);
                if(next==='effectburst'){setShowBurstPanel(true);setDualCamEnabled(false);setShowBgPanel(false);}
                else setShowBurstPanel(false);
              }}
              style={[s.tool,cameraFeature==='effectburst'&&s.toolActive]}>
              <Text style={{fontSize:22}}>\ud83c\udf86</Text>
              <Text style={[s.toolLbl,cameraFeature==='effectburst'&&{color:'#00ff88'}]}>Burst</Text>
            </TouchableOpacity>

            {/* Dual cam \u2014 video only, shows \u26a0\ufe0f alert before enabling */}
            {cameraMode==='video'&&(
              <TouchableOpacity
                onPress={()=>{
                  if(!dualCamEnabled){
                    Alert.alert('\u26a0\ufe0f Experimental Feature',
                      'Dual Camera shows front + back simultaneously. Results vary by device \u2014 may appear black on some phones. Continue?',
                      [{text:'Cancel',style:'cancel'},
                       {text:'Try It',onPress:()=>{setDualCamEnabled(true);setCameraFeature('dualcam');setShowBgPanel(false);setShowBurstPanel(false);Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);}}]);
                  } else {
                    setDualCamEnabled(false);setCameraFeature('normal');
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }
                }}
                style={[s.tool,dualCamEnabled&&s.toolActive]}>
                <MaterialCommunityIcons name="camera-burst" size={26} color={dualCamEnabled?'#00ff88':'#fff'}/>
                <Text style={[s.toolLbl,dualCamEnabled&&{color:'#00ff88'}]}>Dual</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* AR panel */}
          {showArPanel&&(
            <View style={s.arPanel}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingHorizontal:12}}>
                {AR_EFFECTS.map(ar=>(
                  <TouchableOpacity key={ar.id} style={[s.arChip,selectedAr===ar.id&&s.arChipActive]} onPress={()=>{setSelectedAr(ar.id);if(ar.id==='ar_none')setShowArPanel(false);Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);}}>
                    <Text style={{fontSize:20}}>{ar.emoji}</Text>
                    <Text style={[s.arChipLbl,selectedAr===ar.id&&s.arChipLblActive]}>{ar.name}</Text>
                    {ar.type==='face'&&<Text style={{fontSize:8,color:selectedAr===ar.id?'#00ff88':'#555',fontWeight:'700'}}>FACE</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Animated Background panel */}
          {showBgPanel&&cameraFeature==='animatedbg'&&(
            <View style={s.arPanel}>
              <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:12,marginBottom:8}}>
                <Text style={{color:'#00ff88',fontSize:13,fontWeight:'700'}}>\ud83c\udfa8 Animated Backgrounds</Text>
                <TouchableOpacity onPress={()=>setShowBgPanel(false)}><Feather name="x" size={16} color="#666"/></TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingHorizontal:12}}>
                {ANIMATED_BACKGROUNDS.map(bg=>(
                  <TouchableOpacity key={bg.id} style={[s.arChip,selectedAnimBg===bg.id&&s.arChipActive,{minWidth:72}]}
                    onPress={()=>{setSelectedAnimBg(bg.id);Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);}}>
                    <Text style={{fontSize:22}}>{bg.emoji}</Text>
                    <Text style={[s.arChipLbl,selectedAnimBg===bg.id&&s.arChipLblActive]} numberOfLines={1}>{bg.name}</Text>
                    {bg.type==='animated'&&<Text style={{fontSize:7,color:selectedAnimBg===bg.id?'#00ff88':'#444',fontWeight:'700'}}>ANIMATED</Text>}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Effect Burst panel */}
          <EffectBurstPanel
            visible={showBurstPanel&&cameraFeature==='effectburst'}
            activeBurst={activeBurst}
            onBurstSelect={(id)=>setActiveBurst(prev=>prev===id?null:id)}
            onClose={()=>setShowBurstPanel(false)}
          />

          {/* Speed bar (video) */}
          {cameraMode==='video'&&(
            <View style={s.speedBarCam}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:12,gap:8}}>
                {SPEED_OPTIONS.map(sp=>(
                  <TouchableOpacity key={sp.id} style={[s.speedChip,selectedSpeed.id===sp.id&&s.speedChipActive]} onPress={()=>setSelectedSpeed(sp)}>
                    <Text style={s.speedEmoji}>{sp.emoji}</Text>
                    <Text style={[s.speedLbl,selectedSpeed.id===sp.id&&s.speedLblActive]}>{sp.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Live filter bar */}
          <View style={s.liveFilterBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:12,gap:10}}>
              {FILTERS.map(f=>(
                <TouchableOpacity key={f.id} style={[s.liveFilterChip,filter===f.id&&s.liveFilterChipActive]} onPress={()=>setFilter(f.id)}>
                  <Text style={s.liveFilterEmoji}>{f.emoji}</Text>
                  <Text style={[s.liveFilterName,filter===f.id&&s.liveFilterNameActive]}>{f.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Recording progress bar */}
          {isRecording&&(
            <View style={s.recBar}>
              <Animated.View style={[s.recBarFill,{width:recProgress.interpolate({inputRange:[0,1],outputRange:['0%','100%']})}]}/>
            </View>
          )}

          {/* Photo/Video toggle */}
          <View style={s.modeToggle}>
            <TouchableOpacity style={[s.modeBtn,cameraMode==='photo'&&s.modeBtnActive]} onPress={()=>{setCameraMode('photo');setIsRecording(false);setDualCamEnabled(false);}}><Text style={[s.modeBtnTxt,cameraMode==='photo'&&s.modeBtnTxtActive]}>PHOTO</Text></TouchableOpacity>
            <TouchableOpacity style={[s.modeBtn,cameraMode==='video'&&s.modeBtnActive]} onPress={()=>setCameraMode('video')}><Text style={[s.modeBtnTxt,cameraMode==='video'&&s.modeBtnTxtActive]}>VIDEO</Text></TouchableOpacity>
          </View>

          {/* Bottom bar */}
          <View style={s.bottomBar}>
            <TouchableOpacity onPress={pickFromGallery} style={s.galleryBtn}><MaterialCommunityIcons name="image-multiple" size={28} color="#fff"/></TouchableOpacity>
            {cameraMode==='photo'
              ?<TouchableOpacity style={s.captureBtn} onPress={takePicture}><View style={s.captureBtnInner}/></TouchableOpacity>
              :<TouchableOpacity style={[s.captureBtn,isRecording&&s.captureBtnRec]} onPress={isRecording?stopRecording:startRecording}><View style={[s.captureBtnInner,isRecording&&s.recording]}/></TouchableOpacity>
            }
            <View style={{flexDirection:'row',gap:8,alignItems:'center'}}>
              {/* Burst fire button \u2014 orange, visible only when burst mode + effect selected */}
              {cameraFeature==='effectburst'&&activeBurst&&(
                <TouchableOpacity onPress={triggerBurst} style={[s.statusBtn,{backgroundColor:'#ff6b35'}]}>
                  <Text style={{fontSize:18}}>{EFFECT_BURSTS.find(b=>b.id===activeBurst)?.emoji||'\ud83c\udf86'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={()=>setShowStatusCreator(true)} style={s.statusBtn}><MaterialCommunityIcons name="format-text" size={24} color="#000"/></TouchableOpacity>
              <TouchableOpacity onPress={()=>setShowAudioStudio(true)} style={s.audioStudioBtn}><MaterialCommunityIcons name="microphone" size={24} color="#fff"/></TouchableOpacity>
            </View>
          </View>

          <StatusCreator visible={showStatusCreator} onClose={()=>setShowStatusCreator(false)} onPost={handleStatusPost}/>
        </View>
        <AudioStudio visible={showAudioStudio} onClose={()=>setShowAudioStudio(false)} onDone={handleAudioStudioDone}/>
      </>
    );
  }

  // \u2500\u2500 COMPOSE VIEW \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const availableApps=selectedMedia?EDITING_APPS.filter(a=>a.type==='both'||(mediaType==='video'&&a.type==='video')||(mediaType==='image'&&a.type==='image')):[];
  const activeFilt=FILTERS.find(f=>f.id===filter);

  return (
    <View style={s.container}>
      {uploading&&<UploadProgressCircle progress={uploadProgress} stage={uploadStage}/>}
      <View style={s.header}>
        <TouchableOpacity onPress={()=>{setSelectedMedia(null);setMediaType(null);setStatusContent('');setStatusVoiceUri(null);setScreenView('camera');stopMusic();stopWatermark();stopGlitch();setSelectedVibe(null);setSelectedFx('fx_none');}}>
          <Feather name="arrow-left" size={24} color="#00ff88"/>
        </TouchableOpacity>
        <Text style={s.title}>{statusContent?(statusType==='voice'?'\ud83c\udf99\ufe0f Voice Status':'\ud83d\udcdd Text Status'):'Create Post'}</Text>
        <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
          <TouchableOpacity style={[s.draftBtn,savingDraft&&{opacity:0.5}]} onPress={handleSaveDraft} disabled={savingDraft||uploading}>
            {savingDraft?<ActivityIndicator size="small" color="#00ff88"/>:<Text style={s.draftBtnTxt}>Draft</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[s.postBtn,uploading&&s.postBtnDis]} onPress={handlePost} disabled={uploading}>
            {uploading?<Text style={s.postTxt}>{Math.round(uploadProgress)}%</Text>:<Text style={s.postTxt}>Post</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{paddingBottom:40}}>
        {statusContent&&statusType==='text'&&(
          <View style={s.statusPreview}>
            <Text style={s.statusLabel}>\ud83d\udcdd Your Text Status</Text>
            <LinearGradient colors={getGradientColors(statusBg)} style={s.statusTextBox}>
              <Text style={s.statusText}>{statusContent}</Text>
            </LinearGradient>
          </View>
        )}
        {statusVoiceUri&&statusType==='voice'&&(
          <View style={s.statusPreview}>
            <Text style={s.statusLabel}>\ud83c\udf99\ufe0f Your Voice Status</Text>
            <View style={s.voiceStatusBox}>
              <MaterialCommunityIcons name="microphone" size={40} color="#00ff88"/>
              <Text style={s.voiceStatusTxt}>Voice message ready{statusVoiceDur>0?` \u00b7 ${fmtDur(statusVoiceDur)}`:''}</Text>
            </View>
            <TouchableOpacity style={s.editStudioBtn} onPress={()=>setShowAudioStudio(true)}>
              <MaterialCommunityIcons name="microphone" size={16} color="#fff"/>
              <Text style={s.editStudioTxt}>Edit in Audio Studio</Text>
              <Feather name="chevron-right" size={14} color="#aa00ff"/>
            </TouchableOpacity>
          </View>
        )}
        {selectedMedia&&(
          <View style={s.previewRow}>
            <View style={s.mediaBox}>
              {mediaType==='image'
                ?<Image source={{uri:selectedMedia}} style={s.media} resizeMode="cover"/>
                :<Video source={{uri:selectedMedia}} style={s.media} resizeMode={ResizeMode.COVER} isLooping shouldPlay rate={selectedSpeed.rate} volume={origVol}/>
              }
              {activeFilt?.tintColor&&mediaType!=='image'&&<View style={{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:activeFilt.tintColor,borderRadius:12}} pointerEvents="none"/>}
              {activeFilt?.cinematicBars&&(<><View style={[s.cinTop,{borderRadius:0}]} pointerEvents="none"/><View style={[s.cinBot,{borderRadius:0}]} pointerEvents="none"/></>)}
              {activeFilt?.glitchEffect&&(
                <><Animated.View style={[{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(255,0,60,0.14)',borderRadius:12},{transform:[{translateX:glitchOffset}]}]} pointerEvents="none"/>
                <Animated.View style={[{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,60,255,0.10)',borderRadius:12},{transform:[{translateX:Animated.multiply(glitchOffset,-1)}]}]} pointerEvents="none"/></>
              )}
              {activeFxTint!=='transparent'&&mediaType==='video'&&<View style={{position:'absolute',top:0,left:0,right:0,bottom:0,backgroundColor:activeFxTint,borderRadius:12}} pointerEvents="none"/>}
              {isProcessingFilter&&<View style={s.procOverlay}><ActivityIndicator size="large" color="#00ff88"/><Text style={s.procTxt}>Applying filter...</Text></View>}
              {isProcessingFx&&<View style={s.procOverlay}><ActivityIndicator size="large" color="#aa00ff"/><Text style={s.procTxt}>Applying FX...</Text></View>}
              {addWatermark&&(
                <Animated.View style={[s.wmOverlay,{transform:[{translateX:wmX},{translateY:wmY}],opacity:wmOp}]}>
                  <Image source={require('../../assets/images/icon.png')} style={s.wmLogo} resizeMode="contain"/>
                  <View><Text style={s.wmTxt}>LumVibe</Text><Text style={s.wmUser}>@{userProfile?.username||'user'}</Text></View>
                </Animated.View>
              )}
              {selectedVibe&&(()=>{const v=VIBE_TYPES.find(vt=>vt.id===selectedVibe);return v?<View style={s.vibeBadge}><Text style={s.vibeBadgeEmoji}>{v.emoji}</Text><Text style={[s.vibeBadgeTxt,{color:v.color}]}>{v.label.toUpperCase()}</Text></View>:null;})()}
              {mediaType==='video'&&selectedSpeed.id!=='normal'&&<View style={s.speedBadge}><Text style={s.speedBadgeTxt}>{selectedSpeed.emoji} {selectedSpeed.label}</Text></View>}
              {filter!=='original'&&<View style={s.filterBadge}><Text style={s.filterBadgeTxt}>{activeFilt?.emoji} {activeFilt?.name}</Text></View>}
            </View>
            <View style={s.filterSide}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {mediaType==='video'&&(<>
                  <Text style={s.sideLbl}>Speed</Text>
                  {SPEED_OPTIONS.map(sp=>(
                    <TouchableOpacity key={sp.id} style={[s.filterChip,selectedSpeed.id===sp.id&&s.filterChipActive]} onPress={()=>setSelectedSpeed(sp)}>
                      <Text style={s.filterEmoji}>{sp.emoji}</Text>
                      <Text style={[s.filterName,selectedSpeed.id===sp.id&&s.filterNameActive]}>{sp.label}</Text>
                    </TouchableOpacity>
                  ))}
                  <View style={s.sideDivider}/>
                  <Text style={s.sideLbl}>Blur</Text>
                  <TouchableOpacity style={[s.filterChip,blurEnabled&&s.filterChipActive]} onPress={()=>setBlurEnabled(b=>!b)}>
                    <Text style={s.filterEmoji}>\ud83c\udf2b\ufe0f</Text><Text style={[s.filterName,blurEnabled&&s.filterNameActive]}>Blur</Text>
                  </TouchableOpacity>
                  <View style={s.sideDivider}/>
                  <Text style={s.sideLbl}>Filter</Text>
                </>)}
                {FILTERS.map(f=>(
                  <TouchableOpacity key={f.id} style={[s.filterChip,filter===f.id&&s.filterChipActive]} onPress={()=>applyFilter(f.id)} disabled={isProcessingFilter}>
                    <Text style={s.filterEmoji}>{f.emoji}</Text>
                    <Text style={[s.filterName,filter===f.id&&s.filterNameActive]}>{f.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        )}

        {selectedMedia&&(
          <View style={s.fxSection}>
            <View style={s.fxHeader}>
              <Text style={s.fxTitle}>\ud83c\udf9b\ufe0f FX Effects</Text>
              <Text style={s.fxSub}>{mediaType==='image'?'GPU colour grade baked into your image':'Live FX tint overlay \u2014 stored with post'}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:10}} contentContainerStyle={{gap:6,paddingHorizontal:2}}>
              {FX_CATEGORIES.map(cat=>(
                <TouchableOpacity key={cat.id} style={[s.fxCatPill,fxCategory===cat.id&&s.fxCatPillOn]} onPress={()=>setFxCategory(cat.id)}>
                  <Text style={{fontSize:11}}>{cat.emoji}</Text>
                  <Text style={[s.fxCatName,fxCategory===cat.id&&{color:'#00ff88'}]}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingHorizontal:2}}>
              {FX_EFFECTS.filter(fx=>fxCategory==='all'||fx.category===fxCategory).map(fx=>{
                const on=selectedFx===fx.id;
                return (
                  <TouchableOpacity key={fx.id} style={[s.fxCard,on&&s.fxCardOn]} onPress={()=>applyFx(fx.id)} disabled={isProcessingFx} activeOpacity={0.75}>
                    <Text style={s.fxEmoji}>{fx.emoji}</Text>
                    <Text style={[s.fxName,on&&s.fxNameOn]}>{fx.name}</Text>
                    <Text style={s.fxDesc} numberOfLines={1}>{fx.desc}</Text>
                    {on&&<View style={s.fxCheck}><Feather name="check" size={9} color="#000"/></View>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {selectedMedia&&(
          <View style={s.noticeBox}>
            <MaterialCommunityIcons name="information" size={16} color="#00ff88"/>
            <Text style={s.noticeTxt}>
              {mediaType==='video'
                ?`${selectedSpeed.emoji} ${selectedSpeed.label} \u00b7 ${activeFilt?.emoji} ${activeFilt?.name}${selectedFx!=='fx_none'?` \u00b7 ${FX_EFFECTS.find(f=>f.id===selectedFx)?.emoji} FX`:''}${addWatermark?' \u00b7 \ud83d\udca7':''}${selectedVibe?` \u00b7 ${VIBE_TYPES.find(v=>v.id===selectedVibe)?.emoji}`:''} \u2014 saved in feed`
                :`${activeFilt?.emoji} ${activeFilt?.name}${selectedFx!=='fx_none'?` \u00b7 ${FX_EFFECTS.find(f=>f.id===selectedFx)?.emoji} FX`:''}${addWatermark?' \u00b7 \ud83d\udca7':''} \u2014 colour grade baked in`}
            </Text>
          </View>
        )}

        <View style={s.vibeSection}>
          <Text style={s.vibeSectionTitle}>\ud83d\udd25 Set Your Vibe</Text>
          <Text style={s.vibeSectionSub}>Pick the mood \u2014 shown to every viewer</Text>
          <View style={s.vibeGrid}>
            {VIBE_TYPES.map(vibe=>(
              <TouchableOpacity key={vibe.id} style={[s.vibeOption,selectedVibe===vibe.id&&{borderColor:vibe.color,backgroundColor:vibe.color+'22'}]} onPress={()=>setSelectedVibe(selectedVibe===vibe.id?null:vibe.id)}>
                <Text style={s.vibeOptionEmoji}>{vibe.emoji}</Text>
                <Text style={[s.vibeOptionLabel,selectedVibe===vibe.id&&{color:vibe.color}]}>{vibe.label}</Text>
                <Text style={s.vibeOptionDesc}>{vibe.description}</Text>
                {selectedVibe===vibe.id&&<View style={[s.vibeCheck,{backgroundColor:vibe.color}]}><Feather name="check" size={10} color="#000"/></View>}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={s.crossPostSection}>
          <View style={s.crossPostOptions}>
            {[{title:'\ud83d\udca7 Add Moving Watermark',desc:mediaType==='video'?'Bounces between corners like TikTok':`Brand your content with @${userProfile?.username||'username'}`,val:addWatermark,set:setAddWatermark,dis:!selectedMedia},
              {title:'\ud83c\udfa8 Auto-Optimize',desc:'Compress media to save mobile data & storage',val:autoOptimize,set:setAutoOptimize,dis:false}].map((opt,i)=>(
              <View key={i} style={s.optionRow}>
                <View style={{flex:1}}><Text style={s.optionTitle}>{opt.title}</Text><Text style={s.optionDesc}>{opt.desc}</Text></View>
                <Switch value={opt.val} onValueChange={opt.set} trackColor={{false:'#333',true:'#00ff88'}} thumbColor="#fff" disabled={opt.dis}/>
              </View>
            ))}
          </View>
        </View>

        {availableApps.length>0&&(
          <View style={s.editingSection}>
            <Text style={s.editingSectionTitle}>\u2728 Professional Editing</Text>
            <Text style={s.editingSectionSub}>Edit in another app before posting</Text>
            <View style={s.appGrid}>
              {availableApps.map(app=>(
                <TouchableOpacity key={app.id} style={s.appCard} onPress={()=>openEditingApp(app)}>
                  <View style={[s.appIconBox,{backgroundColor:app.color+'20'}]}><Text style={s.appIcon}>{app.icon}</Text></View>
                  <Text style={s.appName}>{app.name}</Text>
                  <Text style={s.appDesc}>{app.description}</Text>
                  <View style={s.appFeatures}>
                    {app.features.slice(0,2).map((f,i)=><View key={i} style={s.featureTag}><Text style={s.featureTxt}>{f}</Text></View>)}
                  </View>
                  <View style={s.appAction}><Text style={s.appActionTxt}>Edit Now</Text><Feather name="external-link" size={16} color="#00ff88"/></View>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={s.importBtn} onPress={importEditedMedia}>
              <MaterialCommunityIcons name="file-import" size={24} color="#00ff88"/>
              <View style={{flex:1,marginLeft:12}}><Text style={s.importBtnTitle}>Import Edited Media</Text><Text style={s.importBtnSub}>Select your edited file from gallery</Text></View>
              <Feather name="chevron-right" size={20} color="#00ff88"/>
            </TouchableOpacity>
          </View>
        )}

        {mktListingId&&(
          <View style={s.shopNowSection}>
            <Text style={s.shopNowBadge}>\ud83d\udecd\ufe0f MARKETPLACE POST</Text>
            {mktTitle&&<Text style={s.shopNowTitle} numberOfLines={2}>{mktTitle}</Text>}
            <TouchableOpacity style={s.shopNowBtn} onPress={()=>router.push(`/(tabs)/market?listing=${mktListingId}` as any)}>
              <LinearGradient colors={['#00ff88','#00cc6a']} start={{x:0,y:0}} end={{x:1,y:0}} style={s.shopNowGrad}>
                <Text style={s.shopNowIcon}>\ud83d\udecd\ufe0f</Text>
                <Text style={s.shopNowBtnTxt}>Shop Now{mktPrice?` \u2014 ${mktPrice}`:''}</Text>
                <Feather name="chevron-right" size={20} color="#000"/>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={s.shopRemove} onPress={()=>Alert.alert('Remove?','Remove marketplace link?',[{text:'Keep',style:'cancel'},{text:'Remove',style:'destructive',onPress:()=>{setMktListingId(null);setMktPrice(null);setMktTitle(null);}}])}>
              <Feather name="x-circle" size={14} color="#666"/>
              <Text style={s.shopRemoveTxt}>Remove Shop Now button</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={s.sec}>
          <Text style={s.secTitle}>Caption (Optional)</Text>
          <TextInput style={s.input} placeholder="Write something\u2026" placeholderTextColor="#666" multiline value={caption} onChangeText={setCaption} maxLength={2200}/>
          <Text style={s.count}>{caption.length}/2200</Text>
        </View>

        <View style={s.sec}>
          <TouchableOpacity style={s.row} onPress={addLocation} disabled={loadingLoc}>
            <Feather name="map-pin" size={20} color="#00ff88"/>
            <View style={{flex:1,marginLeft:12,flexDirection:'row',alignItems:'center'}}>
              {loadingLoc?<><ActivityIndicator size="small" color="#00ff88"/><Text style={[s.rowTxt,{marginLeft:8}]}>Getting location...</Text></>:<Text style={s.rowTxt}>{location||'Add location'}</Text>}
            </View>
            {location&&!loadingLoc&&<TouchableOpacity onPress={()=>{setLocation(null);setLocationCoords(null);}}><Feather name="x-circle" size={18} color="#aaa"/></TouchableOpacity>}
          </TouchableOpacity>

          <TouchableOpacity style={s.row} onPress={pickMusic}>
            <Feather name="music" size={20} color="#00ff88"/>
            <View style={{flex:1,marginLeft:12}}>
              {musicName?<><Text style={s.rowTxt} numberOfLines={1}>{musicName}</Text><Text style={s.subTxt} numberOfLines={1}>{musicArtist}</Text></>:<Text style={s.rowTxt}>Add music</Text>}
            </View>
            {selectedMusic&&<TouchableOpacity onPress={()=>{stopMusic();setSelectedMusic(null);setMusicName(null);setMusicArtist(null);}}><Feather name="x-circle" size={18} color="#aaa"/></TouchableOpacity>}
          </TouchableOpacity>

          {mediaType==='video'&&selectedMusic&&(
            <View style={s.mixerBox}>
              <View style={s.mixerHeader}><MaterialCommunityIcons name="equalizer" size={18} color="#00ff88"/><Text style={s.mixerTitle}>Audio Mix</Text><Text style={s.mixerSub}>Drag to adjust levels</Text></View>
              <VolumeSlider value={origVol} onValueChange={setOrigVol} color="#00ff88" label="Original video sound" emoji="\ud83c\udfac"/>
              <VolumeSlider value={musicVol} onValueChange={setMusicVol} color="#ffd700" label="Background music" emoji="\ud83c\udfb5"/>
              <View style={s.mixerPresets}>
                <TouchableOpacity style={s.presetBtn} onPress={()=>{setOrigVol(1.0);setMusicVol(0.0);}}><Text style={s.presetBtnTxt}>\ud83c\udfac Video only</Text></TouchableOpacity>
                <TouchableOpacity style={s.presetBtn} onPress={()=>{setOrigVol(0.0);setMusicVol(1.0);}}><Text style={s.presetBtnTxt}>\ud83c\udfb5 Music only</Text></TouchableOpacity>
                <TouchableOpacity style={s.presetBtn} onPress={()=>{setOrigVol(0.5);setMusicVol(1.0);}}><Text style={s.presetBtnTxt}>\u26a1 TikTok mix</Text></TouchableOpacity>
              </View>
            </View>
          )}

          <TouchableOpacity style={s.schedRow} onPress={()=>setShowDatePicker(true)}>
            <View style={s.schedIcon}><Feather name="clock" size={20} color="#00ff88"/></View>
            <View style={{flex:1}}>
              {isScheduled?<><Text style={s.schedTitle}>Scheduled</Text><Text style={s.schedSub}>{scheduleDate.toLocaleDateString()} at {scheduleDate.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</Text></>:<><Text style={s.schedTitle}>Schedule Post</Text><Text style={s.schedSub}>Plan your content</Text></>}
            </View>
            {isScheduled&&<TouchableOpacity style={s.schedBadge} onPress={()=>setIsScheduled(false)}><Feather name="x" size={14} color="#000"/></TouchableOpacity>}
            <Feather name="chevron-right" size={18} color="#00ff88"/>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={showImportGuide} animationType="fade" transparent>
        <View style={s.guideOverlay}>
          <View style={s.guideContent}>
            <View style={s.guideHeader}><Text style={s.guideTitle}>\ud83c\udfac Editing Guide</Text><TouchableOpacity onPress={()=>setShowImportGuide(false)}><Feather name="x" size={24} color="#fff"/></TouchableOpacity></View>
            <View style={s.guideSteps}>
              {['Edit Your Media','Save/Export','Return & Import'].map((title,i)=>(
                <View key={i} style={s.guideStep}>
                  <View style={s.stepNum}><Text style={s.stepNumTxt}>{i+1}</Text></View>
                  <View style={s.stepContent}>
                    <Text style={s.stepTitle}>{title}</Text>
                    <Text style={s.stepDesc}>{['Use the editing app to add effects','Save the edited video to your device','Tap "Import Edited Media" below'][i]}</Text>
                  </View>
                </View>
              ))}
            </View>
            <TouchableOpacity style={s.guideBtn} onPress={importEditedMedia}>
              <MaterialCommunityIcons name="file-import" size={24} color="#000"/><Text style={s.guideBtnTxt}>Import Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <AudioStudio visible={showAudioStudio} onClose={()=>setShowAudioStudio(false)} onDone={handleAudioStudioDone}/>
      {showDatePicker&&<DateTimePicker value={scheduleDate} mode="date" display="default" minimumDate={new Date()} onChange={handleDateChange}/>}
      {showTimePicker&&<DateTimePicker value={scheduleDate} mode="time" display="default" onChange={handleTimeChange}/>}
    </View>
  );
}

// \u2500\u2500\u2500 STYLES \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const s=StyleSheet.create({
  container:{flex:1,backgroundColor:'#000'},
  permTxt:{color:'#fff',textAlign:'center',marginTop:100,fontSize:16},
  permBtn:{backgroundColor:'#00ff88',margin:20,padding:16,borderRadius:12,alignItems:'center'},
  permBtnTxt:{color:'#000',fontWeight:'700',fontSize:16},
  header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:16,paddingTop:48,paddingBottom:12,backgroundColor:'#111'},
  title:{color:'#fff',fontSize:18,fontWeight:'600'},
  postBtn:{backgroundColor:'#00ff88',paddingHorizontal:18,paddingVertical:8,borderRadius:20},
  postBtnDis:{backgroundColor:'#555'},
  postTxt:{color:'#000',fontWeight:'600'},
  draftBtn:{borderWidth:1.5,borderColor:'#00ff88',paddingHorizontal:14,paddingVertical:8,borderRadius:20},
  draftBtnTxt:{color:'#00ff88',fontWeight:'600',fontSize:14},
  snapContainer:{flex:1},
  topBar:{position:'absolute',top:50,left:0,right:0,flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:20,zIndex:10},
  topBtn:{width:44,height:44,borderRadius:22,backgroundColor:'rgba(0,0,0,0.4)',alignItems:'center',justifyContent:'center'},
  draftsBadge:{position:'absolute',top:-2,right:-2,width:16,height:16,borderRadius:8,backgroundColor:'#00ff88',alignItems:'center',justifyContent:'center'},
  draftsBadgeTxt:{color:'#000',fontSize:9,fontWeight:'800'},
  recTimer:{flexDirection:'row',alignItems:'center',backgroundColor:'rgba(255,0,0,0.8)',paddingHorizontal:12,paddingVertical:6,borderRadius:16,gap:6},
  recDot:{width:8,height:8,borderRadius:4,backgroundColor:'#fff'},
  recTimerTxt:{color:'#fff',fontSize:14,fontWeight:'700',fontFamily:'monospace'},
  rightTools:{position:'absolute',right:20,top:'25%',zIndex:10,gap:8},
  tool:{width:58,height:58,borderRadius:29,backgroundColor:'rgba(0,0,0,0.4)',alignItems:'center',justifyContent:'center'},
  toolActive:{backgroundColor:'rgba(0,255,136,0.25)',borderWidth:1.5,borderColor:'#00ff88'},
  toolLbl:{color:'#fff',fontSize:9,fontWeight:'600',marginTop:2},
  arPanel:{position:'absolute',bottom:200,left:0,right:0,backgroundColor:'rgba(0,0,0,0.92)',paddingVertical:12,zIndex:12},
  arChip:{alignItems:'center',backgroundColor:'rgba(255,255,255,0.1)',borderRadius:12,padding:10,minWidth:64,borderWidth:1,borderColor:'rgba(255,255,255,0.15)'},
  arChipActive:{backgroundColor:'rgba(0,255,136,0.2)',borderColor:'#00ff88'},
  arChipLbl:{color:'#aaa',fontSize:9,fontWeight:'600',marginTop:3,textAlign:'center'},
  arChipLblActive:{color:'#00ff88'},
  speedBarCam:{position:'absolute',bottom:230,left:0,right:0,zIndex:10},
  speedChip:{backgroundColor:'rgba(0,0,0,0.55)',borderRadius:16,paddingVertical:6,paddingHorizontal:10,alignItems:'center',borderWidth:1,borderColor:'rgba(255,255,255,0.2)',minWidth:56},
  speedChipActive:{backgroundColor:'rgba(0,255,136,0.85)',borderColor:'#00ff88'},
  speedEmoji:{fontSize:16,marginBottom:2},
  speedLbl:{color:'#fff',fontSize:11,fontWeight:'700'},
  speedLblActive:{color:'#000'},
  liveFilterBar:{position:'absolute',bottom:165,left:0,right:0,zIndex:10},
  liveFilterChip:{backgroundColor:'rgba(0,0,0,0.5)',borderRadius:20,paddingVertical:8,paddingHorizontal:12,alignItems:'center',borderWidth:1,borderColor:'rgba(255,255,255,0.2)',minWidth:64},
  liveFilterChipActive:{backgroundColor:'rgba(0,255,136,0.8)',borderColor:'#00ff88'},
  liveFilterEmoji:{fontSize:20,marginBottom:2},
  liveFilterName:{color:'#fff',fontSize:10,fontWeight:'600',textAlign:'center'},
  liveFilterNameActive:{color:'#000'},
  modeToggle:{position:'absolute',bottom:120,alignSelf:'center',flexDirection:'row',backgroundColor:'rgba(0,0,0,0.55)',borderRadius:22,padding:4,zIndex:10},
  modeBtn:{paddingHorizontal:16,paddingVertical:8,borderRadius:18},
  modeBtnActive:{backgroundColor:'#fff'},
  modeBtnTxt:{color:'rgba(255,255,255,0.7)',fontSize:11,fontWeight:'700'},
  modeBtnTxtActive:{color:'#000'},
  recBar:{position:'absolute',top:0,left:0,right:0,height:4,backgroundColor:'rgba(255,255,255,0.3)',zIndex:10,overflow:'hidden'},
  recBarFill:{flex:1,backgroundColor:'#ff0000'},  // \u2705 fixed: flex:1 not height:'100%' as any
  bottomBar:{position:'absolute',bottom:40,left:0,right:0,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:30,zIndex:10},
  galleryBtn:{width:50,height:50,borderRadius:10,backgroundColor:'rgba(255,255,255,0.3)',alignItems:'center',justifyContent:'center'},
  captureBtn:{width:80,height:80,borderRadius:40,borderWidth:6,borderColor:'#fff',alignItems:'center',justifyContent:'center'},
  captureBtnRec:{borderColor:'#ff0000'},
  captureBtnInner:{width:64,height:64,borderRadius:32,backgroundColor:'#fff'},
  recording:{width:30,height:30,borderRadius:5,backgroundColor:'#ff0000'},
  statusBtn:{width:44,height:44,borderRadius:22,backgroundColor:'#00ff88',alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'#fff'},
  audioStudioBtn:{width:44,height:44,borderRadius:22,backgroundColor:'#7c3aed',alignItems:'center',justifyContent:'center',borderWidth:2,borderColor:'#a855f7'},
  cinTop:{position:'absolute',top:0,left:0,right:0,height:70,backgroundColor:'#000',zIndex:5},
  cinBot:{position:'absolute',bottom:0,left:0,right:0,height:70,backgroundColor:'#000',zIndex:5},
  statusPreview:{marginHorizontal:12,marginVertical:16,backgroundColor:'#0a0a0a',borderRadius:20,padding:20,borderWidth:2,borderColor:'#00ff88'},
  statusLabel:{color:'#00ff88',fontSize:14,fontWeight:'600',marginBottom:12},
  statusTextBox:{padding:20,borderRadius:12,minHeight:150,justifyContent:'center',alignItems:'center',width:'100%'},
  statusText:{color:'#fff',fontSize:24,fontWeight:'600',textAlign:'center'},
  voiceStatusBox:{backgroundColor:'#111',padding:30,borderRadius:12,alignItems:'center',justifyContent:'center'},
  voiceStatusTxt:{color:'#00ff88',fontSize:16,fontWeight:'600',marginTop:12},
  editStudioBtn:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,marginTop:14,backgroundColor:'#1a0035',borderRadius:12,paddingVertical:12,paddingHorizontal:16,borderWidth:1,borderColor:'#aa00ff55'},
  editStudioTxt:{color:'#aa00ff',fontSize:13,fontWeight:'700',flex:1,textAlign:'center'},
  previewRow:{flexDirection:'row',marginVertical:12,height:400,paddingHorizontal:12},
  mediaBox:{flex:1,marginRight:12,borderRadius:12,overflow:'hidden',position:'relative'},
  media:{width:'100%',height:'100%'},
  procOverlay:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(0,0,0,0.7)',justifyContent:'center',alignItems:'center',borderRadius:12},
  procTxt:{color:'#00ff88',marginTop:12,fontSize:14,fontWeight:'600'},
  wmOverlay:{position:'absolute',flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'rgba(0,0,0,0.55)',paddingHorizontal:10,paddingVertical:6,borderRadius:10},
  wmLogo:{width:22,height:22,borderRadius:4},
  wmTxt:{color:'#fff',fontSize:12,fontWeight:'800'},
  wmUser:{color:'#00ff88',fontSize:10},
  vibeBadge:{position:'absolute',top:10,left:10,flexDirection:'row',alignItems:'center',gap:4,backgroundColor:'rgba(0,0,0,0.7)',borderRadius:10,paddingHorizontal:8,paddingVertical:4},
  vibeBadgeEmoji:{fontSize:12},vibeBadgeTxt:{fontSize:9,fontWeight:'800'},
  speedBadge:{position:'absolute',bottom:10,left:10,backgroundColor:'rgba(0,0,0,0.7)',borderRadius:8,paddingHorizontal:8,paddingVertical:4},
  speedBadgeTxt:{color:'#fff',fontSize:10,fontWeight:'700'},
  filterBadge:{position:'absolute',bottom:10,right:10,backgroundColor:'rgba(0,0,0,0.7)',borderRadius:8,paddingHorizontal:8,paddingVertical:4},
  filterBadgeTxt:{color:'#fff',fontSize:10,fontWeight:'700'},
  filterSide:{width:72},
  sideLbl:{color:'#666',fontSize:9,fontWeight:'700',textTransform:'uppercase',marginBottom:6,marginTop:4,paddingHorizontal:4},
  sideDivider:{height:1,backgroundColor:'#1a1a1a',marginVertical:8},
  filterChip:{alignItems:'center',padding:8,borderRadius:10,marginBottom:6,borderWidth:1,borderColor:'#1a1a1a',backgroundColor:'#0d0d0d'},
  filterChipActive:{backgroundColor:'#001a0a',borderColor:'#00ff88'},
  filterEmoji:{fontSize:18,marginBottom:2},
  filterName:{color:'#666',fontSize:8,fontWeight:'600',textAlign:'center'},
  filterNameActive:{color:'#00ff88'},
  fxSection:{marginHorizontal:12,marginBottom:12,backgroundColor:'#0d0d0d',borderRadius:16,padding:14,borderWidth:1,borderColor:'#1a1a1a'},
  fxHeader:{marginBottom:10},fxTitle:{color:'#fff',fontSize:14,fontWeight:'700',marginBottom:2},fxSub:{color:'#666',fontSize:11},
  fxCatPill:{flexDirection:'row',alignItems:'center',gap:4,backgroundColor:'#111',borderRadius:14,paddingHorizontal:10,paddingVertical:5,borderWidth:1,borderColor:'#222'},
  fxCatPillOn:{backgroundColor:'#001a0a',borderColor:'#00ff88'},fxCatName:{color:'#888',fontSize:10,fontWeight:'600'},
  fxCard:{alignItems:'center',backgroundColor:'#111',borderRadius:12,padding:10,width:88,borderWidth:1,borderColor:'#222',position:'relative'},
  fxCardOn:{backgroundColor:'#001a0a',borderColor:'#00ff88'},
  fxEmoji:{fontSize:22,marginBottom:4},fxName:{color:'#fff',fontSize:10,fontWeight:'700',textAlign:'center'},fxNameOn:{color:'#00ff88'},
  fxDesc:{color:'#555',fontSize:8,textAlign:'center',marginTop:2},
  fxCheck:{position:'absolute',top:4,right:4,width:15,height:15,borderRadius:8,backgroundColor:'#00ff88',alignItems:'center',justifyContent:'center'},
  noticeBox:{marginHorizontal:12,marginBottom:12,flexDirection:'row',alignItems:'flex-start',gap:8,backgroundColor:'#0a1a0a',borderRadius:10,padding:12,borderWidth:1,borderColor:'#00ff8833'},
  noticeTxt:{color:'#888',fontSize:11,flex:1,lineHeight:16},
  vibeSection:{marginHorizontal:12,marginBottom:16,backgroundColor:'#0d0d0d',borderRadius:16,padding:14,borderWidth:1,borderColor:'#1a1a1a'},
  vibeSectionTitle:{color:'#fff',fontSize:15,fontWeight:'700',marginBottom:4},vibeSectionSub:{color:'#666',fontSize:12,marginBottom:12},
  vibeGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},
  vibeOption:{width:(SW-56)/4,alignItems:'center',backgroundColor:'#111',borderRadius:12,padding:10,borderWidth:1.5,borderColor:'#222',position:'relative'},
  vibeOptionEmoji:{fontSize:22,marginBottom:4},vibeOptionLabel:{color:'#fff',fontSize:10,fontWeight:'700',textAlign:'center'},
  vibeOptionDesc:{color:'#555',fontSize:8,textAlign:'center',marginTop:2},
  vibeCheck:{position:'absolute',top:4,right:4,width:16,height:16,borderRadius:8,alignItems:'center',justifyContent:'center'},
  crossPostSection:{marginHorizontal:12,marginBottom:16},
  crossPostOptions:{backgroundColor:'#0d0d0d',borderRadius:16,borderWidth:1,borderColor:'#1a1a1a',overflow:'hidden'},
  optionRow:{flexDirection:'row',alignItems:'center',padding:14,borderBottomWidth:1,borderBottomColor:'#111'},
  optionTitle:{color:'#fff',fontSize:13,fontWeight:'600',marginBottom:2},optionDesc:{color:'#666',fontSize:11},
  editingSection:{marginHorizontal:12,marginBottom:16,backgroundColor:'#0d0d0d',borderRadius:16,padding:14,borderWidth:1,borderColor:'#1a1a1a'},
  editingSectionTitle:{color:'#fff',fontSize:15,fontWeight:'700',marginBottom:4},editingSectionSub:{color:'#666',fontSize:12,marginBottom:12},
  appGrid:{flexDirection:'row',gap:10,marginBottom:12},
  appCard:{flex:1,backgroundColor:'#111',borderRadius:12,padding:12,borderWidth:1,borderColor:'#222'},
  appIconBox:{width:44,height:44,borderRadius:12,alignItems:'center',justifyContent:'center',marginBottom:8},
  appIcon:{fontSize:24},appName:{color:'#fff',fontSize:13,fontWeight:'700',marginBottom:4},appDesc:{color:'#666',fontSize:11,marginBottom:8},
  appFeatures:{flexDirection:'row',flexWrap:'wrap',gap:4,marginBottom:8},
  featureTag:{backgroundColor:'#1a1a1a',borderRadius:6,paddingHorizontal:6,paddingVertical:2},featureTxt:{color:'#888',fontSize:9},
  appAction:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},appActionTxt:{color:'#00ff88',fontSize:12,fontWeight:'700'},
  importBtn:{flexDirection:'row',alignItems:'center',backgroundColor:'#111',borderRadius:12,padding:14,borderWidth:1,borderColor:'#00ff8833'},
  importBtnTitle:{color:'#fff',fontSize:13,fontWeight:'700'},importBtnSub:{color:'#666',fontSize:11,marginTop:2},
  shopNowSection:{marginHorizontal:12,marginBottom:16,backgroundColor:'#0a1a0a',borderRadius:16,padding:16,borderWidth:1.5,borderColor:'#00ff8855'},
  shopNowBadge:{color:'#00ff88',fontSize:11,fontWeight:'800',letterSpacing:1,marginBottom:6},
  shopNowTitle:{color:'#fff',fontSize:16,fontWeight:'700',marginBottom:12},
  shopNowBtn:{borderRadius:12,overflow:'hidden',marginBottom:10},
  shopNowGrad:{flexDirection:'row',alignItems:'center',padding:16,gap:10},
  shopNowIcon:{fontSize:20},shopNowBtnTxt:{flex:1,color:'#000',fontSize:15,fontWeight:'800'},
  shopRemove:{flexDirection:'row',alignItems:'center',gap:6,justifyContent:'center'},shopRemoveTxt:{color:'#555',fontSize:11},
  sec:{marginHorizontal:12,marginBottom:16},secTitle:{color:'#fff',fontSize:14,fontWeight:'700',marginBottom:10},
  input:{backgroundColor:'#0d0d0d',borderRadius:12,padding:14,color:'#fff',fontSize:15,minHeight:80,textAlignVertical:'top',borderWidth:1,borderColor:'#1a1a1a'},
  count:{color:'#555',fontSize:11,textAlign:'right',marginTop:4},
  row:{flexDirection:'row',alignItems:'center',backgroundColor:'#0d0d0d',borderRadius:12,padding:14,marginBottom:8,borderWidth:1,borderColor:'#1a1a1a'},
  rowTxt:{color:'#fff',fontSize:14,fontWeight:'500'},subTxt:{color:'#666',fontSize:11,marginTop:2},
  mixerBox:{backgroundColor:'#0d0d0d',borderRadius:12,padding:14,marginBottom:8,borderWidth:1,borderColor:'#1a1a1a'},
  mixerHeader:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:14},
  mixerTitle:{color:'#fff',fontSize:14,fontWeight:'700',flex:1},mixerSub:{color:'#666',fontSize:11},
  mixerPresets:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:4},
  presetBtn:{backgroundColor:'#111',borderRadius:8,paddingHorizontal:10,paddingVertical:6,borderWidth:1,borderColor:'#1a1a1a'},
  presetBtnTxt:{color:'#ccc',fontSize:11},
  schedRow:{flexDirection:'row',alignItems:'center',backgroundColor:'#0d0d0d',borderRadius:12,padding:14,borderWidth:1,borderColor:'#1a1a1a'},
  schedIcon:{width:36,height:36,borderRadius:18,backgroundColor:'#001a0a',alignItems:'center',justifyContent:'center',marginRight:12},
  schedTitle:{color:'#fff',fontSize:14,fontWeight:'600'},schedSub:{color:'#666',fontSize:11,marginTop:2},
  schedBadge:{width:24,height:24,borderRadius:12,backgroundColor:'#00ff88',alignItems:'center',justifyContent:'center',marginRight:8},
  guideOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.85)',justifyContent:'center',alignItems:'center',padding:20},
  guideContent:{backgroundColor:'#111',borderRadius:20,padding:24,width:'100%',maxWidth:360,borderWidth:1,borderColor:'#1a1a1a'},
  guideHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:20},
  guideTitle:{color:'#fff',fontSize:18,fontWeight:'700'},
  guideSteps:{gap:16,marginBottom:24},
  guideStep:{flexDirection:'row',alignItems:'flex-start',gap:14},
  stepNum:{width:32,height:32,borderRadius:16,backgroundColor:'#00ff88',alignItems:'center',justifyContent:'center',flexShrink:0},
  stepNumTxt:{color:'#000',fontSize:14,fontWeight:'800'},
  stepContent:{flex:1},stepTitle:{color:'#fff',fontSize:14,fontWeight:'700',marginBottom:4},stepDesc:{color:'#888',fontSize:12,lineHeight:18},
  guideBtn:{backgroundColor:'#00ff88',borderRadius:12,padding:16,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10},
  guideBtnTxt:{color:'#000',fontSize:16,fontWeight:'800'},
}); 
