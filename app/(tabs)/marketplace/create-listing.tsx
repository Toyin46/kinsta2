// FILE: app/(tabs)/marketplace/create-listing.tsx
// ✅ FIX: Removed duplicate catch/finally blocks (ts(1005) Ln 181, ts(1128) Ln 338)
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, Image,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/config/supabase';
import { setMarketplacePostBridge } from '@/utils/marketplacePostBridge';
import { useAuthStore } from '@/store/authStore';

const CATEGORIES = [
  { id: 'creative',  label: 'Creative & Design',    icon: '🎨' },
  { id: 'social',    label: 'Social Media Services', icon: '📱' },
  { id: 'music',     label: 'Music & Entertainment', icon: '🎵' },
  { id: 'education', label: 'Education & Coaching',  icon: '📚' },
  { id: 'beauty',    label: 'Beauty & Lifestyle',    icon: '💅' },
  { id: 'tech',      label: 'Tech & Digital',        icon: '💻' },
  { id: 'trades',    label: 'Trades & Local Skills', icon: '🔧' },
  { id: 'other',     label: 'Other / Custom',        icon: '📦' },
];
const DELIVERY_OPTIONS = [
  { value: 1, label: '1 Day' }, { value: 3, label: '3 Days' },
  { value: 7, label: '7 Days' }, { value: 14, label: '14 Days' },
];
const REVISION_OPTIONS = [
  { value: '0', label: 'No revisions' }, { value: '1', label: '1 revision' },
  { value: '2', label: '2 revisions' },  { value: '3', label: '3 revisions' },
  { value: 'unlimited', label: 'Unlimited' },
];

function buildMarketplaceCaption(params: {
  title: string; priceCoins: number; category: string;
}): string {
  const { title, priceCoins, category } = params;
  const catEmoji = CATEGORIES.find(c => c.id === category)?.icon || '🛍️';
  return (
    `${catEmoji} ${title}\n\n` +
    `💰 ${priceCoins} coins to hire me\n` +
    `📦 Available on LumVibe Marketplace\n\n` +
    `#LumVibeMarketplace #Hire #${category}`
  );
}

