// FILE: features/live/components/GiftPanel.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { GIFTS, Gift, COIN_PACKAGES } from '../constants/gifts';
import { sendGift } from '../constants/services/liveService'; 
import { useAuth } from '@/contexts/AuthContext'; 

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  roomId: string;
  receiverId: string;
  onClose: () => void;
}

type Tab = 'gifts' | 'coins';

export default function GiftPanel({ roomId, receiverId, onClose }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('gifts');
  const [selectedGift, setSelectedGift] = useState<Gift | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [sending, setSending] = useState(false);

  const handleSendGift = async () => {
    if (!selectedGift || !user?.id) return;
    setSending(true);
    try {
      await sendGift({
        roomId,
        senderId: user.id,
        receiverId,
        giftId: selectedGift.id,
        giftName: selectedGift.name,
        giftEmoji: selectedGift.emoji,
        coinCost: selectedGift.coinCost,
        quantity,
        animationType: selectedGift.animationType,
      });
      onClose();
    } catch (err: any) {
      if (err.message === 'INSUFFICIENT_COINS') {
        Alert.alert(
          'Not enough coins',
          'Buy more coins to send this gift!',
          [
            { text: 'Buy Coins', onPress: () => setTab('coins') },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      } else {
        Alert.alert('Error', 'Could not send gift. Please try again.');
      }
    } finally {
      setSending(false);
    }
  };

  const renderGift = ({ item }: { item: Gift }) => {
    const isSelected = selectedGift?.id === item.id;
    return (
      <TouchableOpacity
        style={[
          styles.giftItem,
          isSelected && { borderColor: item.color, borderWidth: 2 },
        ]}
        onPress={() => {
          setSelectedGift(item);
          setQuantity(1);
        }}
      >
        <Text style={styles.giftEmoji}>{item.emoji}</Text>
        <Text style={styles.giftName} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.giftCost}>
          <Text style={styles.coinIcon}>🪙</Text>
          <Text style={styles.giftCostText}>{item.coinCost}</Text>
        </View>
        {item.tier === 'ultra' && (
          <View style={styles.ultraBadge}>
            <Text style={styles.ultraText}>ULTRA</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderCoinPackage = ({ item }: { item: (typeof COIN_PACKAGES)[0] }) => (
    <TouchableOpacity
      style={[styles.coinPkg, item.popular && styles.coinPkgPopular]}
    >
      {item.popular && (
        <View style={styles.popularBadge}>
          <Text style={styles.popularText}>BEST VALUE</Text>
        </View>
      )}
      <Text style={styles.coinPkgCoins}>
        🪙 {item.coins.toLocaleString()}
      </Text>
      <Text style={styles.coinPkgPrice}>₦{item.priceNGN.toLocaleString()}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={styles.sheet}>
        {/* Handle + Tabs */}
        <View style={styles.header}>
          <View style={styles.handle} />
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'gifts' && styles.tabBtnActive]}
              onPress={() => setTab('gifts')}
            >
              <Text style={[styles.tabText, tab === 'gifts' && styles.tabTextActive]}>
                🎁 Gifts
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'coins' && styles.tabBtnActive]}
              onPress={() => setTab('coins')}
            >
              <Text style={[styles.tabText, tab === 'coins' && styles.tabTextActive]}>
                🪙 Buy Coins
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {tab === 'gifts' ? (
          <>
            <FlatList
              data={GIFTS}
              keyExtractor={(g) => g.id}
              renderItem={renderGift}
              numColumns={4}
              columnWrapperStyle={styles.giftRow}
              contentContainerStyle={styles.giftList}
              showsVerticalScrollIndicator={false}
            />

            {selectedGift && (
              <View style={styles.sendBar}>
                <View style={styles.sendBarLeft}>
                  <Text style={styles.sendBarEmoji}>{selectedGift.emoji}</Text>
                  <View>
                    <Text style={styles.sendBarName}>{selectedGift.name}</Text>
                    <Text style={styles.sendBarCost}>
                      🪙 {(selectedGift.coinCost * quantity).toLocaleString()} coins
                    </Text>
                  </View>
                </View>

                {/* Quantity */}
                <View style={styles.qtyRow}>
                  {[1, 5, 10, 50].map((q) => (
                    <TouchableOpacity
                      key={q}
                      style={[styles.qtyBtn, quantity === q && styles.qtyBtnActive]}
                      onPress={() => setQuantity(q)}
                    >
                      <Text
                        style={[
                          styles.qtyText,
                          quantity === q && { color: '#fff' },
                        ]}
                      >
                        ×{q}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.sendBtn, sending && { opacity: 0.6 }]}
                  onPress={handleSendGift}
                  disabled={sending}
                >
                  {sending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.sendBtnText}>Send</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          <FlatList
            data={COIN_PACKAGES}
            keyExtractor={(p) => p.id}
            renderItem={renderCoinPackage}
            contentContainerStyle={styles.coinList}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: '#111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.6,
    paddingBottom: 30,
  },
  header: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    marginBottom: 14,
  },
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
  },
  tabBtnActive: { backgroundColor: '#2A1A35' },
  tabText: { color: '#777', fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: '#E040FB' },
  giftList: { paddingHorizontal: 8, paddingTop: 12, paddingBottom: 8 },
  giftRow: { justifyContent: 'space-around', marginBottom: 8 },
  giftItem: {
    width: '22%',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    position: 'relative',
  },
  giftEmoji: { fontSize: 28, marginBottom: 4 },
  giftName: { color: '#aaa', fontSize: 10, textAlign: 'center', marginBottom: 4 },
  giftCost: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  coinIcon: { fontSize: 9 },
  giftCostText: { color: '#FFD700', fontSize: 10, fontWeight: '700' },
  ultraBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#E040FB',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  ultraText: { color: '#fff', fontSize: 7, fontWeight: '900' },
  sendBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    margin: 12,
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  sendBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  sendBarEmoji: { fontSize: 28 },
  sendBarName: { color: '#fff', fontWeight: '700', fontSize: 13 },
  sendBarCost: { color: '#FFD700', fontSize: 11 },
  qtyRow: { flexDirection: 'row', gap: 4 },
  qtyBtn: {
    width: 32,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyBtnActive: { backgroundColor: '#E040FB' },
  qtyText: { color: '#aaa', fontSize: 11, fontWeight: '700' },
  sendBtn: {
    backgroundColor: '#E040FB',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  sendBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  coinList: { padding: 16, gap: 10 },
  coinPkg: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    position: 'relative',
    overflow: 'hidden',
  },
  coinPkgPopular: { borderColor: '#E040FB' },
  popularBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#E040FB',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  popularText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  coinPkgCoins: { color: '#FFD700', fontSize: 16, fontWeight: '800' },
  coinPkgPrice: { color: '#fff', fontSize: 15, fontWeight: '700' },
}); 
