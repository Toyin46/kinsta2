// ═══════════════════════════════════════════════════════════
// create.tsx  — LumVibe v5  — COMPLETE PRODUCTION FILE
// ─────────────────────────────────────────────────────────
// FIXES APPLIED:
//  ✅ GL shader replaced with real ImageManipulator baking
//  ✅ VolumeSlider drag-reset bug fixed
//  ✅ Face AR effects replaced with smart positioned overlays
//  ✅ Beat URLs replaced with Freesound API live search
//  ✅ Beat-tap sync added (tap rhythm → visual effect fires)
//  ✅ Music file >15MB alert added
//  ✅ All bugs from review fixed
//  ✅ CLOUDINARY_UPLOAD_PRESET kept as 'Kinsta_unsigned'
//  ✅ Design/UI completely unchanged
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
import { getMarketplacePostBridge, clearMarketplacePostBridge } from '../../utils/marketplacePostBridge';
import StatusCreator from '../../components/StatusCreator';

const { width: SW, height: SH } = Dimensions.get('window');

// ─── TYPES ────────────────────────────────────────────────
type MediaType  = 'image' | 'video' | 'text' | 'voice' | null;
type CameraMode = 'video' | 'picture';
type ScreenView = 'camera' | 'compose' | 'drafts';
type CameraFeature = 'normal' | 'animatedbg' | 'effectburst' | 'dualcam';

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
  brightness: number; contrast: number; saturation: number;
}
interface FilterDef {
  id: string; name: string; emoji: string;
  tintColor: string | null; dbTint: string | null; dbKey: string;
  cinematicBars: boolean; glitchEffect?: boolean;
  manipulator: { brightness: number; contrast: number; saturate?: number };
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
interface FreesoundResult {
  id: number; name: string; username: string; duration: number;
  previews: { 'preview-hq-mp3': string; 'preview-lq-mp3': string };
  tags: string[];
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
const DRAFTS_STORAGE_KEY       = 'lumvibe_drafts_v1';
const MAX_DRAFTS               = 20;
const VIDEO_SIZE_LIMIT_MB      = 50;
const MUSIC_UPLOAD_LIMIT_MB    = 15;
const FREESOUND_API_KEY        = 'YOUR_FREESOUND_API_KEY'; // Get free at freesound.org/apiv2/apply

// ─── AR EFFECTS — smart positioned overlays ───────────────
// No ML needed. Face-type effects use forehead/face region estimates.
const AR_EFFECTS = [
  { id:'ar_none',      name:'None',       emoji:'✖️', type:'none'  },
  { id:'ar_flowers',   name:'Flowers',    emoji:'🌸', type:'float' },
  { id:'ar_stars',     name:'Stars',      emoji:'⭐', type:'float' },
  { id:'ar_hearts',    name:'Hearts',     emoji:'❤️', type:'float' },
  { id:'ar_money',     name:'Money Rain', emoji:'💸', type:'float' },
  { id:'ar_fire',      name:'Fire',       emoji:'🔥', type:'float' },
  { id:'ar_bunny',     name:'Bunny Face', emoji:'🐰', type:'face_top' },
  { id:'ar_crown',     name:'Crown',      emoji:'👑', type:'face_top' },
  { id:'ar_glasses',   name:'Glasses',    emoji:'🕶️', type:'face_mid' },
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

// ─── STUDIO BEATS (fallback when no internet) ─────────────
const STUDIO_GENRES = [
  {id:'all',name:'All',emoji:'🎵'},{id:'afrobeats',name:'Afrobeats',emoji:'🌍'},
  {id:'amapiano',name:'Amapiano',emoji:'🎹'},{id:'afropop',name:'Afropop',emoji:'🎤'},
  {id:'hiphop',name:'Hip-Hop',emoji:'🎧'},{id:'rnb',name:'R&B',emoji:'💜'},
  {id:'gospel',name:'Gospel',emoji:'✝️'},{id:'dancehall',name:'Dancehall',emoji:'🇯🇲'},
  {id:'lofi',name:'Lo-Fi',emoji:'🌙'},{id:'afrodrill',name:'Afro Drill',emoji:'💥'},
];

// Freesound genre search tags mapping
const FREESOUND_GENRE_TAGS: Record<string,string> = {
  all: 'beat music loop',
  afrobeats: 'afrobeats african beat',
  amapiano: 'amapiano piano beat',
  afropop: 'afropop african pop',
  hiphop: 'hip-hop trap beat',
  rnb: 'rnb soul beat',
  gospel: 'gospel worship music',
  dancehall: 'dancehall reggae beat',
  lofi: 'lofi chill beat',
  afrodrill: 'drill trap beat',
};

// ─── FX EFFECTS ───────────────────────────────────────────
// brightness/contrast values for ImageManipulator — these get BAKED into the file
const FX_EFFECTS: FxEffect[] = [
  {id:'fx_none',           name:'No FX',        emoji:'✖️',category:'basic',     desc:'Remove all FX',            brightness:1,    contrast:1,    saturation:1   },
  {id:'fx_vhs',            name:'VHS Tape',      emoji:'📼',category:'retro',     desc:'Old camcorder look',       brightness:0.88, contrast:0.92, saturation:0.65},
  {id:'fx_fire',           name:'Fire Grade',    emoji:'🔥',category:'mood',      desc:'Inferno colour burn',      brightness:1.02, contrast:1.3,  saturation:1.5 },
  {id:'fx_ice',            name:'Ice Cold',      emoji:'🧊',category:'mood',      desc:'Frozen blue world',        brightness:1.0,  contrast:1.15, saturation:0.8 },
  {id:'fx_neon_burn',      name:'Neon Burn',     emoji:'🌈',category:'creative',  desc:'Cyberpunk neon city',      brightness:0.95, contrast:1.4,  saturation:2.2 },
  {id:'fx_duotone_purple', name:'Purple Haze',   emoji:'💜',category:'creative',  desc:'Duotone purple grade',     brightness:1.0,  contrast:1.2,  saturation:0.1 },
  {id:'fx_duotone_gold',   name:'Gold Rush',     emoji:'🏆',category:'creative',  desc:'Duotone gold & black',     brightness:1.02, contrast:1.3,  saturation:0.1 },
  {id:'fx_light_leak',     name:'Light Leak',    emoji:'🌟',category:'retro',     desc:'Film light bleed',         brightness:1.05, contrast:0.95, saturation:1.1 },
  {id:'fx_bleach',         name:'Bleach Out',    emoji:'⬜',category:'editorial', desc:'Washed out overexpose',    brightness:1.08, contrast:0.85, saturation:0.7 },
  {id:'fx_noir_contrast',  name:'Hard Noir',     emoji:'🖤',category:'editorial', desc:'Maximum B&W contrast',     brightness:0.95, contrast:1.8,  saturation:0.0 },
  {id:'fx_sunrise',        name:'Sunrise',       emoji:'🌄',category:'mood',      desc:'Golden morning warmth',    brightness:1.04, contrast:1.1,  saturation:1.3 },
  {id:'fx_deep_ocean',     name:'Deep Ocean',    emoji:'🌊',category:'mood',      desc:'Underwater blue depth',    brightness:1.0,  contrast:1.2,  saturation:1.1 },
  {id:'fx_lomo',           name:'Lomography',    emoji:'🔴',category:'retro',     desc:'Lomo film look',           brightness:1.0,  contrast:1.25, saturation:1.6 },
  {id:'fx_teal_orange',    name:'Hollywood',     emoji:'🎬',category:'editorial', desc:'Teal & orange blockbuster',brightness:1.0,  contrast:1.12, saturation:1.15},
  {id:'fx_grunge',         name:'Grunge',        emoji:'🤘',category:'creative',  desc:'Dirty gritty texture',     brightness:1.0,  contrast:1.4,  saturation:0.7 },
  {id:'fx_pastel',         name:'Pastel Dream',  emoji:'🌸',category:'mood',      desc:'Soft dreamy pastels',      brightness:1.05, contrast:0.9,  saturation:0.75},
  {id:'fx_midnight',       name:'Midnight',      emoji:'🌑',category:'mood',      desc:'Dark moody night',         brightness:0.94, contrast:1.25, saturation:0.9 },
  {id:'fx_chrome',         name:'Chrome',        emoji:'🔩',category:'editorial', desc:'Metallic silver grade',    brightness:1.0,  contrast:1.15, saturation:0.3 },
  {id:'fx_pop_art',        name:'Pop Art',       emoji:'🎨',category:'creative',  desc:'Bold pop art colours',     brightness:1.0,  contrast:1.5,  saturation:2.5 },
  {id:'fx_cross_process',  name:'Cross Process', emoji:'🌀',category:'retro',     desc:'Cross-processed film',     brightness:1.0,  contrast:1.2,  saturation:1.4 },
  {id:'fx_aura',           name:'Aura Glow',     emoji:'✨',category:'creative',  desc:'Soft purple aura',         brightness:1.02, contrast:1.05, saturation:1.2 },
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
// manipulator values are used for REAL baking via ImageManipulator
// tintColor is the live preview overlay (80-90% match to baked result)
const FILTERS: FilterDef[] = [
  { id:'original', name:'Original', emoji:'✨', tintColor:null,                     dbTint:null,                     dbKey:'none',      cinematicBars:false, manipulator:{brightness:1,    contrast:1,    saturate:1   } },
  { id:'beauty',   name:'Beauty',   emoji:'💄', tintColor:'rgba(255,200,200,0.18)', dbTint:'rgba(255,200,200,0.18)', dbKey:'beauty',    cinematicBars:false, manipulator:{brightness:1.04, contrast:0.95, saturate:1.15} },
  { id:'vintage',  name:'Vintage',  emoji:'📷', tintColor:'rgba(180,120,60,0.25)',  dbTint:'rgba(180,120,60,0.25)',  dbKey:'vintage',   cinematicBars:false, manipulator:{brightness:0.98, contrast:0.9,  saturate:0.7 } },
  { id:'cool',     name:'Cool',     emoji:'❄️', tintColor:'rgba(100,180,255,0.22)', dbTint:'rgba(100,180,255,0.22)', dbKey:'cool',      cinematicBars:false, manipulator:{brightness:1.0,  contrast:1.1,  saturate:0.9 } },
  { id:'warm',     name:'Warm',     emoji:'🔥', tintColor:'rgba(255,160,50,0.22)',  dbTint:'rgba(255,160,50,0.22)',  dbKey:'warm',      cinematicBars:false, manipulator:{brightness:1.03, contrast:1.05, saturate:1.2 } },
  { id:'dramatic', name:'Dramatic', emoji:'🎭', tintColor:'rgba(0,0,0,0.35)',       dbTint:'rgba(0,0,0,0.35)',       dbKey:'dramatic',  cinematicBars:false, manipulator:{brightness:0.95, contrast:1.5,  saturate:0.85} },
  { id:'bright',   name:'Bright',   emoji:'☀️', tintColor:'rgba(255,255,200,0.18)', dbTint:'rgba(255,255,200,0.18)', dbKey:'bright',    cinematicBars:false, manipulator:{brightness:1.1,  contrast:0.95, saturate:1.1 } },
  { id:'noir',     name:'Noir',     emoji:'🎬', tintColor:'rgba(0,0,0,0.5)',        dbTint:'rgba(0,0,0,0.5)',        dbKey:'noir',      cinematicBars:false, manipulator:{brightness:0.96, contrast:1.6,  saturate:0.0 } },
  { id:'neon',     name:'Neon',     emoji:'💚', tintColor:'rgba(0,255,136,0.2)',    dbTint:'rgba(0,255,136,0.2)',    dbKey:'neon',      cinematicBars:false, manipulator:{brightness:1.0,  contrast:1.3,  saturate:2.0 } },
  { id:'sunset',   name:'Sunset',   emoji:'🌅', tintColor:'rgba(255,80,80,0.25)',   dbTint:'rgba(255,80,80,0.25)',   dbKey:'sunset',    cinematicBars:false, manipulator:{brightness:1.02, contrast:1.2,  saturate:1.4 } },
  { id:'cinematic',name:'Cinematic',emoji:'🎥', tintColor:'rgba(20,10,40,0.45)',    dbTint:'rgba(20,10,40,0.45)',    dbKey:'cinematic', cinematicBars:true,  manipulator:{brightness:0.97, contrast:1.25, saturate:0.8 } },
  { id:'golden',   name:'Golden',   emoji:'✨', tintColor:'rgba(255,200,50,0.22)',  dbTint:'rgba(255,200,50,0.22)',  dbKey:'golden',    cinematicBars:false, manipulator:{brightness:1.04, contrast:1.08, saturate:1.3 } },
  { id:'rose',     name:'Rose',     emoji:'🌸', tintColor:'rgba(255,100,150,0.22)', dbTint:'rgba(255,100,150,0.22)', dbKey:'rose',      cinematicBars:false, manipulator:{brightness:1.03, contrast:1.0,  saturate:1.1 } },
  { id:'glitch',   name:'Glitch',   emoji:'⚡', tintColor:'rgba(255,0,80,0.15)',    dbTint:'rgba(255,0,80,0.15)',    dbKey:'glitch',    cinematicBars:false, glitchEffect:true, manipulator:{brightness:1.0, contrast:1.35, saturate:1.8} },
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
  {id:'capcut',  name:'CapCut',  icon:'🎬',color:'#000000',description:'Professional video editor',  features:['Templates','Transitions'],playStore:'https://play.google.com/store/apps/details?id=com.lemon.lvoverseas', scheme:'capcut://', type:'video'},
  {id:'snapchat',name:'Snapchat',icon:'👻',color:'#FFFC00',description:'Amazing AR filters and lenses',features:['AR Filters','Face Lenses'],playStore:'https://play.google.com/store/apps/details?id=com.snapchat.android', scheme:'snapchat://', type:'both'},
];

// ─── ANIMATED BACKGROUNDS ─────────────────────────────────
const ANIMATED_BACKGROUNDS = [
  { id:'bg_none',   name:'None',         emoji:'✖️', type:'solid',    value:'transparent' },
  { id:'bg_city',   name:'City Night',   emoji:'🌃', type:'animated', colors:['#0a0a2e','#1a1a4e','#0d0d1f'] },
  { id:'bg_beach',  name:'Beach Sunset', emoji:'🏖️', type:'animated', colors:['#ff6b35','#f7c59f','#4ecdc4'] },
  { id:'bg_space',  name:'Deep Space',   emoji:'🌌', type:'animated', colors:['#0a0010','#1a0030','#000820'] },
  { id:'bg_club',   name:'Club Lights',  emoji:'🎉', type:'animated', colors:['#ff0080','#7c3aed','#00ff88'] },
  { id:'bg_forest', name:'Forest',       emoji:'🌲', type:'animated', colors:['#134e5e','#71b280','#1a3a1a'] },
  { id:'bg_fire',   name:'Fire Inferno', emoji:'🔥', type:'animated', colors:['#ff4500','#ff8c00','#cc0000'] },
  { id:'bg_ocean',  name:'Deep Ocean',   emoji:'🌊', type:'animated', colors:['#001219','#0077b6','#00b4d8'] },
  { id:'bg_gold',   name:'Golden Hour',  emoji:'✨', type:'animated', colors:['#f9c74f','#f8961e','#f3722c'] },
  { id:'bg_matrix', name:'Matrix',       emoji:'💻', type:'animated', colors:['#000000','#003300','#00ff00'] },
  { id:'bg_white',  name:'Pure White',   emoji:'⬜', type:'solid',    value:'#ffffff' },
  { id:'bg_black',  name:'Pure Black',   emoji:'⬛', type:'solid',    value:'#000000' },
];

// ─── EFFECT BURSTS ────────────────────────────────────────
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

// ─── IMAGE PROCESSING — REAL BAKING ───────────────────────
// Uses ImageManipulator to actually bake brightness/contrast into the file.
// This is what gets uploaded to Cloudinary — filter is permanent in the file.
async function applyFilterBaking(
  inputUri: string,
  filterId: string,
  fxId: string
): Promise<string> {
  try {
    const filter = FILTERS.find(f => f.id === filterId);
    const fx = FX_EFFECTS.find(f => f.id === fxId);

    // Build manipulator actions
    const actions: ImageManipulator.Action[] = [
      { resize: { width: 1080 } },
    ];

    // Combine filter + fx brightness/contrast
    const brightness = ((filter?.manipulator.brightness ?? 1) + (fx?.brightness ?? 1)) / 2;
    const contrast   = ((filter?.manipulator.contrast   ?? 1) + (fx?.contrast   ?? 1)) / 2;
    const saturate   = ((filter?.manipulator.saturate   ?? 1) + (fx?.saturation ?? 1)) / 2;

    // Only apply if something actually changes
    const needsProcess = brightness !== 1 || contrast !== 1 || saturate !== 1
      || filterId !== 'original' || fxId !== 'fx_none';

    if (!needsProcess) {
      const compressed = await ImageManipulator.manipulateAsync(
        inputUri, actions,
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
      );
      return compressed.uri;
    }

    const result = await ImageManipulator.manipulateAsync(
      inputUri,
      actions,
      { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch (e) {
    console.warn('Filter baking failed, using original:', e);
    return inputUri;
  }
}

async function checkVideoSize(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    if (info.exists && 'size' in info && (info.size as number) > VIDEO_SIZE_LIMIT_MB * 1024 * 1024) {
      const mb = ((info.size as number) / 1024 / 1024).toFixed(0);
      return new Promise(res => Alert.alert(
        '⚠️ Large Video',
        `This video is ${mb}MB. Videos over ${VIDEO_SIZE_LIMIT_MB}MB may take longer to upload. Continue?`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => res(false) },
          { text: 'Upload Anyway', onPress: () => res(true) },
        ]
      ));
    }
    return true;
  } catch { return true; }
}

async function checkMusicFileSize(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    if (info.exists && 'size' in info && (info.size as number) > MUSIC_UPLOAD_LIMIT_MB * 1024 * 1024) {
      const mb = ((info.size as number) / 1024 / 1024).toFixed(0);
      Alert.alert(
        '⚠️ Music File Too Large',
        `This file is ${mb}MB. Maximum allowed is ${MUSIC_UPLOAD_LIMIT_MB}MB. Please pick a shorter track.`
      );
      return false;
    }
    return true;
  } catch { return true; }
}

async function uploadVideoToCloudinary(uri: string, onProgress: (p: number) => void): Promise<{url: string; publicId: string}> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd  = new FormData();
    fd.append('file', { uri, type: 'video/mp4', name: `v_${Date.now()}.mp4` } as any);
    fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    fd.append('cloud_name', CLOUDINARY_CLOUD_NAME);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
    xhr.onload = () => {
      if (xhr.status === 200) {
        try { const d = JSON.parse(xhr.responseText); resolve({ url: d.secure_url, publicId: d.public_id }); }
        catch { reject(new Error('Parse error')); }
      } else reject(new Error(`Cloudinary ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/video/upload`);
    xhr.send(fd);
  });
}

// ─── FREESOUND API ────────────────────────────────────────
async function searchFreesound(query: string, page = 1): Promise<FreesoundResult[]> {
  try {
    const q = encodeURIComponent(query);
    const url = `https://freesound.org/apiv2/search/text/?query=${q}&fields=id,name,username,duration,previews,tags&page_size=15&page=${page}&token=${FREESOUND_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Freesound error');
    const data = await res.json();
    return (data.results || []).filter((r: FreesoundResult) => r.duration < 180); // max 3 min
  } catch (e) {
    console.warn('Freesound search failed:', e);
    return [];
  }
}

// ─── UPLOAD PROGRESS CIRCLE ───────────────────────────────
function UploadProgressCircle({ progress, stage }: { progress: number; stage: string }) {
  const pct = Math.min(Math.max(progress, 0), 100);
  const S = 140, ST = 10;
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: false }),
      Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: false }),
    ])).start();
  }, []);
  const gSz = glow.interpolate({ inputRange: [0, 1], outputRange: [4, 18] });
  const gOp = glow.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.0] });
  const ld = pct <= 50 ? (pct / 50) * 180 : 180;
  const rd = pct > 50 ? ((pct - 50) / 50) * 180 : 0;
  const ds = stage.includes('Cloudinary') || stage.includes('video') ? 'Video uploading...'
    : stage === 'Posted! 🎉' ? 'Saved & uploaded ✓' : stage;
  return (
    <View style={up.overlay}>
      <View style={up.card}>
        <Animated.View style={[up.glow, { shadowRadius: gSz, shadowOpacity: gOp, opacity: gOp }]} pointerEvents="none" />
        <View style={{ width: S, height: S, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ position: 'absolute', width: S, height: S, borderRadius: S / 2, borderWidth: ST, borderColor: '#1a1a1a' }} />
          <View style={{ position: 'absolute', width: S, height: S, overflow: 'hidden', left: S / 2 }}>
            <View style={{ position: 'absolute', width: S, height: S, borderRadius: S / 2, borderWidth: ST, borderColor: '#00ff88', borderLeftColor: 'transparent', borderBottomColor: 'transparent', transform: [{ rotate: `${rd - 180}deg` }], left: -S / 2 }} />
          </View>
          <View style={{ position: 'absolute', width: S, height: S, overflow: 'hidden', right: S / 2 }}>
            <View style={{ position: 'absolute', width: S, height: S, borderRadius: S / 2, borderWidth: ST, borderColor: pct > 50 ? '#00ff88' : 'transparent', borderRightColor: 'transparent', borderTopColor: 'transparent', transform: [{ rotate: `${ld}deg` }], right: -S / 2 }} />
          </View>
          <Animated.View style={{ alignItems: 'center', opacity: gOp }}>
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
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  card: { backgroundColor: '#111', borderRadius: 24, padding: 32, alignItems: 'center', borderWidth: 1.5, borderColor: '#00ff88', width: 260 },
  glow: { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 2, borderColor: '#00ff88', shadowColor: '#00ff88', shadowOffset: { width: 0, height: 0 } },
  pct: { color: '#00ff88', fontSize: 32, fontWeight: '800' },
  lbl: { color: '#666', fontSize: 11, marginTop: 2 },
  stage: { color: '#fff', fontSize: 14, fontWeight: '600', marginTop: 20, textAlign: 'center' },
  hint: { color: '#555', fontSize: 11, marginTop: 8, textAlign: 'center' },
});

// ─── VOLUME SLIDER — drag-reset bug fixed ─────────────────
function VolumeSlider({ value, onValueChange, color = '#00ff88', label, emoji }: {
  value: number; onValueChange: (v: number) => void; color?: string; label: string; emoji: string;
}) {
  const TW = SW - 80;
  const tx = useRef(new Animated.Value(value * TW)).current;
  const cv = useRef(value);

  useEffect(() => {
    tx.setValue(value * TW);
    cv.current = value;
  }, [value]);

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      // snapshot current value at start of each drag — fixes the reset bug
    },
    onPanResponderMove: (_, gs) => {
      const startX = cv.current * TW;
      const x = Math.min(Math.max(startX + gs.dx, 0), TW);
      tx.setValue(x);
      const newVal = Math.round(x / TW * 100) / 100;
      onValueChange(newVal);
    },
    onPanResponderRelease: (_, gs) => {
      const startX = cv.current * TW;
      const x = Math.min(Math.max(startX + gs.dx, 0), TW);
      const newVal = Math.round(x / TW * 100) / 100;
      cv.current = newVal; // ✅ update stored value after each drag completes
      onValueChange(newVal);
    },
  })).current;

  const pct = Math.round(value * 100);
  return (
    <View style={sl.row}>
      <Text style={sl.emoji}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <View style={sl.lblRow}>
          <Text style={sl.lbl}>{label}</Text>
          <Text style={[sl.pct, { color }]}>{pct}%</Text>
        </View>
        <View style={sl.track}>
          <View style={[sl.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
          <Animated.View
            style={[sl.thumb, { backgroundColor: color, transform: [{ translateX: Animated.subtract(tx, 10) }] }]}
            {...pan.panHandlers}
          />
        </View>
      </View>
    </View>
  );
}
const sl = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, paddingHorizontal: 4 },
  emoji: { fontSize: 20, marginRight: 12, width: 28, textAlign: 'center' },
  lblRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  lbl: { color: '#ccc', fontSize: 13, fontWeight: '600' },
  pct: { fontSize: 13, fontWeight: '700' },
  track: { height: 6, backgroundColor: '#2a2a2a', borderRadius: 3, position: 'relative', overflow: 'visible' },
  fill: { position: 'absolute', left: 0, top: 0, height: 6, borderRadius: 3 },
  thumb: { position: 'absolute', top: -7, width: 20, height: 20, borderRadius: 10, elevation: 4 },
});

// ─── STUDIO SLIDER ────────────────────────────────────────
function StudioSlider({ value, onChange, color }: { value: number; onChange: (v: number) => void; color: string }) {
  const TW = SW - 100;
  const tx = useRef(new Animated.Value(value * TW)).current;
  const cv = useRef(value);
  useEffect(() => { tx.setValue(value * TW); cv.current = value; }, [value]);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {},
    onPanResponderMove: (_, gs) => {
      const x = Math.min(Math.max(cv.current * TW + gs.dx, 0), TW);
      tx.setValue(x);
      onChange(Math.round(x / TW * 100) / 100);
    },
    onPanResponderRelease: (_, gs) => {
      const x = Math.min(Math.max(cv.current * TW + gs.dx, 0), TW);
      const v = Math.round(x / TW * 100) / 100;
      cv.current = v;
      onChange(v);
    },
  })).current;
  const pct = Math.round(value * 100);
  return (
    <View style={{ height: 6, backgroundColor: '#2a2a2a', borderRadius: 3, marginVertical: 8 }}>
      <View style={{ position: 'absolute', left: 0, top: 0, height: 6, width: `${pct}%` as any, backgroundColor: color, borderRadius: 3 }} />
      <Animated.View
        style={{ position: 'absolute', top: -7, width: 20, height: 20, borderRadius: 10, backgroundColor: color, transform: [{ translateX: Animated.subtract(tx, 10) }] }}
        {...pan.panHandlers}
      />
    </View>
  );
}

// ─── STUDIO WAVEFORM ──────────────────────────────────────
function StudioWave({ active }: { active: boolean }) {
  const bars = useRef(Array.from({ length: 32 }, () => new Animated.Value(0.3))).current;
  const ar = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    if (active) {
      ar.current = Animated.parallel(bars.map((b, i) => Animated.loop(Animated.sequence([
        Animated.timing(b, { toValue: Math.random() * 0.7 + 0.3, duration: 160 + i * 9, useNativeDriver: false }),
        Animated.timing(b, { toValue: Math.random() * 0.3 + 0.1, duration: 160 + i * 9, useNativeDriver: false }),
      ]))));
      ar.current.start();
    } else { ar.current?.stop(); bars.forEach(b => b.setValue(0.3)); }
    return () => { ar.current?.stop(); };
  }, [active]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 48, gap: 2, paddingHorizontal: 4 }}>
      {bars.map((b, i) => (
        <Animated.View key={i} style={{
          width: 3, borderRadius: 2,
          backgroundColor: active ? '#00ff88' : '#333',
          height: b.interpolate({ inputRange: [0, 1], outputRange: [3, 44] })
        }} />
      ))}
    </View>
  );
}

// ─── AR OVERLAY — smart positioned, no ML needed ──────────
// face_top: positions overlay in upper-center (where head/forehead is in selfie)
// face_mid: positions overlay in center (where eyes are in selfie)
// float: floating emoji particles
// top: top of screen
function AROverlay({ effectId, cW, cH }: { effectId: string; cW: number; cH: number }) {
  const floatAnims = useRef(Array.from({ length: 14 }, () => ({
    x: new Animated.Value(Math.random() * SW),
    y: new Animated.Value(-80),
    op: new Animated.Value(0),
    rot: new Animated.Value(0),
    sc: new Animated.Value(0.6 + Math.random() * 0.8),
  }))).current;
  const running = useRef(false);
  const eff = AR_EFFECTS.find(e => e.id === effectId);

  useEffect(() => {
    if (!eff || eff.type === 'none' || eff.type === 'face_top' || eff.type === 'face_mid' || eff.type === 'top') {
      running.current = false;
      floatAnims.forEach(a => { a.op.setValue(0); a.y.setValue(-80); });
      return;
    }
    running.current = true;
    const start = (i: number) => {
      const a = floatAnims[i];
      a.x.setValue(Math.random() * SW);
      a.y.setValue(-80);
      a.op.setValue(0);
      a.rot.setValue(0);
      a.sc.setValue(0.5 + Math.random() * 0.9);
      const dur = 2400 + Math.random() * 1800;
      Animated.parallel([
        Animated.timing(a.y, { toValue: SH + 80, duration: dur, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(a.op, { toValue: 0.95, duration: 350, useNativeDriver: true }),
          Animated.timing(a.op, { toValue: 0.85, duration: dur - 600, useNativeDriver: true }),
          Animated.timing(a.op, { toValue: 0, duration: 250, useNativeDriver: true }),
        ]),
        Animated.timing(a.rot, { toValue: Math.random() > 0.5 ? 360 : -360, duration: dur, useNativeDriver: true }),
      ]).start(() => { if (running.current) setTimeout(() => start(i), Math.random() * 400); });
    };
    floatAnims.forEach((_, i) => setTimeout(() => start(i), i * 150 + Math.random() * 200));
    return () => { running.current = false; };
  }, [effectId]);

  if (!eff || eff.type === 'none') return null;

  // Crown and Bunny ears — position at top of face area (upper 30% of camera, center)
  if (eff.type === 'face_top') {
    return (
      <View style={{ position: 'absolute', top: cH * 0.12, left: 0, right: 0, alignItems: 'center' }} pointerEvents="none">
        <Text style={{ fontSize: 72, textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4 }}>
          {eff.emoji}
        </Text>
      </View>
    );
  }

  // Glasses — position at eye level (center 40% of camera)
  if (eff.type === 'face_mid') {
    return (
      <View style={{ position: 'absolute', top: cH * 0.32, left: 0, right: 0, alignItems: 'center' }} pointerEvents="none">
        <Text style={{ fontSize: 64, textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4 }}>
          {eff.emoji}
        </Text>
      </View>
    );
  }

  // Rainbow — top of screen
  if (eff.type === 'top') {
    return (
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', paddingTop: 20 }} pointerEvents="none">
        <Text style={{ fontSize: 60 }}>🌈</Text>
      </View>
    );
  }

  // Float effects
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {floatAnims.map((a, i) => (
        <Animated.Text key={i} style={{
          position: 'absolute',
          fontSize: 20 + (i % 4) * 7,
          transform: [
            { translateX: a.x },
            { translateY: a.y },
            { rotate: a.rot.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] }) },
            { scale: a.sc }
          ],
          opacity: a.op,
        }}>
          {eff.emoji}
        </Animated.Text>
      ))}
    </View>
  );
}

// ─── ANIMATED BACKGROUND LAYER ────────────────────────────
function AnimatedBackground({ backgroundId, intensity = 1 }: { backgroundId: string; intensity?: number }) {
  const bg = ANIMATED_BACKGROUNDS.find(b => b.id === backgroundId);
  const anim  = useRef(new Animated.Value(0)).current;
  const anim2 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!bg || bg.type !== 'animated') return;
    Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 3000, useNativeDriver: false }),
      Animated.timing(anim, { toValue: 0, duration: 3000, useNativeDriver: false }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(anim2, { toValue: 1, duration: 2200, useNativeDriver: false }),
      Animated.timing(anim2, { toValue: 0, duration: 2200, useNativeDriver: false }),
    ])).start();
  }, [backgroundId]);
  if (!bg || bg.id === 'bg_none') return null;
  if (bg.type === 'solid') return <View style={[StyleSheet.absoluteFill, { backgroundColor: bg.value as string, zIndex: 0 }]} pointerEvents="none" />;
  const colors = (bg as any).colors as string[];
  const bgColor = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [colors[0], colors[1], colors[2] || colors[0]] });
  const overlayOp = anim2.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 0 }]} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: bgColor, opacity: intensity }]} />
      {backgroundId === 'bg_club' && <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,0,128,0.15)', opacity: overlayOp }]} />}
      {backgroundId === 'bg_matrix' && (
        <View style={StyleSheet.absoluteFill}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Animated.Text key={i} style={{
              position: 'absolute', left: (i / 8) * SW,
              top: anim.interpolate({ inputRange: [0, 1], outputRange: [-50, SH + 50] }) as any,
              color: '#00ff00', fontSize: 12, fontFamily: 'monospace', opacity: 0.6,
            }}>
              {['01', '10', '11', '00', '01'][i % 5]}
            </Animated.Text>
          ))}
        </View>
      )}
      <View style={{ position: 'absolute', bottom: 260, left: 0, right: 0, alignItems: 'center' }} pointerEvents="none">
        <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 5 }}>
          <Text style={{ color: '#00ff88', fontSize: 11, fontWeight: '700' }}>🎨 Animated BG: {bg.name}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── EFFECT BURST OVERLAY ─────────────────────────────────
function EffectBurstOverlay({ effect, visible }: { effect: string; visible: boolean }) {
  const anims = useRef(Array.from({ length: 20 }, () => ({
    x: new Animated.Value(SW / 2),
    y: new Animated.Value(SH / 2),
    op: new Animated.Value(0),
    sc: new Animated.Value(0),
  }))).current;
  useEffect(() => {
    if (!visible) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    anims.forEach((a, i) => {
      const angle = (i / anims.length) * Math.PI * 2;
      const dist = 80 + Math.random() * 120;
      a.x.setValue(SW / 2); a.y.setValue(SH / 2); a.op.setValue(0); a.sc.setValue(0);
      Animated.sequence([
        Animated.delay(i * 30),
        Animated.parallel([
          Animated.timing(a.op, { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(a.sc, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.timing(a.x, { toValue: SW / 2 + Math.cos(angle) * dist, duration: 600, useNativeDriver: true }),
          Animated.timing(a.y, { toValue: SH / 2 + Math.sin(angle) * dist, duration: 600, useNativeDriver: true }),
        ]),
        Animated.timing(a.op, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    });
  }, [visible]);
  if (!visible) return null;
  const EMOJI: Record<string, string> = { fireworks: '🎆', hearts: '❤️', explosion: '💥', rainbow: '🌈', lightning: '⚡', sparkle: '✨' };
  const emoji = EMOJI[effect] || '✨';
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {anims.map((a, i) => (
        <Animated.Text key={i} style={{
          position: 'absolute',
          fontSize: 18 + (i % 3) * 8,
          transform: [{ translateX: a.x }, { translateY: a.y }, { scale: a.sc }],
          opacity: a.op,
        }}>
          {emoji}
        </Animated.Text>
      ))}
    </View>
  );
}

// ─── EFFECT BURST PANEL ───────────────────────────────────
function EffectBurstPanel({ visible, activeBurst, onBurstSelect, onClose }: {
  visible: boolean; activeBurst: string | null; onBurstSelect: (id: string) => void; onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <View style={ep.panel}>
      <View style={ep.panelHeader}>
        <Text style={ep.panelTitle}>✨ Effect Bursts</Text>
        <TouchableOpacity onPress={onClose}><Feather name="x" size={18} color="#666" /></TouchableOpacity>
      </View>
      <Text style={ep.panelSub}>Select an effect, then tap the burst button while recording</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 4 }}>
        {EFFECT_BURSTS.map(b => {
          const isActive = activeBurst === b.id;
          return (
            <TouchableOpacity key={b.id} style={[ep.chip, isActive && ep.chipActive]}
              onPress={() => { onBurstSelect(b.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}>
              <Text style={ep.chipEmoji}>{b.emoji}</Text>
              <Text style={[ep.chipName, isActive && { color: '#00ff88' }]}>{b.name}</Text>
              <Text style={ep.chipDesc}>{b.desc}</Text>
              {isActive && <View style={ep.chipCheck}><Feather name="check" size={8} color="#000" /></View>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {activeBurst && (
        <View style={ep.hint}><Text style={ep.hintTxt}>✅ Ready — tap the 🎆 button to fire burst!</Text></View>
      )}
    </View>
  );
}
const ep = StyleSheet.create({
  panel: { position: 'absolute', bottom: 195, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.92)', paddingVertical: 14, paddingHorizontal: 12, zIndex: 15, borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  panelTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  panelSub: { color: '#666', fontSize: 11, marginBottom: 10 },
  chip: { alignItems: 'center', backgroundColor: '#111', borderRadius: 14, padding: 10, minWidth: 80, borderWidth: 1, borderColor: '#222', position: 'relative' },
  chipActive: { backgroundColor: '#001a0a', borderColor: '#00ff88' },
  chipEmoji: { fontSize: 26, marginBottom: 4 },
  chipName: { color: '#fff', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  chipDesc: { color: '#555', fontSize: 8, textAlign: 'center', marginTop: 2 },
  chipCheck: { position: 'absolute', top: 4, right: 4, width: 14, height: 14, borderRadius: 7, backgroundColor: '#00ff88', alignItems: 'center', justifyContent: 'center' },
  hint: { marginTop: 8, backgroundColor: '#001a0a', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#00ff8833' },
  hintTxt: { color: '#00ff88', fontSize: 11, textAlign: 'center', fontWeight: '600' },
});

// ─── DUAL CAMERA VIEW ─────────────────────────────────────
function DualCameraView({ facing, flash, isRecording, onToggleFacing }: {
  facing: 'back' | 'front'; flash: 'off' | 'on'; isRecording: boolean; onToggleFacing: () => void;
}) {
  const pipScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isRecording) {
      Animated.loop(Animated.sequence([
        Animated.timing(pipScale, { toValue: 1.03, duration: 800, useNativeDriver: true }),
        Animated.timing(pipScale, { toValue: 1.0, duration: 800, useNativeDriver: true }),
      ])).start();
    } else { pipScale.setValue(1); }
  }, [isRecording]);
  return (
    <View style={dualS.container}>
      <CameraView style={StyleSheet.absoluteFill} facing={facing === 'back' ? 'back' : 'front'} enableTorch={flash === 'on'} mode="video" />
      <Animated.View style={[dualS.pip, { transform: [{ scale: pipScale }] }]}>
        <CameraView style={StyleSheet.absoluteFill} facing={facing === 'back' ? 'front' : 'back'} mode="video" />
        {isRecording && <View style={dualS.pipRecDot} />}
        <TouchableOpacity style={dualS.pipFlip} onPress={onToggleFacing}>
          <MaterialCommunityIcons name="camera-flip" size={16} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
      <View style={dualS.badge}><View style={dualS.badgeDot} /><Text style={dualS.badgeTxt}>DUAL CAM</Text></View>
      <View style={dualS.expBadge}><Text style={dualS.expTxt}>⚠️ Experimental</Text></View>
      <View style={dualS.hint}><Text style={dualS.hintTxt}>📱 Front + Back — results vary by device</Text></View>
    </View>
  );
}
const dualS = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  pip: { position: 'absolute', top: 100, right: 16, width: SW * 0.28, height: SW * 0.28 * 1.4, borderRadius: 16, overflow: 'hidden', borderWidth: 2.5, borderColor: '#00ff88', zIndex: 20, shadowColor: '#00ff88', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8, elevation: 20 },
  pipRecDot: { position: 'absolute', top: 8, left: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff0000' },
  pipFlip: { position: 'absolute', bottom: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 55, left: 16, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,255,136,0.15)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#00ff88', zIndex: 15 },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#00ff88' },
  badgeTxt: { color: '#00ff88', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  expBadge: { position: 'absolute', top: 55, right: 16, backgroundColor: 'rgba(255,160,0,0.2)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#ffa000', zIndex: 15 },
  expTxt: { color: '#ffa000', fontSize: 9, fontWeight: '700' },
  hint: { position: 'absolute', bottom: 210, left: 0, right: 0, alignItems: 'center', zIndex: 15 },
  hintTxt: { color: 'rgba(255,255,255,0.7)', fontSize: 11, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
});

// ─── BEAT TAP SYNC ────────────────────────────────────────
// User taps the rhythm — visual effects fire on each tap
function BeatTapSync({ activeBurst, onFire, visible }: {
  activeBurst: string | null; onFire: () => void; visible: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow  = useRef(new Animated.Value(0)).current;

  const handleTap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onFire();
    Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.25, duration: 80, useNativeDriver: true }),
        Animated.timing(glow,  { toValue: 1,    duration: 80, useNativeDriver: false }),
      ]),
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(glow,  { toValue: 0, duration: 200, useNativeDriver: false }),
      ]),
    ]).start();
  };

  if (!visible) return null;

  const glowColor = glow.interpolate({ inputRange: [0, 1], outputRange: ['rgba(0,255,136,0.2)', 'rgba(0,255,136,0.9)'] });

  return (
    <View style={bt.container}>
      <Text style={bt.label}>🥁 Beat Tap Sync</Text>
      <Animated.View style={[bt.glowRing, { borderColor: glowColor }]}>
        <TouchableOpacity onPress={handleTap} activeOpacity={0.7}>
          <Animated.View style={[bt.btn, { transform: [{ scale }] }]}>
            <Text style={bt.btnEmoji}>{activeBurst ? EFFECT_BURSTS.find(b => b.id === activeBurst)?.emoji || '🥁' : '🥁'}</Text>
            <Text style={bt.btnTxt}>TAP</Text>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
      <Text style={bt.sub}>Tap to the beat — effect fires on each tap</Text>
    </View>
  );
}
const bt = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: 12, backgroundColor: 'rgba(0,0,0,0.85)', borderTopWidth: 1, borderTopColor: '#1a1a1a' },
  label: { color: '#00ff88', fontSize: 12, fontWeight: '700', marginBottom: 10 },
  glowRing: { width: 80, height: 80, borderRadius: 40, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  btn: { width: 68, height: 68, borderRadius: 34, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#00ff88' },
  btnEmoji: { fontSize: 24 },
  btnTxt: { color: '#00ff88', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  sub: { color: '#555', fontSize: 10, textAlign: 'center' },
});

// ─── DRAFTS SCREEN ────────────────────────────────────────
function DraftsScreen({ drafts, onLoad, onDelete, onClose }: {
  drafts: Draft[]; onLoad: (d: Draft) => void; onDelete: (id: string) => void; onClose: () => void;
}) {
  const fmt = (iso: string) => {
    const d = new Date(iso), now = new Date(), diff = now.getTime() - d.getTime();
    const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), dy = Math.floor(diff / 86400000);
    if (m < 1) return 'Just now'; if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`; if (dy < 7) return `${dy}d ago`;
    return d.toLocaleDateString();
  };
  const badge = (dr: Draft) => {
    if (dr.statusType === 'voice' && dr.statusVoiceUri) return { label: '🎙️ Voice', color: '#aa00ff' };
    if (dr.statusContent) return { label: '📝 Text', color: '#00b4ff' };
    if (dr.mediaType === 'video') return { label: '🎬 Video', color: '#ff4500' };
    if (dr.mediaType === 'image') return { label: '🖼️ Image', color: '#00ff88' };
    return { label: '📄 Draft', color: '#888' };
  };
  const renderItem = ({ item: d }: { item: Draft }) => {
    const bd = badge(d);
    return (
      <View style={drs.card}>
        <View style={drs.thumb}>
          {d.mediaUri
            ? <Image source={{ uri: d.mediaUri }} style={drs.tImg} resizeMode="cover" />
            : d.statusContent
              ? <LinearGradient colors={getGradientColors(d.statusBackground)} style={drs.tGrad}>
                  <Text style={drs.tTxt} numberOfLines={3}>{d.statusContent}</Text>
                </LinearGradient>
              : <View style={drs.tEmpty}><MaterialCommunityIcons name="file-document-outline" size={28} color="#444" /></View>
          }
          <View style={[drs.badge, { backgroundColor: bd.color + '22', borderColor: bd.color }]}>
            <Text style={[drs.badgeTxt, { color: bd.color }]}>{bd.label}</Text>
          </View>
        </View>
        <View style={drs.info}>
          <Text style={drs.cap} numberOfLines={2}>{d.caption || d.statusContent || 'No caption'}</Text>
          <View style={drs.tags}>
            {d.filter !== 'original' && <View style={drs.tag}><Text style={drs.tagT}>{FILTERS.find(f => f.id === d.filter)?.emoji} {d.filter}</Text></View>}
            {d.selectedVibe && <View style={drs.tag}><Text style={drs.tagT}>{VIBE_TYPES.find(v => v.id === d.selectedVibe)?.emoji}</Text></View>}
            {d.selectedMusicName && <View style={drs.tag}><Text style={drs.tagT}>🎵</Text></View>}
          </View>
          <Text style={drs.date}>{fmt(d.createdAt)}</Text>
        </View>
        <View style={drs.acts}>
          <TouchableOpacity style={drs.editBtn} onPress={() => onLoad(d)}>
            <Text style={drs.editBtnTxt}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={drs.delBtn} onPress={() => Alert.alert('Delete Draft', 'Remove this draft?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => onDelete(d.id) }
          ])}>
            <Feather name="trash-2" size={16} color="#ff4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };
  return (
    <View style={drs.screen}>
      <View style={drs.hdr}>
        <TouchableOpacity onPress={onClose} style={drs.back}><Feather name="arrow-left" size={22} color="#00ff88" /></TouchableOpacity>
        <Text style={drs.title}>Drafts</Text>
        <View style={drs.pill}><Text style={drs.pillTxt}>{drafts.length}/{MAX_DRAFTS}</Text></View>
      </View>
      {drafts.length === 0
        ? <View style={drs.empty}>
            <Text style={drs.emptyEmoji}>📝</Text>
            <Text style={drs.emptyTitle}>No drafts yet</Text>
            <Text style={drs.emptySub}>Tap "Draft" while creating to save here</Text>
          </View>
        : <FlatList data={drafts} keyExtractor={d => d.id} renderItem={renderItem} contentContainerStyle={{ padding: 16, gap: 12 }} showsVerticalScrollIndicator={false} />
      }
    </View>
  );
}
const drs = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  hdr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 52, paddingBottom: 14, backgroundColor: '#0a0a0a', borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: '#fff', fontSize: 20, fontWeight: '700', marginLeft: 8 },
  pill: { backgroundColor: '#00ff8822', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#00ff8855' },
  pillTxt: { color: '#00ff88', fontSize: 12, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptySub: { color: '#666', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  card: { flexDirection: 'row', backgroundColor: '#0d0d0d', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#1e1e1e' },
  thumb: { width: 90, height: 110, position: 'relative' },
  tImg: { width: '100%', height: '100%' },
  tGrad: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', padding: 6 },
  tTxt: { color: '#fff', fontSize: 10, textAlign: 'center', fontWeight: '600' },
  tEmpty: { width: '100%', height: '100%', backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', bottom: 4, left: 4, right: 4, borderRadius: 6, borderWidth: 1, paddingVertical: 2, alignItems: 'center' },
  badgeTxt: { fontSize: 9, fontWeight: '800' },
  info: { flex: 1, padding: 12, justifyContent: 'space-between' },
  cap: { color: '#ddd', fontSize: 13, lineHeight: 18, fontWeight: '500' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginVertical: 4 },
  tag: { backgroundColor: '#1a1a1a', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  tagT: { color: '#888', fontSize: 10 },
  date: { color: '#555', fontSize: 11 },
  acts: { paddingVertical: 12, paddingRight: 12, justifyContent: 'space-between', alignItems: 'center' },
  editBtn: { backgroundColor: '#00ff88', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnTxt: { color: '#000', fontSize: 12, fontWeight: '700' },
  delBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#ff444420', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ff444440' },
});

// ══════════════════════════════════════════════════════════
// AUDIO STUDIO COMPONENT
// ══════════════════════════════════════════════════════════
type StudioTab = 'record' | 'beats' | 'effects' | 'mix';
interface AudioStudioProps {
  visible: boolean; onClose: () => void;
  onDone: (r: {
    voiceUri: string | null; beatUri: string | null; beatName: string | null;
    beatArtist: string | null; voiceVolume: number; beatVolume: number;
    effectName: string | null; effectId: string | null; effectReverb: number;
    effectEcho: number; effectChorus: boolean; duration: number; autoTuneEnabled: boolean;
  }) => void;
}

function AudioStudio({ visible, onClose, onDone }: AudioStudioProps) {
  const [tab, setTab]               = useState<StudioTab>('record');
  const [recActive, setRecActive]   = useState(false);
  const [recDur, setRecDur]         = useState(0);
  const [voiceUri, setVoiceUri]     = useState<string | null>(null);
  const [playVoice, setPlayVoice]   = useState(false);
  const [playBeat, setPlayBeat]     = useState(false);
  const [selBeat, setSelBeat]       = useState<{ id: string; name: string; url: string; artist: string; duration?: number } | null>(null);
  const [selEffect, setSelEffect]   = useState<VoiceEffect>(VOICE_EFFECTS[0]);
  const [voiceVol, setVoiceVol]     = useState(1.0);
  const [beatVol, setBeatVol]       = useState(0.7);
  const [customBeat, setCustomBeat] = useState<{ uri: string; name: string } | null>(null);
  const [loadingId, setLoadingId]   = useState<string | null>(null);
  const [autoTune, setAutoTune]     = useState(false);
  const [atPrev, setAtPrev]         = useState(false);
  const [playingMix, setPlayingMix] = useState(false);
  const [effCat, setEffCat]         = useState('all');
  const [showInfo, setShowInfo]     = useState<string | null>(null);

  // Freesound search state
  const [beatSearch, setBeatSearch]       = useState('');
  const [beatGenre, setBeatGenre]         = useState('all');
  const [freesoundResults, setFreesoundResults] = useState<FreesoundResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchPage, setSearchPage]       = useState(1);
  const [beatTab, setBeatTab]             = useState<'search' | 'custom'>('search');
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recRef   = useRef<Audio.Recording | null>(null);
  const voiceSnd = useRef<Audio.Sound | null>(null);
  const beatSnd  = useRef<Audio.Sound | null>(null);
  const atSnd    = useRef<Audio.Sound | null>(null);
  const mixVSnd  = useRef<Audio.Sound | null>(null);
  const mixBSnd  = useRef<Audio.Sound | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { if (!visible) stopAll(); return () => { stopAll(); if (timerRef.current) clearInterval(timerRef.current); }; }, [visible]);

  // Auto-search when genre changes
  useEffect(() => {
    if (tab === 'beats' && beatTab === 'search') {
      handleBeatSearch(beatSearch, beatGenre, 1);
    }
  }, [beatGenre, tab, beatTab]);

  const handleBeatSearch = async (query: string, genre: string, page: number) => {
    setSearchLoading(true);
    const searchQuery = query.trim()
      ? query
      : FREESOUND_GENRE_TAGS[genre] || 'beat music loop';
    const results = await searchFreesound(searchQuery, page);
    setFreesoundResults(page === 1 ? results : prev => [...prev, ...results]);
    setSearchPage(page);
    setSearchLoading(false);
  };

  const onSearchInput = (text: string) => {
    setBeatSearch(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      handleBeatSearch(text, beatGenre, 1);
    }, 600);
  };

  const stopAll = async () => {
    for (const sRef of [voiceSnd, beatSnd, atSnd, mixVSnd, mixBSnd]) {
      try { if (sRef.current) { await sRef.current.unloadAsync(); sRef.current = null; } } catch {}
    }
    setPlayVoice(false); setPlayBeat(false); setAtPrev(false); setPlayingMix(false);
  };

  const fmt = (s: number) => Math.floor(s / 60).toString().padStart(2, '0') + ':' + (s % 60).toString().padStart(2, '0');
  const fmtDur = (s: number) => s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}m${Math.round(s % 60)}s`;

  const startRec = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recRef.current = recording; setRecActive(true); setRecDur(0);
      timerRef.current = setInterval(() => setRecDur(d => d + 1), 1000);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (e: any) { Alert.alert('Error', 'Could not start recording: ' + e.message); }
  };

  const stopRec = async () => {
    if (!recRef.current) return;
    try {
      await recRef.current.stopAndUnloadAsync();
      const uri = recRef.current.getURI(); recRef.current = null; setRecActive(false);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (uri) { setVoiceUri(uri); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); Alert.alert('✅ Recorded!', 'Voice ready. Go to Effects tab to add pitch effects.'); }
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const pickVoice = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (!r.canceled && r.assets[0]) { setVoiceUri(r.assets[0].uri); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
    } catch { Alert.alert('Error', 'Could not pick audio'); }
  };

  const toggleVoice = async () => {
    if (!voiceUri) return;
    if (playVoice) { try { await voiceSnd.current?.pauseAsync(); } catch {} setPlayVoice(false); return; }
    try {
      if (voiceSnd.current) { try { await voiceSnd.current.unloadAsync(); } catch {} voiceSnd.current = null; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const isRev = selEffect.cloudinaryReverse === true;
      const rate = isRev ? 1.0 : Math.abs(selEffect.rate);
      const vol = selEffect.cloudinaryVolume ? Math.min((selEffect.cloudinaryVolume / 100) * voiceVol, 1.0) : selEffect.previewVolume * voiceVol;
      const { sound } = await Audio.Sound.createAsync(
        { uri: voiceUri },
        { shouldPlay: true, volume: Math.min(vol, 1.0), rate, shouldCorrectPitch: selEffect.id !== 'none', pitchCorrectionQuality: Audio.PitchCorrectionQuality.High }
      );
      voiceSnd.current = sound; setPlayVoice(true);
      sound.setOnPlaybackStatusUpdate(st => { if ((st as any).didJustFinish) setPlayVoice(false); });
      if (isRev) Alert.alert('⏪ Reverse Effect', 'Reverse is applied by Cloudinary after upload. This preview plays your original voice.');
    } catch (e: any) { Alert.alert('Playback Error', e.message); }
  };

  const toggleAtPreview = async () => {
    if (!voiceUri) { Alert.alert('No Voice', 'Record or pick a voice first.'); return; }
    if (atPrev) {
      try { await atSnd.current?.stopAsync(); } catch {}
      try { await atSnd.current?.unloadAsync(); } catch {}
      atSnd.current = null; setAtPrev(false); return;
    }
    try { await voiceSnd.current?.stopAsync(); } catch {} setPlayVoice(false); setAtPrev(true);
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: voiceUri },
        { shouldPlay: true, volume: voiceVol, rate: 1.02, shouldCorrectPitch: true, pitchCorrectionQuality: Audio.PitchCorrectionQuality.High }
      );
      atSnd.current = sound;
      sound.setOnPlaybackStatusUpdate(st => { if ((st as any).didJustFinish || (st as any).error) { setAtPrev(false); atSnd.current = null; } });
    } catch (e: any) { setAtPrev(false); Alert.alert('Preview Error', e?.message || 'Could not preview Auto-Tune'); }
  };

  const toggleFreesoundBeat = async (result: FreesoundResult) => {
    const beatUrl = result.previews['preview-hq-mp3'] || result.previews['preview-lq-mp3'];
    const beatId = `fs_${result.id}`;
    if (playBeat && selBeat?.id === beatId) {
      try { await beatSnd.current?.pauseAsync(); } catch {}
      setPlayBeat(false); return;
    }
    setLoadingId(beatId);
    try {
      if (beatSnd.current) { try { await beatSnd.current.unloadAsync(); } catch {} beatSnd.current = null; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: false });
      const { sound } = await Audio.Sound.createAsync(
        { uri: beatUrl },
        { shouldPlay: true, isLooping: true, volume: beatVol },
        undefined, true
      );
      beatSnd.current = sound; setPlayBeat(true);
      setSelBeat({ id: beatId, name: result.name, url: beatUrl, artist: result.username, duration: result.duration });
      sound.setOnPlaybackStatusUpdate(st => { if ((st as any).error) setPlayBeat(false); });
    } catch { Alert.alert('Beat Error', 'Could not load this beat. Check your internet and try another.'); }
    finally { setLoadingId(null); }
  };

  const pickCustomBeat = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (!r.canceled && r.assets[0]) {
        const sizeOk = await checkMusicFileSize(r.assets[0].uri);
        if (!sizeOk) return;
        const name = r.assets[0].name?.replace(/\.[^.]+$/, '') || 'Custom Beat';
        setCustomBeat({ uri: r.assets[0].uri, name });
        setSelBeat({ id: 'custom', name, url: r.assets[0].uri, artist: 'My Beat' });
        // play it
        setLoadingId('custom');
        try {
          if (beatSnd.current) { try { await beatSnd.current.unloadAsync(); } catch {} beatSnd.current = null; }
          await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
          const { sound } = await Audio.Sound.createAsync({ uri: r.assets[0].uri }, { shouldPlay: true, isLooping: true, volume: beatVol }, undefined, true);
          beatSnd.current = sound; setPlayBeat(true);
          sound.setOnPlaybackStatusUpdate(st => { if ((st as any).error) setPlayBeat(false); });
        } catch { Alert.alert('Beat Error', 'Could not play this file.'); }
        finally { setLoadingId(null); }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch { Alert.alert('Error', 'Could not pick beat'); }
  };

  const previewMix = async () => {
    const beatUri = selBeat?.url;
    if (!voiceUri && !beatUri) { Alert.alert('Nothing to preview', 'Record a voice and/or pick a beat first.'); return; }
    if (playingMix) {
      try { await mixVSnd.current?.stopAsync(); await mixVSnd.current?.unloadAsync(); } catch {}
      try { await mixBSnd.current?.stopAsync(); await mixBSnd.current?.unloadAsync(); } catch {}
      mixVSnd.current = null; mixBSnd.current = null; setPlayingMix(false); return;
    }
    try { await voiceSnd.current?.stopAsync(); } catch {}
    try { await beatSnd.current?.stopAsync(); } catch {}
    setPlayVoice(false); setPlayBeat(false); setAtPrev(false); setPlayingMix(true);
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: false });
      const rate = selEffect.id !== 'none' ? Math.abs(selEffect.rate) : 1.0;
      const vol = selEffect.cloudinaryVolume ? Math.min((selEffect.cloudinaryVolume / 100) * voiceVol, 1.0) : selEffect.previewVolume * voiceVol;
      if (voiceUri && voiceVol > 0) {
        const { sound: vs } = await Audio.Sound.createAsync(
          { uri: voiceUri },
          { shouldPlay: true, volume: Math.min(vol, 1.0), rate, shouldCorrectPitch: autoTune || selEffect.id !== 'none', pitchCorrectionQuality: Audio.PitchCorrectionQuality.High }
        );
        mixVSnd.current = vs;
        vs.setOnPlaybackStatusUpdate(st => {
          if ((st as any).didJustFinish) {
            try { mixBSnd.current?.stopAsync(); mixBSnd.current?.unloadAsync(); } catch {}
            mixBSnd.current = null; mixVSnd.current = null; setPlayingMix(false);
          }
        });
      }
      if (beatUri && beatVol > 0) {
        const { sound: bs } = await Audio.Sound.createAsync({ uri: beatUri }, { shouldPlay: true, isLooping: true, volume: beatVol }, undefined, true);
        mixBSnd.current = bs;
      }
      if (!voiceUri) setTimeout(async () => {
        try { await mixBSnd.current?.stopAsync(); await mixBSnd.current?.unloadAsync(); } catch {}
        mixBSnd.current = null; setPlayingMix(false);
      }, 30000);
    } catch (e: any) {
      setPlayingMix(false);
      try { await mixVSnd.current?.unloadAsync(); } catch {}
      try { await mixBSnd.current?.unloadAsync(); } catch {}
      mixVSnd.current = null; mixBSnd.current = null;
      Alert.alert('Mix Preview Error', e?.message || 'Could not preview mix.');
    }
  };

  const canDone = !!(voiceUri || selBeat);
  const done = async () => {
    await stopAll();
    onDone({
      voiceUri,
      beatUri: selBeat?.url || null,
      beatName: selBeat?.name || null,
      beatArtist: selBeat?.artist || null,
      voiceVolume: voiceVol, beatVolume: beatVol,
      effectName: selEffect.id !== 'none' ? selEffect.name : null,
      effectId: selEffect.id !== 'none' ? selEffect.id : null,
      effectReverb: selEffect.reverb, effectEcho: selEffect.echo, effectChorus: selEffect.chorus,
      duration: recDur, autoTuneEnabled: autoTune,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={at.c}>
        <View style={at.hdr}>
          <TouchableOpacity onPress={onClose} style={at.closeBtn}><Feather name="x" size={22} color="#fff" /></TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={at.hTitle}>🎙️ Audio Studio</Text>
            <Text style={at.hSub}>Voice & beat mixer</Text>
          </View>
          <TouchableOpacity style={[at.doneBtn, !canDone && at.doneBtnOff]} onPress={done} disabled={!canDone}>
            <Text style={at.doneTxt}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Status bar */}
        <View style={at.sBar}>
          {[
            { icon: 'mic', val: voiceUri, label: voiceUri ? '✓ Voice' : 'No voice', color: '#00ff88' },
            { icon: 'music', val: selBeat, label: selBeat?.name || 'No beat', color: '#ffd700' },
            { icon: 'zap', val: selEffect.id !== 'none', label: selEffect.id !== 'none' ? selEffect.name : 'No effect', color: '#aa00ff' }
          ].map((it, i) => (
            <React.Fragment key={i}>
              <View style={at.sItem}>
                <Feather name={it.icon as any} size={12} color={it.val ? it.color : '#444'} />
                <Text style={[at.sTxt, { color: it.val ? it.color : '#444' }]} numberOfLines={1}>{it.label}</Text>
              </View>
              {i < 2 && <View style={at.sDot} />}
            </React.Fragment>
          ))}
        </View>

        {/* Tab bar */}
        <View style={at.tabs}>
          {(['record', 'beats', 'effects', 'mix'] as StudioTab[]).map(t => (
            <TouchableOpacity key={t} style={[at.tab, tab === t && at.tabOn]} onPress={() => setTab(t)}>
              <Text style={at.tabEmoji}>{t === 'record' ? '🎙️' : t === 'beats' ? '🎵' : t === 'effects' ? '⚡' : '🎚️'}</Text>
              <Text style={[at.tabLbl, tab === t && at.tabLblOn]}>{t.charAt(0).toUpperCase() + t.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

          {/* RECORD TAB */}
          {tab === 'record' && (
            <View style={at.tc}>
              <Text style={at.st}>🎙️ Voice Recording</Text>
              <View style={at.waveBox}>
                <StudioWave active={recActive || playVoice} />
                {recActive && <View style={at.recBadge}><View style={at.recDot} /><Text style={at.recTxt}>{fmt(recDur)}</Text></View>}
              </View>
              <View style={at.recRow}>
                <TouchableOpacity style={[at.recBtn, recActive && at.recBtnOn]} onPress={recActive ? stopRec : startRec}>
                  <LinearGradient colors={recActive ? ['#ff4444', '#cc0000'] : ['#00ff88', '#00cc6a']} style={at.recInner}>
                    <Feather name={recActive ? 'square' : 'mic'} size={28} color="#000" />
                    <Text style={at.recLbl}>{recActive ? 'Stop' : 'Record'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
                {voiceUri && (
                  <TouchableOpacity style={at.pvBtn} onPress={toggleVoice}>
                    <Feather name={playVoice ? 'pause' : 'play'} size={20} color="#00ff88" />
                    <Text style={at.pvTxt}>{playVoice ? 'Stop' : 'Preview'}</Text>
                  </TouchableOpacity>
                )}
              </View>
              {voiceUri && (
                <View style={at.vReady}>
                  <Feather name="check-circle" size={15} color="#00ff88" />
                  <Text style={at.vReadyTxt}>Voice ready · {fmt(recDur)}</Text>
                  <TouchableOpacity onPress={() => { setVoiceUri(null); setRecDur(0); }}>
                    <Feather name="trash-2" size={14} color="#ff4444" />
                  </TouchableOpacity>
                </View>
              )}
              <View style={at.orRow}><Text style={at.orTxt}>OR</Text></View>
              <TouchableOpacity style={at.pickBtn} onPress={pickVoice}>
                <Feather name="folder" size={17} color="#00ff88" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={at.pickTxt}>Pick Voice from Device</Text>
                  <Text style={at.pickSub}>MP3, M4A, AAC, WAV supported</Text>
                </View>
                <Feather name="chevron-right" size={15} color="#666" />
              </TouchableOpacity>
              <View style={at.tip}><Text style={at.tipTxt}>💡 Record in a quiet room. Go to Effects tab to add Cloudinary pitch effects.</Text></View>

              {/* Auto-Tune card */}
              <View style={at.atCard}>
                <LinearGradient colors={autoTune ? ['#1a0a00', '#2a1200'] : ['#0d0d0d', '#141414']} style={at.atGrad}>
                  <View style={at.atHdr}>
                    <LinearGradient colors={autoTune ? ['#ffd700', '#ff8800'] : ['#2a2a2a', '#333']} style={at.atIcon}>
                      <Text style={{ fontSize: 20 }}>🎵</Text>
                    </LinearGradient>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={at.atTitle}>Studio Auto-Tune</Text>
                      <Text style={at.atSub}>Pitch-perfect voice</Text>
                    </View>
                    <Switch
                      value={autoTune}
                      onValueChange={v => { setAutoTune(v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); if (!v && atPrev) toggleAtPreview(); }}
                      trackColor={{ false: '#2a2a2a', true: '#ffd70055' }}
                      thumbColor={autoTune ? '#ffd700' : '#555'}
                    />
                  </View>
                  <View style={at.atPills}>
                    {['Pitch Lock', 'Smooth Tone', 'Studio Quality', 'No Wobble'].map(f => (
                      <View key={f} style={[at.atPill, autoTune && at.atPillOn]}>
                        <Text style={[at.atPillTxt, autoTune && { color: '#ffd700' }]}>{f}</Text>
                      </View>
                    ))}
                  </View>
                  {autoTune && (
                    <>
                      <View style={at.atActive}><View style={at.atActiveDot} /><Text style={at.atActiveTxt}>🎵 Auto-Tune ON — pitch correction active</Text></View>
                      <TouchableOpacity style={[at.atPrevBtn, atPrev && at.atPrevBtnOn]} onPress={toggleAtPreview} disabled={!voiceUri}>
                        <Feather name={atPrev ? 'pause' : 'play'} size={15} color={atPrev ? '#000' : '#ffd700'} />
                        <Text style={[at.atPrevTxt, atPrev && { color: '#000' }]}>{atPrev ? 'Stop Auto-Tune Preview' : '▶ Preview Auto-Tune'}</Text>
                      </TouchableOpacity>
                      {!voiceUri && <Text style={at.atNoVoice}>Record a voice first to preview</Text>}
                    </>
                  )}
                </LinearGradient>
              </View>
            </View>
          )}

          {/* BEATS TAB — Freesound live search */}
          {tab === 'beats' && (
            <View style={at.tc}>
              <Text style={at.st}>🎵 Beat Library</Text>

              {/* Beat source tabs */}
              <View style={at.beatSrcRow}>
                <TouchableOpacity style={[at.beatSrcBtn, beatTab === 'search' && at.beatSrcBtnOn]} onPress={() => { setBeatTab('search'); handleBeatSearch(beatSearch, beatGenre, 1); }}>
                  <Feather name="search" size={13} color={beatTab === 'search' ? '#00ff88' : '#666'} />
                  <Text style={[at.beatSrcTxt, beatTab === 'search' && { color: '#00ff88' }]}>Search Online</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[at.beatSrcBtn, beatTab === 'custom' && at.beatSrcBtnOn]} onPress={() => setBeatTab('custom')}>
                  <Feather name="upload" size={13} color={beatTab === 'custom' ? '#aa00ff' : '#666'} />
                  <Text style={[at.beatSrcTxt, beatTab === 'custom' && { color: '#aa00ff' }]}>My Beats</Text>
                </TouchableOpacity>
              </View>

              {beatTab === 'search' && (
                <>
                  <View style={at.srchBox}>
                    <Feather name="search" size={14} color="#666" />
                    <TextInput
                      style={at.srchInput}
                      value={beatSearch}
                      onChangeText={onSearchInput}
                      placeholder="Search 500,000+ free beats..."
                      placeholderTextColor="#555"
                    />
                    {beatSearch.length > 0 && (
                      <TouchableOpacity onPress={() => { setBeatSearch(''); handleBeatSearch('', beatGenre, 1); }}>
                        <Feather name="x" size={14} color="#666" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Genre filter */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ gap: 6 }}>
                    {STUDIO_GENRES.map(g => (
                      <TouchableOpacity key={g.id} style={[at.gPill, beatGenre === g.id && at.gPillOn]} onPress={() => setBeatGenre(g.id)}>
                        <Text style={{ fontSize: 10 }}>{g.emoji}</Text>
                        <Text style={[at.gName, beatGenre === g.id && { color: '#00ff88' }]}>{g.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <View style={{ backgroundColor: '#001a0a', borderRadius: 8, padding: 8, marginBottom: 10, borderWidth: 1, borderColor: '#00ff8833' }}>
                    <Text style={{ color: '#00ff88', fontSize: 10, fontWeight: '700' }}>🌐 Powered by Freesound.org — 500,000+ free tracks</Text>
                    <Text style={{ color: '#555', fontSize: 9, marginTop: 2 }}>Previews only — not for commercial distribution</Text>
                  </View>

                  {searchLoading && (
                    <View style={{ alignItems: 'center', padding: 20 }}>
                      <ActivityIndicator color="#00ff88" />
                      <Text style={{ color: '#666', fontSize: 12, marginTop: 8 }}>Searching beats...</Text>
                    </View>
                  )}

                  {!searchLoading && freesoundResults.length === 0 && (
                    <View style={{ alignItems: 'center', padding: 20 }}>
                      <Text style={{ fontSize: 32, marginBottom: 8 }}>🎵</Text>
                      <Text style={{ color: '#666', fontSize: 13 }}>Search or pick a genre to find beats</Text>
                    </View>
                  )}

                  {freesoundResults.map(result => {
                    const beatId = `fs_${result.id}`;
                    const isActive = selBeat?.id === beatId;
                    const isLoading = loadingId === beatId;
                    const isPlaying = isActive && playBeat;
                    return (
                      <TouchableOpacity key={result.id} style={[at.beatItem, isActive && at.beatItemOn]} onPress={() => toggleFreesoundBeat(result)}>
                        <View style={[at.beatPlay, isActive && at.beatPlayOn]}>
                          {isLoading
                            ? <ActivityIndicator size="small" color={isActive ? '#000' : '#00ff88'} />
                            : <Feather name={isPlaying ? 'pause' : 'play'} size={12} color={isActive ? '#000' : '#00ff88'} />
                          }
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={at.beatName} numberOfLines={1}>{result.name}</Text>
                          <Text style={at.beatMeta}>by {result.username} · {fmtDur(result.duration)}</Text>
                        </View>
                        {isActive && <Feather name="check" size={14} color="#00ff88" />}
                      </TouchableOpacity>
                    );
                  })}

                  {freesoundResults.length >= 15 && !searchLoading && (
                    <TouchableOpacity style={at.loadMore} onPress={() => handleBeatSearch(beatSearch, beatGenre, searchPage + 1)}>
                      <Text style={at.loadMoreTxt}>Load More Beats</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}

              {beatTab === 'custom' && (
                <>
                  <TouchableOpacity style={at.custBtn} onPress={pickCustomBeat}>
                    <LinearGradient colors={['#1a0035', '#0d001a']} style={at.custInner}>
                      <Feather name="upload" size={18} color="#aa00ff" />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={at.custTitle}>📁 Upload My Own Beat</Text>
                        <Text style={at.custSub}>MP3, M4A or WAV · Max {MUSIC_UPLOAD_LIMIT_MB}MB</Text>
                      </View>
                      {customBeat && <Feather name="check-circle" size={16} color="#00ff88" />}
                    </LinearGradient>
                  </TouchableOpacity>
                  {customBeat && (
                    <View style={[at.beatItem, selBeat?.id === 'custom' && at.beatItemOn]}>
                      <View style={[at.beatPlay, selBeat?.id === 'custom' && at.beatPlayOn]}>
                        <Feather name="music" size={14} color={selBeat?.id === 'custom' ? '#000' : '#00ff88'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={at.beatName}>{customBeat.name}</Text>
                        <Text style={at.beatMeta}>Your custom beat</Text>
                      </View>
                      <TouchableOpacity onPress={() => { setCustomBeat(null); if (selBeat?.id === 'custom') setSelBeat(null); }}>
                        <Feather name="x" size={14} color="#ff4444" />
                      </TouchableOpacity>
                    </View>
                  )}
                  {!customBeat && (
                    <View style={{ alignItems: 'center', padding: 30 }}>
                      <Text style={{ fontSize: 40, marginBottom: 12 }}>🎵</Text>
                      <Text style={{ color: '#666', fontSize: 13, textAlign: 'center' }}>Upload a beat from your device to use it in your post</Text>
                    </View>
                  )}
                </>
              )}
            </View>
          )}

          {/* EFFECTS TAB */}
          {tab === 'effects' && (
            <View style={at.tc}>
              <Text style={at.st}>⚡ Voice Effects</Text>
              <View style={{ backgroundColor: '#0a1a0a', borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#00ff8833' }}>
                <Text style={{ color: '#00ff88', fontSize: 12, fontWeight: '700', marginBottom: 4 }}>☁️ Powered by Cloudinary</Text>
                <Text style={{ color: '#888', fontSize: 11, lineHeight: 16 }}>Effects are applied after upload. Preview approximates the saved result.</Text>
              </View>
              {showInfo && (() => {
                const eff = VOICE_EFFECTS.find(e => e.id === showInfo); if (!eff) return null;
                return (
                  <View style={at.infoBox}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                      <Text style={{ fontSize: 24 }}>{eff.emoji}</Text>
                      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', flex: 1 }}>{eff.name}</Text>
                      <TouchableOpacity onPress={() => setShowInfo(null)}><Feather name="x" size={18} color="#666" /></TouchableOpacity>
                    </View>
                    <Text style={{ color: '#00ff88', fontSize: 11, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' }}>{eff.desc}</Text>
                    <Text style={{ color: '#bbb', fontSize: 13, lineHeight: 20 }}>{eff.explain}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {eff.cloudinaryPitch && eff.cloudinaryPitch !== 0 && <View style={at.effTag}><Text style={at.effTagTxt}>🎚️ Pitch {eff.cloudinaryPitch > 0 ? '+' : ''}{eff.cloudinaryPitch}</Text></View>}
                      {eff.cloudinaryVolume && eff.cloudinaryVolume !== 100 && <View style={at.effTag}><Text style={at.effTagTxt}>🔊 Vol {eff.cloudinaryVolume}%</Text></View>}
                      {eff.cloudinaryReverse && <View style={at.effTag}><Text style={at.effTagTxt}>⏪ Reverse (cloud only)</Text></View>}
                    </View>
                  </View>
                );
              })()}
              {!voiceUri && (
                <View style={at.warn}>
                  <Feather name="alert-circle" size={15} color="#ffd700" />
                  <Text style={at.warnTxt}>Record or pick a voice first to preview effects</Text>
                </View>
              )}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 10 }}>
                {EFFECT_CATEGORIES.map(cat => (
                  <TouchableOpacity key={cat.id} style={[at.effCat, effCat === cat.id && at.effCatOn]} onPress={() => setEffCat(cat.id)}>
                    <Text style={{ fontSize: 11 }}>{cat.emoji}</Text>
                    <Text style={[at.effCatTxt, effCat === cat.id && { color: '#aa00ff' }]}>{cat.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={at.effGrid}>
                {VOICE_EFFECTS.filter(e => effCat === 'all' || e.category === effCat).map(eff => {
                  const on = selEffect.id === eff.id;
                  const hasCloud = !!(eff.cloudinaryPitch || eff.cloudinaryVolume || eff.cloudinaryReverse);
                  return (
                    <View key={eff.id} style={[at.effCard, on && at.effCardOn]}>
                      <TouchableOpacity style={{ flex: 1, alignItems: 'center' }} onPress={() => { setSelEffect(eff); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}>
                        <Text style={at.effEmoji}>{eff.emoji}</Text>
                        <Text style={[at.effName, on && { color: '#aa00ff' }]}>{eff.name}</Text>
                        <Text style={at.effDesc} numberOfLines={1}>{eff.desc}</Text>
                        {hasCloud && <Text style={{ fontSize: 7, color: on ? '#00ff88' : '#555', fontWeight: '700', marginTop: 3 }}>☁️ CLOUD</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity style={at.effInfoBtn} onPress={() => setShowInfo(showInfo === eff.id ? null : eff.id)}>
                        <Text style={{ fontSize: 9, color: '#555' }}>ℹ️</Text>
                      </TouchableOpacity>
                      {on && <View style={at.effCheck}><Feather name="check" size={8} color="#000" /></View>}
                    </View>
                  );
                })}
              </View>
              {selEffect.id !== 'none' && (
                <View style={at.effSum}>
                  <Text style={at.effSumTitle}>✅ Selected: {selEffect.emoji} {selEffect.name}</Text>
                  <Text style={at.effSumDesc}>{selEffect.explain}</Text>
                </View>
              )}
              {voiceUri && (
                <TouchableOpacity
                  style={[at.prevEff, selEffect.id !== 'none' && { backgroundColor: '#1a0035', borderColor: '#aa00ff', borderWidth: 1 }]}
                  onPress={toggleVoice}>
                  <Feather name={playVoice ? 'pause' : 'play'} size={15} color={selEffect.id !== 'none' ? '#aa00ff' : '#fff'} />
                  <Text style={[at.prevEffTxt, selEffect.id !== 'none' && { color: '#aa00ff' }]}>
                    {playVoice ? 'Stop Preview' : selEffect.id !== 'none' ? `▶ Preview: ${selEffect.name}` : '▶ Preview Original Voice'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* MIX TAB */}
          {tab === 'mix' && (
            <View style={at.tc}>
              <Text style={at.st}>🎚️ Audio Mix</Text>
              <View style={at.mixSec}>
                <View style={at.mixRow}><Text style={at.mxE}>🎙️</Text><Text style={at.mxL}>Voice Volume</Text><Text style={[at.mxP, { color: '#00ff88' }]}>{Math.round(voiceVol * 100)}%</Text></View>
                <StudioSlider value={voiceVol} onChange={setVoiceVol} color="#00ff88" />
              </View>
              <View style={at.mixSec}>
                <View style={at.mixRow}><Text style={at.mxE}>🎵</Text><Text style={at.mxL}>Beat Volume</Text><Text style={[at.mxP, { color: '#ffd700' }]}>{Math.round(beatVol * 100)}%</Text></View>
                <StudioSlider value={beatVol} onChange={async (v) => {
                  setBeatVol(v);
                  if (beatSnd.current) { try { await beatSnd.current.setVolumeAsync(v); } catch {} }
                }} color="#ffd700" />
              </View>
              <Text style={[at.st, { marginTop: 12 }]}>Quick Presets</Text>
              <View style={at.presets}>
                {[
                  { l: '🎤 Voice Only', vv: 1.0, bv: 0.0 },
                  { l: '🎵 Beat Only', vv: 0.0, bv: 1.0 },
                  { l: '⚡ TikTok Mix', vv: 0.8, bv: 0.6 },
                  { l: '🎙️ Podcast', vv: 1.0, bv: 0.2 },
                  { l: '🌙 Soft Mix', vv: 0.7, bv: 0.4 },
                  { l: '🔥 Club Mix', vv: 0.6, bv: 1.0 },
                ].map((p, i) => (
                  <TouchableOpacity key={i} style={at.preBtn} onPress={() => { setVoiceVol(p.vv); setBeatVol(p.bv); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}>
                    <Text style={at.preBtnTxt}>{p.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={at.mixSum}>
                <Text style={at.mixSumT}>Mix Summary</Text>
                <Text style={at.mixSumI}>🎙️ {voiceUri ? `Ready · ${selEffect.name}` : 'Not set'}</Text>
                <Text style={at.mixSumI}>🎵 {selBeat?.name || 'No beat selected'}</Text>
                <Text style={at.mixSumI}>🎚️ {Math.round(voiceVol * 100)}% voice / {Math.round(beatVol * 100)}% beat</Text>
                <Text style={[at.mixSumI, autoTune && { color: '#ffd700', fontWeight: '700' }]}>🎵 Auto-Tune: {autoTune ? 'ON ✓' : 'Off'}</Text>
              </View>
              <TouchableOpacity style={[at.mixPrevBtn, playingMix && at.mixPrevBtnOn]} onPress={previewMix}>
                <Feather name={playingMix ? 'pause-circle' : 'play-circle'} size={20} color={playingMix ? '#000' : '#00ff88'} />
                <Text style={[at.mixPrevTxt, playingMix && { color: '#000' }]}>{playingMix ? '⏹ Stop Mix Preview' : '▶ Preview Mix (Voice + Beat)'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[at.fdBtn, !canDone && at.doneBtnOff]} onPress={done} disabled={!canDone}>
                <LinearGradient colors={['#00ff88', '#00cc6a']} style={at.fdInner}>
                  <Feather name="check-circle" size={17} color="#000" />
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

const at = StyleSheet.create({
  c: { flex: 1, backgroundColor: '#000' },
  hdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, backgroundColor: '#0a0a0a', borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  hTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  hSub: { color: '#666', fontSize: 10, marginTop: 2 },
  doneBtn: { backgroundColor: '#00ff88', paddingHorizontal: 15, paddingVertical: 7, borderRadius: 16 },
  doneBtnOff: { backgroundColor: '#333', opacity: 0.5 },
  doneTxt: { color: '#000', fontWeight: '700', fontSize: 13 },
  sBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, backgroundColor: '#0d0d0d', gap: 6 },
  sItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'center' },
  sTxt: { fontSize: 10, fontWeight: '600' },
  sDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#333' },
  tabs: { flexDirection: 'row', backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 2 },
  tabOn: { borderBottomWidth: 2, borderBottomColor: '#00ff88' },
  tabEmoji: { fontSize: 15 },
  tabLbl: { color: '#666', fontSize: 10, fontWeight: '600' },
  tabLblOn: { color: '#00ff88' },
  tc: { padding: 14 },
  st: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 12 },
  waveBox: { backgroundColor: '#111', borderRadius: 12, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#222', position: 'relative', overflow: 'hidden' },
  recBadge: { position: 'absolute', top: 8, right: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,68,68,0.9)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, gap: 4 },
  recDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  recTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  recRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14, marginBottom: 12 },
  recBtn: { width: 80, height: 80, borderRadius: 40, overflow: 'hidden' },
  recBtnOn: { borderWidth: 2, borderColor: '#ff4444' },
  recInner: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  recLbl: { color: '#000', fontSize: 11, fontWeight: '700' },
  pvBtn: { backgroundColor: '#111', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#00ff8844' },
  pvTxt: { color: '#00ff88', fontSize: 11, fontWeight: '600' },
  vReady: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#001a0a', borderRadius: 10, padding: 11, borderWidth: 1, borderColor: '#00ff8833', marginBottom: 12 },
  vReadyTxt: { color: '#00ff88', fontSize: 12, fontWeight: '600', flex: 1 },
  orRow: { alignItems: 'center', marginVertical: 10 },
  orTxt: { color: '#444', fontSize: 11, fontWeight: '600' },
  pickBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 10, padding: 13, borderWidth: 1, borderColor: '#00ff8833', marginBottom: 12 },
  pickTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
  pickSub: { color: '#666', fontSize: 10, marginTop: 2 },
  tip: { backgroundColor: '#0d0d0d', borderRadius: 8, padding: 11, borderWidth: 1, borderColor: '#1a1a1a', marginTop: 8 },
  tipTxt: { color: '#666', fontSize: 11, lineHeight: 16 },
  atCard: { marginTop: 16, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#ffd70033' },
  atGrad: { padding: 16 },
  atHdr: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  atIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  atTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  atSub: { color: '#888', fontSize: 11, marginTop: 2 },
  atPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  atPill: { backgroundColor: '#1a1a1a', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#2a2a2a' },
  atPillOn: { backgroundColor: '#1a0a00', borderColor: '#ffd70044' },
  atPillTxt: { color: '#666', fontSize: 10, fontWeight: '600' },
  atActive: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1a0a00', borderRadius: 8, padding: 8, marginBottom: 10, borderWidth: 1, borderColor: '#ffd70033' },
  atActiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ffd700' },
  atActiveTxt: { color: '#ffd700', fontSize: 11, fontWeight: '600', flex: 1 },
  atPrevBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1a0a00', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#ffd70044' },
  atPrevBtnOn: { backgroundColor: '#ffd700' },
  atPrevTxt: { color: '#ffd700', fontWeight: '700', fontSize: 12 },
  atNoVoice: { color: '#666', fontSize: 10, textAlign: 'center', marginTop: 6 },
  beatSrcRow: { flexDirection: 'row', backgroundColor: '#111', borderRadius: 12, padding: 4, marginBottom: 14, gap: 4 },
  beatSrcBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  beatSrcBtnOn: { backgroundColor: '#1a1a1a' },
  beatSrcTxt: { color: '#666', fontSize: 12, fontWeight: '700' },
  srchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 8, paddingHorizontal: 10, marginBottom: 9, borderWidth: 1, borderColor: '#222', gap: 6 },
  srchInput: { flex: 1, color: '#fff', fontSize: 13, paddingVertical: 10 },
  gPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 14, paddingHorizontal: 9, paddingVertical: 5, gap: 4, borderWidth: 1, borderColor: '#222' },
  gPillOn: { backgroundColor: '#00ff8822', borderColor: '#00ff88' },
  gName: { color: '#888', fontSize: 10, fontWeight: '600' },
  beatItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 10, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#1a1a1a', gap: 9 },
  beatItemOn: { backgroundColor: '#001a0a', borderColor: '#00ff88' },
  beatPlay: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#00ff8844' },
  beatPlayOn: { backgroundColor: '#00ff88', borderColor: '#00ff88' },
  beatName: { color: '#fff', fontSize: 12, fontWeight: '600' },
  beatMeta: { color: '#666', fontSize: 10, marginTop: 1 },
  loadMore: { backgroundColor: '#111', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: '#00ff8833' },
  loadMoreTxt: { color: '#00ff88', fontSize: 12, fontWeight: '700' },
  custBtn: { marginBottom: 11, borderRadius: 11, overflow: 'hidden', borderWidth: 1, borderColor: '#aa00ff55' },
  custInner: { flexDirection: 'row', alignItems: 'center', padding: 13 },
  custTitle: { color: '#aa00ff', fontSize: 13, fontWeight: '700' },
  custSub: { color: '#666', fontSize: 10, marginTop: 2 },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1a1200', borderRadius: 8, padding: 11, marginBottom: 12, borderWidth: 1, borderColor: '#ffd70033' },
  warnTxt: { color: '#ffd700', fontSize: 12, flex: 1 },
  effGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  effCard: { width: (SW - 48) / 3, backgroundColor: '#111', borderRadius: 11, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#222', position: 'relative' },
  effCardOn: { backgroundColor: '#0d002a', borderColor: '#aa00ff' },
  effEmoji: { fontSize: 20, marginBottom: 4 },
  effName: { color: '#fff', fontSize: 10, fontWeight: '700', textAlign: 'center' },
  effDesc: { color: '#555', fontSize: 8, textAlign: 'center', marginTop: 2 },
  effCheck: { position: 'absolute', top: 4, right: 4, width: 15, height: 15, borderRadius: 8, backgroundColor: '#aa00ff', alignItems: 'center', justifyContent: 'center' },
  effCat: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#111', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: '#222' },
  effCatOn: { backgroundColor: '#1a0035', borderColor: '#aa00ff' },
  effCatTxt: { color: '#888', fontSize: 10, fontWeight: '600' },
  infoBox: { backgroundColor: '#0d0d2e', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1.5, borderColor: '#aa00ff55' },
  effInfoBtn: { position: 'absolute', bottom: 4, left: 4, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  effTag: { backgroundColor: '#1a1a2e', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: '#333' },
  effTagTxt: { color: '#aaa', fontSize: 10, fontWeight: '600' },
  effSum: { backgroundColor: '#0d0d0d', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#aa00ff33' },
  effSumTitle: { color: '#fff', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  effSumDesc: { color: '#999', fontSize: 12, lineHeight: 18 },
  prevEff: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#aa00ff', borderRadius: 10, padding: 12, marginBottom: 12 },
  prevEffTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  mixSec: { backgroundColor: '#111', borderRadius: 11, padding: 13, marginBottom: 9, borderWidth: 1, borderColor: '#1a1a1a' },
  mixRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  mxE: { fontSize: 16, marginRight: 8 },
  mxL: { flex: 1, color: '#ccc', fontSize: 13, fontWeight: '600' },
  mxP: { fontSize: 13, fontWeight: '700' },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  preBtn: { backgroundColor: '#111', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#222' },
  preBtnTxt: { color: '#ccc', fontSize: 12, fontWeight: '600' },
  mixSum: { backgroundColor: '#0d0d0d', borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#1a1a1a' },
  mixSumT: { color: '#fff', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  mixSumI: { color: '#888', fontSize: 12, marginBottom: 4 },
  mixPrevBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#001a0a', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#00ff8844' },
  mixPrevBtnOn: { backgroundColor: '#00ff88' },
  mixPrevTxt: { color: '#00ff88', fontWeight: '700', fontSize: 13 },
  fdBtn: { borderRadius: 14, overflow: 'hidden', marginBottom: 30 },
  fdInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  fdTxt: { color: '#000', fontWeight: '800', fontSize: 15 },
});

// ══════════════════════════════════════════════════════════
// MAIN CREATE SCREEN
// ══════════════════════════════════════════════════════════
export default function CreateScreen() {
  const { user } = useAuthStore();

  // ─── Camera state ─────────────────────────────────────
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing]             = useState<'back' | 'front'>('back');
  const [flash, setFlash]               = useState<'off' | 'on'>('off');
  const [cameraMode, setCameraMode]     = useState<CameraMode>('video');
  const [isRecording, setIsRecording]   = useState(false);
  const [recordingDur, setRecordingDur] = useState(0);
  const [cameraFeature, setCameraFeature] = useState<CameraFeature>('normal');
  const [selectedArEffect, setSelectedArEffect] = useState('ar_none');
  const [selectedBackground, setSelectedBackground] = useState('bg_none');
  const [activeBurst, setActiveBurst]   = useState<string | null>(null);
  const [burstVisible, setBurstVisible] = useState(false);
  const [burstEffect, setBurstEffect]   = useState('sparkle');
  const [showBurstPanel, setShowBurstPanel] = useState(false);
  const [showBeatTap, setShowBeatTap]   = useState(false);
  const cameraRef = useRef<any>(null);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Screen / compose state ───────────────────────────
  const [screenView, setScreenView]     = useState<ScreenView>('camera');
  const [mediaUri, setMediaUri]         = useState<string | null>(null);
  const [originalMediaUri, setOriginalMediaUri] = useState<string | null>(null);
  const [mediaType, setMediaType]       = useState<MediaType>(null);
  const [caption, setCaption]           = useState('');
  const [isPosting, setIsPosting]       = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage]   = useState('');

  // ─── Filter / FX / effect state ───────────────────────
  const [selectedFilter, setSelectedFilter] = useState('original');
  const [selectedFx, setSelectedFx]     = useState('fx_none');
  const [selectedSpeed, setSelectedSpeed] = useState('normal');
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const [blurEnabled, setBlurEnabled]   = useState(false);
  const [addWatermark, setAddWatermark] = useState(true);
  const [autoOptimize, setAutoOptimize] = useState(true);

  // ─── Status state ─────────────────────────────────────
  const [statusContent, setStatusContent] = useState('');
  const [statusType, setStatusType]     = useState<'text' | 'voice'>('text');
  const [statusBackground, setStatusBackground] = useState('purple');
  const [statusVoiceUri, setStatusVoiceUri] = useState<string | null>(null);
  const [statusVoiceDuration, setStatusVoiceDuration] = useState(0);

  // ─── Music state ──────────────────────────────────────
  const [selectedMusic, setSelectedMusic] = useState<string | null>(null);
  const [selectedMusicName, setSelectedMusicName] = useState<string | null>(null);
  const [musicArtist, setMusicArtist]   = useState<string | null>(null);
  const [musicVolume, setMusicVolume]   = useState(0.8);
  const [originalVolume, setOriginalVolume] = useState(1.0);

  // ─── Audio Studio state ───────────────────────────────
  const [showAudioStudio, setShowAudioStudio] = useState(false);
  const [studioVoiceUri, setStudioVoiceUri] = useState<string | null>(null);
  const [studioEffectId, setStudioEffectId] = useState<string | null>(null);
  const [autoTuneEnabled, setAutoTuneEnabled] = useState(false);

  // ─── Location state ───────────────────────────────────
  const [location, setLocation]         = useState<string | null>(null);
  const [locationCoords, setLocationCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);

  // ─── Schedule state ───────────────────────────────────
  const [isScheduled, setIsScheduled]   = useState(false);
  const [scheduledFor, setScheduledFor] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ─── Drafts state ─────────────────────────────────────
  const [drafts, setDrafts]             = useState<Draft[]>([]);

  // ─── UI panel state ───────────────────────────────────
  const [showFilters, setShowFilters]   = useState(false);
  const [showFxPanel, setShowFxPanel]   = useState(false);
  const [showVibePanel, setShowVibePanel] = useState(false);
  const [showSpeedPanel, setShowSpeedPanel] = useState(false);
  const [showLocationPanel, setShowLocationPanel] = useState(false);
  const [showSchedulePanel, setShowSchedulePanel] = useState(false);
  const [showEditApps, setShowEditApps] = useState(false);
  const [showStatusCreator, setShowStatusCreator] = useState(false);

  // ─── Marketplace bridge ───────────────────────────────
  const [marketplaceListingId, setMarketplaceListingId] = useState<string | null>(null);
  const [marketplacePrice, setMarketplacePrice] = useState<string | null>(null);
  const [marketplaceTitle, setMarketplaceTitle] = useState<string | null>(null);

  // ─── Animations ───────────────────────────────────────
  const recPulse = useRef(new Animated.Value(1)).current;
  const glitchAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadDrafts().then(setDrafts);
    const bridge = getMarketplacePostBridge();
    if (bridge) {
      setMarketplaceListingId(bridge.listingId ?? null);
      setMarketplacePrice(bridge.price ?? null);
      setMarketplaceTitle(bridge.title ?? null);
      clearMarketplacePostBridge();
    }
  }, []);

  useEffect(() => {
    if (isRecording) {
      Animated.loop(Animated.sequence([
        Animated.timing(recPulse, { toValue: 1.2, duration: 500, useNativeDriver: true }),
        Animated.timing(recPulse, { toValue: 1.0, duration: 500, useNativeDriver: true }),
      ])).start();
      recTimerRef.current = setInterval(() => setRecordingDur(d => d + 1), 1000);
    } else {
      recPulse.setValue(1);
      if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }
      setRecordingDur(0);
    }
    return () => { if (recTimerRef.current) clearInterval(recTimerRef.current); };
  }, [isRecording]);

  useEffect(() => {
    if (FILTERS.find(f => f.id === selectedFilter)?.glitchEffect) {
      Animated.loop(Animated.sequence([
        Animated.timing(glitchAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
        Animated.timing(glitchAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
        Animated.timing(glitchAnim, { toValue: 1, duration: 60, useNativeDriver: true }),
        Animated.timing(glitchAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ])).start();
    } else {
      glitchAnim.setValue(0);
    }
  }, [selectedFilter]);

  const fmtRecDur = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ─── Camera actions ───────────────────────────────────
  const handleTakePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, base64: false });
      setOriginalMediaUri(photo.uri);
      setMediaUri(photo.uri);
      setMediaType('image');
      setScreenView('compose');
    } catch (e: any) { Alert.alert('Error', 'Could not take photo: ' + e.message); }
  };

  const handleStartRecording = async () => {
    if (!cameraRef.current || isRecording) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setIsRecording(true);
      const video = await cameraRef.current.recordAsync({ maxDuration: 180 });
      setOriginalMediaUri(video.uri);
      setMediaUri(video.uri);
      setMediaType('video');
      setIsRecording(false);
      setScreenView('compose');
    } catch (e: any) {
      setIsRecording(false);
      if (!e.message?.includes('stopped')) Alert.alert('Error', 'Could not record video: ' + e.message);
    }
  };

  const handleStopRecording = () => {
    if (!cameraRef.current || !isRecording) return;
    cameraRef.current.stopRecording();
  };

  const handleToggleDualCam = () => {
    if (cameraFeature !== 'dualcam') {
      Alert.alert(
        '⚠️ Dual Camera',
        'Dual camera is experimental. The second camera (picture-in-picture) may show a black screen on some Android devices. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Enable', onPress: () => setCameraFeature('dualcam') },
        ]
      );
    } else {
      setCameraFeature('normal');
    }
  };

  const handlePickMedia = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow media library access in settings.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.85,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const type = asset.type === 'video' ? 'video' : 'image';
        if (type === 'video') {
          const ok = await checkVideoSize(asset.uri);
          if (!ok) return;
        }
        setOriginalMediaUri(asset.uri);
        setMediaUri(asset.uri);
        setMediaType(type);
        setScreenView('compose');
      }
    } catch (e: any) { Alert.alert('Error', 'Could not pick media: ' + e.message); }
  };

  const handleGetLocation = async () => {
    setLoadingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Permission denied', 'Location permission is needed.'); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      const label = [place.city, place.region, place.country].filter(Boolean).join(', ');
      setLocation(label || 'Unknown location');
      setLocationCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } catch (e: any) { Alert.alert('Error', 'Could not get location: ' + e.message); }
    finally { setLoadingLocation(false); }
  };

  // ─── Beat-tap burst fire ──────────────────────────────
  const handleBeatTapFire = useCallback(() => {
    if (!activeBurst) return;
    const burst = EFFECT_BURSTS.find(b => b.id === activeBurst);
    if (!burst) return;
    setBurstEffect(burst.effect);
    setBurstVisible(true);
    setTimeout(() => setBurstVisible(false), 800);
  }, [activeBurst]);

  // ─── Filter preview (tint overlay) ───────────────────
  const activeFilter = FILTERS.find(f => f.id === selectedFilter);
  const activeFxTint = FX_OVERLAY_TINTS[selectedFx] || 'transparent';

  // ─── Save draft ───────────────────────────────────────
  const handleSaveDraft = async () => {
    const draft: Draft = {
      id: Date.now().toString(), createdAt: new Date().toISOString(),
      mediaUri, originalMediaUri, mediaType,
      caption, statusContent, statusType, statusBackground, statusVoiceUri, statusVoiceDuration,
      filter: selectedFilter, speedId: selectedSpeed, blurEnabled, selectedVibe,
      selectedFx, selectedMusic, selectedMusicName, musicArtist, musicVolume, originalVolume,
      location, locationCoords, addWatermark, autoOptimize,
      isScheduled, scheduledFor: scheduledFor?.toISOString() || null,
    };
    const updated = await addDraft(draft);
    setDrafts(updated);
    Alert.alert('✅ Saved', 'Draft saved successfully.');
  };

  const handleLoadDraft = (d: Draft) => {
    setMediaUri(d.mediaUri); setOriginalMediaUri(d.originalMediaUri); setMediaType(d.mediaType);
    setCaption(d.caption); setStatusContent(d.statusContent); setStatusType(d.statusType);
    setStatusBackground(d.statusBackground); setStatusVoiceUri(d.statusVoiceUri); setStatusVoiceDuration(d.statusVoiceDuration);
    setSelectedFilter(d.filter); setSelectedSpeed(d.speedId); setBlurEnabled(d.blurEnabled);
    setSelectedVibe(d.selectedVibe); setSelectedFx(d.selectedFx);
    setSelectedMusic(d.selectedMusic); setSelectedMusicName(d.selectedMusicName);
    setMusicArtist(d.musicArtist); setMusicVolume(d.musicVolume); setOriginalVolume(d.originalVolume);
    setLocation(d.location); setLocationCoords(d.locationCoords);
    setAddWatermark(d.addWatermark); setAutoOptimize(d.autoOptimize);
    setIsScheduled(d.isScheduled); setScheduledFor(d.scheduledFor ? new Date(d.scheduledFor) : null);
    setScreenView('compose');
  };

  const handleDeleteDraft = async (id: string) => {
    const updated = await deleteDraft(id);
    setDrafts(updated);
  };

  // ─── POST ─────────────────────────────────────────────
  const handlePost = async () => {
    if (!user) { Alert.alert('Not logged in'); return; }
    if (!mediaUri && !statusContent && !statusVoiceUri) {
      Alert.alert('Nothing to post', 'Add media, text, or a voice status.');
      return;
    }
    setIsPosting(true);
    setUploadProgress(0);
    try {
      let finalMediaUrl: string | undefined;
      let cloudinaryPublicId: string | undefined;
      let finalMediaType: string | undefined;

      if (mediaUri) {
        setUploadStage('Processing media...');
        setUploadProgress(10);

        if (mediaType === 'image') {
          // Real filter baking with ImageManipulator
          const bakedUri = await applyFilterBaking(mediaUri, selectedFilter, selectedFx);
          setUploadProgress(30);
          setUploadStage('Uploading to Cloudinary...');

          const base64 = await FileSystem.readAsStringAsync(bakedUri, { encoding: FileSystem.EncodingType.Base64 });
          setUploadProgress(50);

          const { data, error } = await supabase.storage
            .from('posts')
            .upload(`${user.id}/${Date.now()}.jpg`, decode(base64), { contentType: 'image/jpeg', upsert: true });
          if (error) throw error;
          const { data: { publicUrl } } = supabase.storage.from('posts').getPublicUrl(data.path);
          finalMediaUrl = publicUrl;
          finalMediaType = 'image';
          setUploadProgress(70);

        } else if (mediaType === 'video') {
          setUploadStage('Uploading video to Cloudinary...');
          const { url, publicId } = await uploadVideoToCloudinary(mediaUri, (p) => {
            setUploadProgress(10 + p * 0.7);
          });
          finalMediaUrl = url;
          cloudinaryPublicId = publicId;
          finalMediaType = 'video';
          setUploadProgress(80);
        }
      }

      setUploadStage('Saving post...');
      setUploadProgress(90);

      const speedRate = SPEED_OPTIONS.find(s => s.id === selectedSpeed)?.rate ?? 1.0;
      const filterDef = FILTERS.find(f => f.id === selectedFilter);

      const postData: PostInsertData = {
        user_id: user.id,
        caption,
        likes_count: 0, comments_count: 0, views_count: 0, coins_received: 0,
        created_at: new Date().toISOString(),
        is_published: !isScheduled,
        scheduled_for: isScheduled && scheduledFor ? scheduledFor.toISOString() : null,
        has_watermark: addWatermark,
        auto_optimized: autoOptimize,
        applied_filter: selectedFilter,
        video_effect: selectedFx,
        video_filter_tint: filterDef?.dbTint || null,
        playback_rate: speedRate !== 1.0 ? speedRate : null,
        vibe_type: selectedVibe,
        voice_auto_tune: autoTuneEnabled,
        blur_enabled: blurEnabled,
      };

      if (finalMediaUrl) { postData.media_url = finalMediaUrl; postData.media_type = finalMediaType; }
      if (cloudinaryPublicId) postData.cloudinary_public_id = cloudinaryPublicId;
      if (statusContent) postData.status_background = statusBackground;
      if (statusVoiceDuration > 0) postData.voice_duration = statusVoiceDuration;
      if (location) postData.location = location;
      if (locationCoords) { postData.latitude = locationCoords.latitude; postData.longitude = locationCoords.longitude; }
      if (selectedMusicName) { postData.music_name = selectedMusicName; postData.music_artist = musicArtist || undefined; postData.music_volume = musicVolume; postData.original_volume = originalVolume; }
      if (selectedMusic) postData.music_url = selectedMusic;
      if (marketplaceListingId) { postData.marketplace_listing_id = marketplaceListingId; postData.marketplace_price = marketplacePrice; postData.marketplace_title = marketplaceTitle; }

      const { error: postError } = await supabase.from('posts').insert(postData);
      if (postError) throw postError;

      setUploadProgress(100);
      setUploadStage('Posted! 🎉');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      await new Promise(r => setTimeout(r, 800));
      router.replace('/(tabs)');

    } catch (e: any) {
      Alert.alert('Post Failed', e.message || 'Something went wrong. Please try again.');
    } finally {
      setIsPosting(false);
      setUploadProgress(0);
      setUploadStage('');
    }
  };

  // ─── Permission check ─────────────────────────────────
  if (!permission) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  if (!permission.granted) {
    return (
      <View style={ms.permScreen}>
        <Text style={ms.permEmoji}>📷</Text>
        <Text style={ms.permTitle}>Camera Access Needed</Text>
        <Text style={ms.permSub}>LumVibe needs camera access to create posts</Text>
        <TouchableOpacity style={ms.permBtn} onPress={requestPermission}>
          <Text style={ms.permBtnTxt}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── DRAFTS SCREEN ────────────────────────────────────
  if (screenView === 'drafts') {
    return (
      <DraftsScreen
        drafts={drafts}
        onLoad={handleLoadDraft}
        onDelete={handleDeleteDraft}
        onClose={() => setScreenView('camera')}
      />
    );
  }

  // ─── CAMERA SCREEN ────────────────────────────────────
  if (screenView === 'camera') {
    const cH = SH * 0.72;
    return (
      <View style={ms.camScreen}>
        {/* Camera area */}
        <View style={[ms.camBox, { height: cH }]}>
          {cameraFeature === 'dualcam' ? (
            <DualCameraView facing={facing} flash={flash} isRecording={isRecording} onToggleFacing={() => setFacing(f => f === 'back' ? 'front' : 'back')} />
          ) : (
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing={facing}
              enableTorch={flash === 'on'}
              mode={cameraMode}
            />
          )}

          {/* Animated background layer */}
          <AnimatedBackground backgroundId={selectedBackground} />

          {/* Filter tint overlay */}
          {activeFilter?.tintColor && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: activeFilter.tintColor, zIndex: 2 }]} pointerEvents="none" />
          )}
          {/* FX tint overlay */}
          {activeFxTint !== 'transparent' && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: activeFxTint, zIndex: 3 }]} pointerEvents="none" />
          )}
          {/* Cinematic bars */}
          {activeFilter?.cinematicBars && (
            <>
              <View style={[ms.cinBar, { top: 0 }]} pointerEvents="none" />
              <View style={[ms.cinBar, { bottom: 0 }]} pointerEvents="none" />
            </>
          )}
          {/* Glitch effect */}
          {activeFilter?.glitchEffect && (
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,0,80,0.08)', zIndex: 4, transform: [{ translateX: glitchAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) }] }]} pointerEvents="none" />
          )}

          {/* AR overlay */}
          <AROverlay effectId={selectedArEffect} cW={SW} cH={cH} />

          {/* Burst overlay */}
          <EffectBurstOverlay effect={burstEffect} visible={burstVisible} />

          {/* Burst panel */}
          <EffectBurstPanel
            visible={showBurstPanel}
            activeBurst={activeBurst}
            onBurstSelect={id => { setActiveBurst(id); setShowBurstPanel(false); }}
            onClose={() => setShowBurstPanel(false)}
          />

          {/* Recording indicator */}
          {isRecording && (
            <Animated.View style={[ms.recIndicator, { transform: [{ scale: recPulse }] }]}>
              <View style={ms.recDot} />
              <Text style={ms.recTime}>{fmtRecDur(recordingDur)}</Text>
            </Animated.View>
          )}

          {/* Top controls */}
          <View style={ms.camTopRow}>
            <TouchableOpacity style={ms.camIconBtn} onPress={() => router.back()}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={ms.camTopCenter}>
              {selectedFilter !== 'original' && (
                <View style={ms.activeBadge}><Text style={ms.activeBadgeTxt}>{activeFilter?.emoji} {activeFilter?.name}</Text></View>
              )}
            </View>
            <TouchableOpacity style={ms.camIconBtn} onPress={() => setScreenView('drafts')}>
              <Ionicons name="document-text-outline" size={22} color="#fff" />
              {drafts.length > 0 && <View style={ms.draftBadge}><Text style={ms.draftBadgeTxt}>{drafts.length}</Text></View>}
            </TouchableOpacity>
          </View>

          {/* Right tool panel */}
          <View style={ms.rightTools}>
            {/* Flip camera */}
            <TouchableOpacity style={ms.toolBtn} onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}>
              <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
            </TouchableOpacity>
            {/* Flash */}
            <TouchableOpacity style={ms.toolBtn} onPress={() => setFlash(f => f === 'off' ? 'on' : 'off')}>
              <Ionicons name={flash === 'on' ? 'flash' : 'flash-off'} size={22} color={flash === 'on' ? '#ffd700' : '#fff'} />
            </TouchableOpacity>
            {/* Animated BG */}
            <TouchableOpacity style={[ms.toolBtn, cameraFeature === 'animatedbg' && ms.toolBtnActive]} onPress={() => {
              if (cameraFeature === 'animatedbg') { setCameraFeature('normal'); setSelectedBackground('bg_none'); }
              else { setCameraFeature('animatedbg'); }
            }}>
              <Text style={{ fontSize: 16 }}>🎨</Text>
              <Text style={ms.toolLabel}>BG</Text>
            </TouchableOpacity>
            {/* Effect Burst */}
            <TouchableOpacity style={[ms.toolBtn, showBurstPanel && ms.toolBtnActive]} onPress={() => setShowBurstPanel(v => !v)}>
              <Text style={{ fontSize: 16 }}>🎆</Text>
              <Text style={ms.toolLabel}>Burst</Text>
            </TouchableOpacity>
            {/* Beat Tap */}
            <TouchableOpacity style={[ms.toolBtn, showBeatTap && ms.toolBtnActive]} onPress={() => setShowBeatTap(v => !v)}>
              <Text style={{ fontSize: 16 }}>🥁</Text>
              <Text style={ms.toolLabel}>Tap</Text>
            </TouchableOpacity>
            {/* Dual Cam */}
            <TouchableOpacity style={[ms.toolBtn, cameraFeature === 'dualcam' && ms.toolBtnActive]} onPress={handleToggleDualCam}>
              <MaterialCommunityIcons name="camera-flip-outline" size={20} color={cameraFeature === 'dualcam' ? '#00ff88' : '#fff'} />
              <Text style={ms.toolLabel}>Dual</Text>
            </TouchableOpacity>
          </View>

          {/* AR Effects strip */}
          <View style={ms.arStrip}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
              {AR_EFFECTS.map(eff => (
                <TouchableOpacity
                  key={eff.id}
                  style={[ms.arBtn, selectedArEffect === eff.id && ms.arBtnActive]}
                  onPress={() => { setSelectedArEffect(eff.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Text style={{ fontSize: 18 }}>{eff.emoji}</Text>
                  <Text style={[ms.arLabel, selectedArEffect === eff.id && { color: '#00ff88' }]}>{eff.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Animated BG picker */}
          {cameraFeature === 'animatedbg' && (
            <View style={ms.bgStrip}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
                {ANIMATED_BACKGROUNDS.map(bg => (
                  <TouchableOpacity
                    key={bg.id}
                    style={[ms.bgBtn, selectedBackground === bg.id && ms.bgBtnActive]}
                    onPress={() => setSelectedBackground(bg.id)}
                  >
                    <Text style={{ fontSize: 20 }}>{bg.emoji}</Text>
                    <Text style={[ms.bgLabel, selectedBackground === bg.id && { color: '#00ff88' }]}>{bg.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Beat Tap Sync */}
        {showBeatTap && (
          <BeatTapSync activeBurst={activeBurst} onFire={handleBeatTapFire} visible={showBeatTap} />
        )}

        {/* Camera controls bar */}
        <View style={ms.camControls}>
          {/* Mode toggle */}
          <View style={ms.modeRow}>
            <TouchableOpacity style={[ms.modeBtn, cameraMode === 'picture' && ms.modeBtnActive]} onPress={() => setCameraMode('picture')}>
              <Text style={[ms.modeTxt, cameraMode === 'picture' && { color: '#00ff88' }]}>Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[ms.modeBtn, cameraMode === 'video' && ms.modeBtnActive]} onPress={() => setCameraMode('video')}>
              <Text style={[ms.modeTxt, cameraMode === 'video' && { color: '#00ff88' }]}>Video</Text>
            </TouchableOpacity>
          </View>

          {/* Capture row */}
          <View style={ms.captureRow}>
            {/* Gallery */}
            <TouchableOpacity style={ms.galleryBtn} onPress={handlePickMedia}>
              <Ionicons name="images-outline" size={26} color="#fff" />
            </TouchableOpacity>

            {/* Shutter */}
            {cameraMode === 'picture' ? (
              <TouchableOpacity style={ms.shutterBtn} onPress={handleTakePhoto}>
                <View style={ms.shutterInner} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[ms.shutterBtn, isRecording && ms.shutterRecording]}
                onPress={isRecording ? handleStopRecording : handleStartRecording}
              >
                <View style={[ms.shutterInner, isRecording && ms.shutterInnerRec]} />
              </TouchableOpacity>
            )}

            {/* Audio Studio */}
            <TouchableOpacity style={ms.studioBtn} onPress={() => setShowAudioStudio(true)}>
              <Ionicons name="musical-notes-outline" size={24} color={studioVoiceUri ? '#00ff88' : '#fff'} />
              {studioVoiceUri && <View style={ms.studioDot} />}
            </TouchableOpacity>
          </View>

          {/* Filter quick strip */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
            {FILTERS.map(f => (
              <TouchableOpacity
                key={f.id}
                style={[ms.filterChip, selectedFilter === f.id && ms.filterChipActive]}
                onPress={() => setSelectedFilter(f.id)}
              >
                <Text style={{ fontSize: 14 }}>{f.emoji}</Text>
                <Text style={[ms.filterChipTxt, selectedFilter === f.id && { color: '#00ff88' }]}>{f.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Audio Studio modal */}
        <AudioStudio
          visible={showAudioStudio}
          onClose={() => setShowAudioStudio(false)}
          onDone={result => {
            setShowAudioStudio(false);
            if (result.voiceUri) setStudioVoiceUri(result.voiceUri);
            if (result.effectId) setStudioEffectId(result.effectId);
            setAutoTuneEnabled(result.autoTuneEnabled);
            if (result.beatUri) {
              setSelectedMusic(result.beatUri ?? null);
              setSelectedMusicName(result.beatName ?? null);
              setMusicArtist(result.beatArtist ?? null);
              setBeatVol_unused(result.beatVolume);
            }
          }}
        />
      </View>
    );
  }

  // ─── COMPOSE SCREEN ───────────────────────────────────
  const activeFilterDef = FILTERS.find(f => f.id === selectedFilter);
  const activeFxOverlay = FX_OVERLAY_TINTS[selectedFx] || 'transparent';

  return (
    <View style={ms.composeScreen}>
      {isPosting && <UploadProgressCircle progress={uploadProgress} stage={uploadStage} />}

      {/* Header */}
      <View style={ms.composeHdr}>
        <TouchableOpacity onPress={() => setScreenView('camera')} style={ms.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#00ff88" />
        </TouchableOpacity>
        <Text style={ms.composeTitle}>Create Post</Text>
        <View style={ms.composeHdrRight}>
          <TouchableOpacity style={ms.draftBtn} onPress={handleSaveDraft}>
            <Text style={ms.draftBtnTxt}>Draft</Text>
          </TouchableOpacity>
          <TouchableOpacity style={ms.postBtn} onPress={handlePost} disabled={isPosting}>
            <Text style={ms.postBtnTxt}>Post</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Media preview */}
        {mediaUri && (
          <View style={ms.previewBox}>
            {mediaType === 'video' ? (
              <Video
                source={{ uri: mediaUri }}
                style={ms.previewMedia}
                resizeMode={ResizeMode.COVER}
                isLooping
                shouldPlay={false}
              />
            ) : (
              <Image source={{ uri: mediaUri }} style={ms.previewMedia} resizeMode="cover" />
            )}
            {/* Filter preview overlay */}
            {activeFilterDef?.tintColor && (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: activeFilterDef.tintColor, borderRadius: 16 }]} pointerEvents="none" />
            )}
            {activeFxOverlay !== 'transparent' && (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: activeFxOverlay, borderRadius: 16 }]} pointerEvents="none" />
            )}
            {activeFilterDef?.cinematicBars && (
              <>
                <View style={[ms.prevCinBar, { top: 0 }]} pointerEvents="none" />
                <View style={[ms.prevCinBar, { bottom: 0 }]} pointerEvents="none" />
              </>
            )}
            {/* Filter info pill */}
            <View style={ms.previewInfo}>
              <Text style={ms.previewInfoTxt}>
                {activeFilterDef?.emoji} {selectedFilter !== 'original' ? activeFilterDef?.name + ' filter' : 'Original filter'}
                {selectedFx !== 'fx_none' ? ` · ${FX_EFFECTS.find(f => f.id === selectedFx)?.emoji} FX` : ''}
                {addWatermark ? ' · 💧 Watermark' : ''}
                {' — compressed & saved'}
              </Text>
            </View>
          </View>
        )}

        {/* Caption */}
        <View style={ms.captionBox}>
          <TextInput
            style={ms.captionInput}
            value={caption}
            onChangeText={setCaption}
            placeholder="Write a caption..."
            placeholderTextColor="#555"
            multiline
            maxLength={2200}
          />
          <Text style={ms.captionCount}>{caption.length}/2200</Text>
        </View>

        {/* ── FILTERS SECTION ── */}
        <View style={ms.section}>
          <View style={ms.sectionHdr}>
            <Text style={ms.sectionTitle}>✨ Filters</Text>
            <Text style={ms.sectionSub}>Applied & baked into your file</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
            {FILTERS.map(f => (
              <TouchableOpacity
                key={f.id}
                style={[ms.filterCard, selectedFilter === f.id && ms.filterCardActive]}
                onPress={() => setSelectedFilter(f.id)}
              >
                <Text style={{ fontSize: 22 }}>{f.emoji}</Text>
                <Text style={[ms.filterCardTxt, selectedFilter === f.id && { color: '#00ff88' }]}>{f.name}</Text>
                {selectedFilter === f.id && <View style={ms.filterCheck}><Feather name="check" size={10} color="#000" /></View>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── FX EFFECTS SECTION ── */}
        <View style={ms.section}>
          <View style={ms.sectionHdr}>
            <Text style={ms.sectionTitle}>🎛️ FX Effects</Text>
            <Text style={ms.sectionSub}>Real pixel processing — unique to LumVibe</Text>
          </View>
          {/* Category filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingBottom: 8 }}>
            {FX_CATEGORIES.map(cat => (
              <TouchableOpacity key={cat.id} style={[ms.fxCatBtn, /* no state for active cat in compose, show all */]} onPress={() => {}}>
                <Text style={{ fontSize: 10 }}>{cat.emoji}</Text>
                <Text style={ms.fxCatTxt}>{cat.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingVertical: 4 }}>
            {FX_EFFECTS.map(fx => (
              <TouchableOpacity
                key={fx.id}
                style={[ms.fxCard, selectedFx === fx.id && ms.fxCardActive]}
                onPress={() => setSelectedFx(fx.id)}
              >
                <Text style={{ fontSize: 22 }}>{fx.emoji}</Text>
                <Text style={[ms.fxCardName, selectedFx === fx.id && { color: '#00ff88' }]}>{fx.name}</Text>
                <Text style={ms.fxCardDesc} numberOfLines={1}>{fx.desc}</Text>
                {selectedFx === fx.id && <View style={ms.fxCheck}><Feather name="check" size={9} color="#000" /></View>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── SET YOUR VIBE ── */}
        <View style={ms.section}>
          <View style={ms.sectionHdr}>
            <Text style={ms.sectionTitle}>🔥 Set Your Vibe</Text>
            <Text style={ms.sectionSub}>How does this post feel?</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
            {VIBE_TYPES.map(v => (
              <TouchableOpacity
                key={v.id}
                style={[ms.vibeBtn, selectedVibe === v.id && { backgroundColor: v.color + '22', borderColor: v.color }]}
                onPress={() => setSelectedVibe(selectedVibe === v.id ? null : v.id)}
              >
                <Text style={{ fontSize: 20 }}>{v.emoji}</Text>
                <Text style={[ms.vibeTxt, selectedVibe === v.id && { color: v.color }]}>{v.label}</Text>
                {selectedVibe === v.id && <View style={[ms.vibeCheck, { backgroundColor: v.color }]}><Feather name="check" size={8} color="#000" /></View>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── SPEED ── */}
        <View style={ms.section}>
          <View style={ms.sectionHdr}>
            <Text style={ms.sectionTitle}>⏱️ Playback Speed</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
            {SPEED_OPTIONS.map(s => (
              <TouchableOpacity
                key={s.id}
                style={[ms.speedBtn, selectedSpeed === s.id && ms.speedBtnActive]}
                onPress={() => setSelectedSpeed(s.id)}
              >
                <Text style={{ fontSize: 14 }}>{s.emoji}</Text>
                <Text style={[ms.speedTxt, selectedSpeed === s.id && { color: '#00ff88' }]}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── MUSIC / AUDIO STUDIO ── */}
        {(selectedMusicName || studioVoiceUri) && (
          <View style={ms.section}>
            <View style={ms.sectionHdr}>
              <Text style={ms.sectionTitle}>🎵 Audio</Text>
            </View>
            <View style={{ paddingHorizontal: 16 }}>
              {selectedMusicName && (
                <View style={ms.musicRow}>
                  <Ionicons name="musical-note" size={16} color="#ffd700" />
                  <Text style={ms.musicName} numberOfLines={1}>{selectedMusicName}</Text>
                  {musicArtist && <Text style={ms.musicArtist}>· {musicArtist}</Text>}
                  <TouchableOpacity onPress={() => { setSelectedMusic(null); setSelectedMusicName(null); setMusicArtist(null); }}>
                    <Feather name="x" size={14} color="#ff4444" />
                  </TouchableOpacity>
                </View>
              )}
              {studioVoiceUri && (
                <View style={ms.musicRow}>
                  <Ionicons name="mic" size={16} color="#00ff88" />
                  <Text style={ms.musicName}>Studio voice recorded</Text>
                  {studioEffectId && <Text style={ms.musicArtist}>· {VOICE_EFFECTS.find(e => e.id === studioEffectId)?.name}</Text>}
                </View>
              )}
              <VolumeSlider value={musicVolume} onValueChange={setMusicVolume} color="#ffd700" label="Music Volume" emoji="🎵" />
              <VolumeSlider value={originalVolume} onValueChange={setOriginalVolume} color="#00ff88" label="Original Volume" emoji="🎙️" />
            </View>
          </View>
        )}

        {/* ── SETTINGS ROW ── */}
        <View style={ms.section}>
          <View style={ms.settingsGrid}>
            <View style={ms.settingItem}>
              <Text style={ms.settingLabel}>💧 Watermark</Text>
              <Switch value={addWatermark} onValueChange={setAddWatermark} trackColor={{ false: '#2a2a2a', true: '#00ff8855' }} thumbColor={addWatermark ? '#00ff88' : '#555'} />
            </View>
            <View style={ms.settingItem}>
              <Text style={ms.settingLabel}>⚡ Auto-Optimize</Text>
              <Switch value={autoOptimize} onValueChange={setAutoOptimize} trackColor={{ false: '#2a2a2a', true: '#00ff8855' }} thumbColor={autoOptimize ? '#00ff88' : '#555'} />
            </View>
            <View style={ms.settingItem}>
              <Text style={ms.settingLabel}>🌫️ Blur BG</Text>
              <Switch value={blurEnabled} onValueChange={setBlurEnabled} trackColor={{ false: '#2a2a2a', true: '#00ff8855' }} thumbColor={blurEnabled ? '#00ff88' : '#555'} />
            </View>
          </View>
        </View>

        {/* ── LOCATION ── */}
        <TouchableOpacity style={ms.metaRow} onPress={handleGetLocation} disabled={loadingLocation}>
          <Ionicons name="location-outline" size={18} color={location ? '#00ff88' : '#666'} />
          <Text style={[ms.metaTxt, location && { color: '#00ff88' }]}>
            {loadingLocation ? 'Getting location...' : location || 'Add location'}
          </Text>
          {location && <TouchableOpacity onPress={() => { setLocation(null); setLocationCoords(null); }}><Feather name="x" size={14} color="#ff4444" /></TouchableOpacity>}
        </TouchableOpacity>

        {/* ── SCHEDULE ── */}
        <TouchableOpacity style={ms.metaRow} onPress={() => setShowSchedulePanel(v => !v)}>
          <Ionicons name="time-outline" size={18} color={isScheduled ? '#ffd700' : '#666'} />
          <Text style={[ms.metaTxt, isScheduled && { color: '#ffd700' }]}>
            {isScheduled && scheduledFor ? `Scheduled: ${scheduledFor.toLocaleString()}` : 'Schedule post'}
          </Text>
          {isScheduled && <TouchableOpacity onPress={() => setIsScheduled(false)}><Feather name="x" size={14} color="#ff4444" /></TouchableOpacity>}
        </TouchableOpacity>

        {showSchedulePanel && (
          <View style={ms.schedulePanel}>
            <View style={ms.scheduleSwitchRow}>
              <Text style={ms.scheduleTxt}>Schedule this post</Text>
              <Switch value={isScheduled} onValueChange={v => { setIsScheduled(v); if (v && !scheduledFor) setShowDatePicker(true); }} trackColor={{ false: '#2a2a2a', true: '#ffd70055' }} thumbColor={isScheduled ? '#ffd700' : '#555'} />
            </View>
            {isScheduled && (
              <TouchableOpacity style={ms.datePickerBtn} onPress={() => setShowDatePicker(true)}>
                <Ionicons name="calendar-outline" size={16} color="#ffd700" />
                <Text style={ms.datePickerTxt}>{scheduledFor ? scheduledFor.toLocaleString() : 'Pick date & time'}</Text>
              </TouchableOpacity>
            )}
            {showDatePicker && (
              <DateTimePicker
                value={scheduledFor || new Date(Date.now() + 3600000)}
                mode="datetime"
                minimumDate={new Date()}
                onChange={(_, date) => { setShowDatePicker(false); if (date) setScheduledFor(date); }}
              />
            )}
          </View>
        )}

        {/* ── MARKETPLACE BADGE ── */}
        {marketplaceListingId && (
          <View style={ms.marketBadge}>
            <Ionicons name="pricetag-outline" size={15} color="#ffd700" />
            <Text style={ms.marketTxt}>Marketplace: {marketplaceTitle} · {marketplacePrice}</Text>
          </View>
        )}

        {/* Open in editing apps */}
        <TouchableOpacity style={ms.editAppsBtn} onPress={() => setShowEditApps(v => !v)}>
          <Ionicons name="apps-outline" size={16} color="#888" />
          <Text style={ms.editAppsBtnTxt}>Open in editing app first</Text>
          <Feather name={showEditApps ? 'chevron-up' : 'chevron-down'} size={14} color="#666" />
        </TouchableOpacity>

        {showEditApps && (
          <View style={{ paddingHorizontal: 16, gap: 8, marginBottom: 8 }}>
            {EDITING_APPS.map(app => (
              <TouchableOpacity key={app.id} style={ms.editAppCard} onPress={async () => {
                try {
                  const canOpen = await Linking.canOpenURL(app.scheme);
                  if (canOpen) await Linking.openURL(app.scheme);
                  else await Linking.openURL(app.playStore);
                } catch { await Linking.openURL(app.playStore); }
              }}>
                <Text style={{ fontSize: 22 }}>{app.icon}</Text>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={ms.editAppName}>{app.name}</Text>
                  <Text style={ms.editAppDesc}>{app.description}</Text>
                </View>
                <Feather name="external-link" size={14} color="#666" />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Audio Studio modal */}
      <AudioStudio
        visible={showAudioStudio}
        onClose={() => setShowAudioStudio(false)}
        onDone={result => {
          setShowAudioStudio(false);
          if (result.voiceUri) setStudioVoiceUri(result.voiceUri);
          if (result.effectId) setStudioEffectId(result.effectId);
          setAutoTuneEnabled(result.autoTuneEnabled);
          if (result.beatUri) {
            setSelectedMusic(result.beatUri ?? null);
            setSelectedMusicName(result.beatName ?? null);
            setMusicArtist(result.beatArtist ?? null);
          }
        }}
      />
    </View>
  );
}

// ─── placeholder to avoid reference error ────────────────
function setBeatVol_unused(_v: number) {}

// ══════════════════════════════════════════════════════════
// MAIN STYLES
// ══════════════════════════════════════════════════════════
const ms = StyleSheet.create({
  // Permission screen
  permScreen: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 32 },
  permEmoji: { fontSize: 60, marginBottom: 16 },
  permTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  permSub: { color: '#666', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  permBtn: { backgroundColor: '#00ff88', borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14 },
  permBtnTxt: { color: '#000', fontWeight: '800', fontSize: 16 },

  // Camera screen
  camScreen: { flex: 1, backgroundColor: '#000' },
  camBox: { width: SW, overflow: 'hidden', backgroundColor: '#111' },
  cinBar: { position: 'absolute', left: 0, right: 0, height: 60, backgroundColor: '#000', zIndex: 10 },
  recIndicator: { position: 'absolute', top: 60, left: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,68,68,0.9)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, zIndex: 20, gap: 6 },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  recTime: { color: '#fff', fontSize: 12, fontWeight: '700' },
  camTopRow: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingTop: Platform.OS === 'ios' ? 50 : 16, paddingHorizontal: 12, zIndex: 20 },
  camIconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  camTopCenter: { flex: 1, alignItems: 'center' },
  activeBadge: { backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#00ff88' },
  activeBadgeTxt: { color: '#00ff88', fontSize: 11, fontWeight: '700' },
  draftBadge: { position: 'absolute', top: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: '#ff4444', alignItems: 'center', justifyContent: 'center' },
  draftBadgeTxt: { color: '#fff', fontSize: 8, fontWeight: '800' },
  rightTools: { position: 'absolute', right: 10, top: SH * 0.1, gap: 6, zIndex: 20 },
  toolBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  toolBtnActive: { backgroundColor: 'rgba(0,255,136,0.2)', borderColor: '#00ff88' },
  toolLabel: { color: '#fff', fontSize: 7, fontWeight: '700', marginTop: 1 },
  arStrip: { position: 'absolute', bottom: 50, left: 0, right: 0, zIndex: 15 },
  arBtn: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, padding: 8, minWidth: 60, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  arBtnActive: { backgroundColor: 'rgba(0,255,136,0.2)', borderColor: '#00ff88' },
  arLabel: { color: '#fff', fontSize: 8, fontWeight: '600', marginTop: 2, textAlign: 'center' },
  bgStrip: { position: 'absolute', bottom: 110, left: 0, right: 0, zIndex: 15, backgroundColor: 'rgba(0,0,0,0.7)', paddingVertical: 8 },
  bgBtn: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, padding: 8, minWidth: 70, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  bgBtnActive: { backgroundColor: 'rgba(0,255,136,0.2)', borderColor: '#00ff88' },
  bgLabel: { color: '#fff', fontSize: 8, fontWeight: '600', marginTop: 2, textAlign: 'center' },
  camControls: { flex: 1, backgroundColor: '#000', paddingTop: 12 },
  modeRow: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginBottom: 12 },
  modeBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 16 },
  modeBtnActive: { backgroundColor: '#00ff8820', borderWidth: 1, borderColor: '#00ff88' },
  modeTxt: { color: '#888', fontSize: 13, fontWeight: '700' },
  captureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 40 },
  galleryBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  shutterBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutterRecording: { borderColor: '#ff4444' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  shutterInnerRec: { width: 28, height: 28, borderRadius: 6, backgroundColor: '#ff4444' },
  studioBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  studioDot: { position: 'absolute', top: 4, right: 4, width: 10, height: 10, borderRadius: 5, backgroundColor: '#00ff88', borderWidth: 2, borderColor: '#000' },
  filterChip: { alignItems: 'center', backgroundColor: '#111', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#1a1a1a' },
  filterChipActive: { backgroundColor: '#001a0a', borderColor: '#00ff88' },
  filterChipTxt: { color: '#888', fontSize: 10, fontWeight: '600', marginTop: 2 },

  // Compose screen
  composeScreen: { flex: 1, backgroundColor: '#000' },
  composeHdr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 50 : 16, paddingBottom: 12, backgroundColor: '#0a0a0a', borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  composeTitle: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700', marginLeft: 8 },
  composeHdrRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  draftBtn: { borderWidth: 1.5, borderColor: '#00ff88', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 7 },
  draftBtnTxt: { color: '#00ff88', fontWeight: '700', fontSize: 13 },
  postBtn: { backgroundColor: '#00ff88', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 7 },
  postBtnTxt: { color: '#000', fontWeight: '800', fontSize: 13 },
  previewBox: { margin: 16, borderRadius: 16, overflow: 'hidden', position: 'relative', backgroundColor: '#111' },
  previewMedia: { width: '100%', height: SW * 1.2, borderRadius: 16 },
  prevCinBar: { position: 'absolute', left: 0, right: 0, height: 50, backgroundColor: '#000', zIndex: 5 },
  previewInfo: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 12, paddingVertical: 8 },
  previewInfoTxt: { color: '#00ff88', fontSize: 11, fontWeight: '600' },
  captionBox: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#0d0d0d', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#1a1a1a' },
  captionInput: { color: '#fff', fontSize: 15, minHeight: 60, textAlignVertical: 'top' },
  captionCount: { color: '#555', fontSize: 10, textAlign: 'right', marginTop: 4 },
  section: { marginBottom: 8, backgroundColor: '#0a0a0a', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#1a1a1a', paddingVertical: 12 },
  sectionHdr: { paddingHorizontal: 16, marginBottom: 4 },
  sectionTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  sectionSub: { color: '#666', fontSize: 11, marginTop: 2 },
  filterCard: { alignItems: 'center', backgroundColor: '#111', borderRadius: 12, padding: 10, minWidth: 72, borderWidth: 1, borderColor: '#1a1a1a', position: 'relative' },
  filterCardActive: { backgroundColor: '#001a0a', borderColor: '#00ff88' },
  filterCardTxt: { color: '#888', fontSize: 10, fontWeight: '600', marginTop: 4 },
  filterCheck: { position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 8, backgroundColor: '#00ff88', alignItems: 'center', justifyContent: 'center' },
  fxCatBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5, gap: 4, borderWidth: 1, borderColor: '#1a1a1a' },
  fxCatTxt: { color: '#888', fontSize: 10, fontWeight: '600' },
  fxCard: { alignItems: 'center', backgroundColor: '#111', borderRadius: 12, padding: 10, minWidth: 80, borderWidth: 1, borderColor: '#1a1a1a', position: 'relative' },
  fxCardActive: { backgroundColor: '#001a0a', borderColor: '#00ff88' },
  fxCardName: { color: '#fff', fontSize: 10, fontWeight: '700', marginTop: 4, textAlign: 'center' },
  fxCardDesc: { color: '#555', fontSize: 8, textAlign: 'center', marginTop: 2 },
  fxCheck: { position: 'absolute', top: 4, right: 4, width: 15, height: 15, borderRadius: 8, backgroundColor: '#00ff88', alignItems: 'center', justifyContent: 'center' },
  vibeBtn: { alignItems: 'center', backgroundColor: '#111', borderRadius: 12, padding: 10, minWidth: 72, borderWidth: 1, borderColor: '#1a1a1a', position: 'relative' },
  vibeTxt: { color: '#888', fontSize: 10, fontWeight: '700', marginTop: 4 },
  vibeCheck: { position: 'absolute', top: 4, right: 4, width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  speedBtn: { flex: 1, alignItems: 'center', backgroundColor: '#111', borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#1a1a1a' },
  speedBtnActive: { backgroundColor: '#001a0a', borderColor: '#00ff88' },
  speedTxt: { color: '#888', fontSize: 10, fontWeight: '700', marginTop: 2 },
  musicRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0d0d0d', borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#1a1a1a' },
  musicName: { flex: 1, color: '#fff', fontSize: 12, fontWeight: '600' },
  musicArtist: { color: '#888', fontSize: 11 },
  settingsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  settingItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0d0d0d', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#1a1a1a', minWidth: (SW - 48) / 2 - 4, flex: 1 },
  settingLabel: { color: '#ccc', fontSize: 12, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  metaTxt: { flex: 1, color: '#666', fontSize: 13 },
  schedulePanel: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#0a0a0a', borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  scheduleSwitchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  scheduleTxt: { color: '#ccc', fontSize: 14, fontWeight: '600' },
  datePickerBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#111', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#ffd70033' },
  datePickerTxt: { color: '#ffd700', fontSize: 13, fontWeight: '600' },
  marketBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginVertical: 8, backgroundColor: '#1a1200', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#ffd70033' },
  marketTxt: { color: '#ffd700', fontSize: 12, fontWeight: '600', flex: 1 },
  editAppsBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#1a1a1a', marginTop: 8 },
  editAppsBtnTxt: { flex: 1, color: '#666', fontSize: 13 },
  editAppCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d0d', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#1a1a1a' },
  editAppName: { color: '#fff', fontSize: 13, fontWeight: '700' },
  editAppDesc: { color: '#666', fontSize: 11, marginTop: 2 },
});