export default function CreateListingScreen() {
  const router   = useRouter();
  const { user } = useAuthStore();

  const [title,         setTitle]         = useState('');
  const [category,      setCategory]      = useState('');
  const [description,   setDescription]   = useState('');
  const [priceCoins,    setPriceCoins]    = useState('');
  const [deliveryDays,  setDeliveryDays]  = useState(3);
  const [revisions,     setRevisions]     = useState('1');
  const [portfolioUrls, setPortfolioUrls] = useState<{ uri: string; isVideo: boolean }[]>([]);
  const [saving,        setSaving]        = useState(false);

  const handlePickImage = async () => {
    if (portfolioUrls.length >= 5) { Alert.alert('Max 5 images/videos'); return; }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        const asset   = result.assets[0];
        const isVideo = asset.type === 'video';
        setPortfolioUrls(prev => [...prev, { uri: asset.uri, isVideo }]);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const handleSave = async () => {
    if (!title.trim())           { Alert.alert('Required', 'Please enter a title'); return; }
    if (!category)               { Alert.alert('Required', 'Please select a category'); return; }
    if (description.length < 50) { Alert.alert('Too Short', 'Description must be at least 50 characters'); return; }
    const priceNum = parseInt(priceCoins);
    if (!priceNum || priceNum < 10) { Alert.alert('Invalid Price', 'Minimum price is 10 coins'); return; }

    setSaving(true);
    try {
      const firstItem    = portfolioUrls[0] || null;
      const firstIsVideo = firstItem?.isVideo ?? false;
      const firstUri     = firstItem?.uri ?? null;

      const { data: newListing, error } = await supabase
        .from('marketplace_listings')
        .insert({
          seller_id:      user!.id,
          title:          title.trim(),
          category,
          description:    description.trim(),
          price_coins:    priceNum,
          delivery_days:  deliveryDays,
          revisions,
          portfolio_urls: [],
          status:         'active',
        })
        .select('id')
        .single();

      if (error) throw error;

      if (firstUri) {
        const caption = buildMarketplaceCaption({
          title: title.trim(), priceCoins: priceNum, category,
        });

        setMarketplacePostBridge({
          listingId: newListing.id,
          caption,
          mediaUri:  firstUri,
          isVideo:   firstIsVideo,
        });

        Alert.alert(
          'Listing Created! 🎉',
          'Your service is live! Now post your media to the feed so people can discover it and hire you.',
          [
            {
              text: 'Post to Feed Now 🚀',
              onPress: () => {
                router.replace('/(tabs)/marketplace');
                setTimeout(() => router.push('/(tabs)/create' as any), 400);
              },
            },
            {
              text: 'Skip for now',
              style: 'cancel',
              onPress: () => router.replace('/(tabs)/marketplace'),
            },
          ]
        );
      } else {
        await supabase.from('posts').insert({
          user_id:              user!.id,
          caption:              buildMarketplaceCaption({ title: title.trim(), priceCoins: priceNum, category }),
          content:              description.trim(),
          media_type:           'text',
          is_published:         true,
          is_public:            true,
          likes_count:          0,
          comments_count:       0,
          views_count:          0,
          shares_count:         0,
          coins_received:       0,
          vibe_type:            'marketplace',
          cloudinary_public_id: `marketplace_listing_${newListing.id}`,
        });

        Alert.alert(
          'Listing Created! 🎉',
          'Your service is now live on the marketplace and posted to the feed!',
          [{ text: 'View Marketplace', onPress: () => router.replace('/(tabs)/marketplace') }],
        );
      }
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Create Listing</Text>
        <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.5 }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color="#000" /> : <Text style={s.saveBtnText}>Publish</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
        <Text style={s.sectionHeader}>Service Title *</Text>
        <TextInput
          style={s.input} value={title} onChangeText={setTitle}
          placeholder="E.g. I will design a professional logo"
          placeholderTextColor="#555" maxLength={80}
        />
        <Text style={s.charCount}>{title.length}/80</Text>

        <Text style={s.sectionHeader}>Category *</Text>
        <View style={s.categoryGrid}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[s.categoryChip, category === cat.id && s.categoryChipActive]}
              onPress={() => setCategory(cat.id)}
            >
              <Text style={s.categoryChipIcon}>{cat.icon}</Text>
              <Text style={[s.categoryChipLabel, category === cat.id && { color: '#00ff88' }]}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.sectionHeader}>Description * (min 50 chars)</Text>
        <TextInput
          style={[s.input, { height: 160, textAlignVertical: 'top' }]}
          value={description} onChangeText={setDescription}
          placeholder="Describe your service in detail..."
          placeholderTextColor="#555" multiline numberOfLines={6}
        />
        <Text style={[s.charCount, description.length < 50 && description.length > 0 && { color: '#ff4d4d' }]}>
          {description.length} chars {description.length < 50 ? `(need ${50 - description.length} more)` : '✓'}
        </Text>

        <Text style={s.sectionHeader}>Price (coins) * — 10 coins = $1</Text>
        <View style={s.priceRow}>
          <TextInput
            style={[s.input, { flex: 1, marginBottom: 0 }]}
            value={priceCoins} onChangeText={setPriceCoins}
            placeholder="Minimum 10 coins" placeholderTextColor="#555"
            keyboardType="number-pad"
          />
          {priceCoins ? <Text style={s.priceUSD}>≈ ${(parseInt(priceCoins || '0') / 10).toFixed(2)} USD</Text> : null}
        </View>

        <Text style={s.sectionHeader}>Delivery Time *</Text>
        <View style={s.optionRow}>
          {DELIVERY_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[s.optionChip, deliveryDays === opt.value && s.optionChipActive]}
              onPress={() => setDeliveryDays(opt.value)}
            >
              <Text style={[s.optionChipText, deliveryDays === opt.value && { color: '#00ff88' }]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.sectionHeader}>Number of Revisions *</Text>
        <View style={s.optionRow}>
          {REVISION_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[s.optionChip, revisions === opt.value && s.optionChipActive]}
              onPress={() => setRevisions(opt.value)}
            >
              <Text style={[s.optionChipText, revisions === opt.value && { color: '#00ff88' }]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.sectionHeader}>Portfolio Images / Video (up to 5)</Text>
        <Text style={s.portfolioHint}>
          💡 Adding a <Text style={{ color: '#00ff88' }}>video</Text> will auto-post to the video feed like TikTok!
        </Text>
        <View style={s.portfolioGrid}>
          {portfolioUrls.map((item, i) => (
            <View key={i} style={s.portfolioItem}>
              {item.isVideo ? (
                <View style={[s.portfolioImg, s.videoThumb]}>
                  <Feather name="play-circle" size={32} color="#00ff88" />
                  <Text style={s.videoLabel}>Video</Text>
                </View>
              ) : (
                <Image source={{ uri: item.uri }} style={s.portfolioImg} />
              )}
              <TouchableOpacity
                style={s.portfolioRemove}
                onPress={() => setPortfolioUrls(prev => prev.filter((_, idx) => idx !== i))}
              >
                <Feather name="x" size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          {portfolioUrls.length < 5 && (
            <TouchableOpacity style={s.portfolioAdd} onPress={handlePickImage} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#00ff88" />
              ) : (
                <>
                  <Feather name="plus" size={24} color="#00ff88" />
                  <Text style={s.portfolioAddText}>Photo / Video</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {portfolioUrls.length > 0 && (
          <View style={s.autoPostBadge}>
            <Feather name="zap" size={14} color="#ffd700" />
            <Text style={s.autoPostBadgeText}>
              {portfolioUrls[0].isVideo
                ? '⚡ This will auto-post to the Video Feed (TikTok-style)'
                : '⚡ This will auto-post to the main Feed'}
            </Text>
          </View>
        )}

        <View style={s.rulesBox}>
          <Text style={s.rulesTitle}>📋 Listing Rules</Text>
          <Text style={s.rulesText}>• No adult content, illegal services, or misleading listings</Text>
          <Text style={s.rulesText}>• Deliver within your stated time to avoid warnings</Text>
          <Text style={s.rulesText}>• All payments go through LumVibe — no outside transfers</Text>
          <Text style={s.rulesText}>• LumVibe takes a 10% fee on completed orders</Text>
        </View>

        <TouchableOpacity
          style={[s.publishBtn, saving && { opacity: 0.5 }]}
          onPress={handleSave} disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color="#000" />
            : <Text style={s.publishBtnText}>🚀 Publish Listing</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#000' },
  header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  headerTitle:        { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  saveBtn:            { backgroundColor: '#00ff88', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  saveBtnText:        { color: '#000', fontWeight: 'bold', fontSize: 14 },
  scroll:             { padding: 20, paddingBottom: 60 },
  sectionHeader:      { color: '#fff', fontSize: 13, fontWeight: '700', marginBottom: 10, marginTop: 20 },
  input:              { backgroundColor: '#111', borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 10, padding: 14, color: '#fff', fontSize: 14, marginBottom: 6 },
  charCount:          { color: '#555', fontSize: 11, textAlign: 'right', marginBottom: 4 },
  priceRow:           { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  priceUSD:           { color: '#00ff88', fontSize: 14, fontWeight: '600' },
  categoryGrid:       { gap: 8, marginBottom: 4 },
  categoryChip:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 10, padding: 12, gap: 10, borderWidth: 1, borderColor: '#222' },
  categoryChipActive: { backgroundColor: '#00ff8818', borderColor: '#00ff88' },
  categoryChipIcon:   { fontSize: 20 },
  categoryChipLabel:  { color: '#888', fontSize: 13, fontWeight: '600' },
  optionRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  optionChip:         { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#111', borderRadius: 8, borderWidth: 1, borderColor: '#222' },
  optionChipActive:   { backgroundColor: '#00ff8818', borderColor: '#00ff88' },
  optionChipText:     { color: '#888', fontSize: 12, fontWeight: '600' },
  portfolioGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  portfolioHint:      { color: '#555', fontSize: 12, marginBottom: 10, lineHeight: 18 },
  portfolioItem:      { width: 90, height: 90, borderRadius: 10, overflow: 'hidden', position: 'relative' },
  portfolioImg:       { width: '100%', height: '100%' },
  videoThumb:         { backgroundColor: '#0a1a0a', borderWidth: 1, borderColor: '#00ff8855', justifyContent: 'center', alignItems: 'center', gap: 4 },
  videoLabel:         { color: '#00ff88', fontSize: 10, fontWeight: '600' },
  portfolioRemove:    { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  portfolioAdd:       { width: 90, height: 90, borderRadius: 10, backgroundColor: '#111', borderWidth: 1, borderColor: '#00ff8855', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', gap: 4 },
  portfolioAddText:   { color: '#00ff88', fontSize: 10, fontWeight: '600' },
  autoPostBadge:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1a1200', borderRadius: 10, padding: 12, marginTop: 10, borderWidth: 1, borderColor: '#ffd70033' },
  autoPostBadgeText:  { color: '#ffd700', fontSize: 12, fontWeight: '600', flex: 1 },
  rulesBox:           { backgroundColor: '#0d0d0d', borderRadius: 10, padding: 16, marginTop: 24, borderWidth: 1, borderColor: '#1a1a1a' },
  rulesTitle:         { color: '#fff', fontSize: 13, fontWeight: 'bold', marginBottom: 10 },
  rulesText:          { color: '#666', fontSize: 12, lineHeight: 20 },
  publishBtn:         { backgroundColor: '#00ff88', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  publishBtnText:     { color: '#000', fontWeight: 'bold', fontSize: 16 },
}); 
