// FILE: features/live/components/LiveChatPanel.tsx
// Kinsta Live — Realtime chat panel with loyalty badges

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLiveStore, LiveMessage } from '../constants/store/useLiveStore'; 
import { sendChatMessage } from '../constants/services/liveService'; 
import { useAuth } from '@/contexts/AuthContext'; 
import { LOYALTY_RANKS } from '../constants/gifts';

interface Props {
  roomId: string;
}

export default function LiveChatPanel({ roomId }: Props) {
  const { user } = useAuth();
  const messages = useLiveStore((s) => s.messages);
  const [text, setText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || !user?.id) return;
    setText('');
    try {
      await sendChatMessage({ roomId, userId: user.id, content: trimmed });
    } catch (err) {
      console.error('sendChatMessage error:', err);
    }
  };

  const renderMessage = ({ item }: { item: LiveMessage }) => {
    if (item.messageType === 'join') {
      return (
        <Text style={styles.systemMsg}>
          👋 {item.displayName} joined
        </Text>
      );
    }

    if (item.messageType === 'gift') {
      return (
        <View style={styles.giftMsg}>
          <Text style={styles.giftMsgText}>🎁 {item.content}</Text>
        </View>
      );
    }

    const rank = item.loyaltyRank ?? 'viewer';
    const rankData = LOYALTY_RANKS[rank as keyof typeof LOYALTY_RANKS];

    return (
      <View style={styles.chatMsg}>
        <Text style={styles.chatName}>
          {rankData?.emoji}{' '}
          <Text style={styles.chatNameText}>{item.displayName}</Text>
          {'  '}
        </Text>
        <Text style={styles.chatContent}>{item.content}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Messages — limited to 8 visible for readability */}
      <FlatList
        ref={flatListRef}
        data={messages.slice(-30)}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        pointerEvents="none"
      />

      {/* Input row */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Say something..."
          placeholderTextColor="#555"
          value={text}
          onChangeText={setText}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          maxLength={150}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={!text.trim()}>
          <Text style={styles.sendBtnText}>➤</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const chatStyles = StyleSheet.create({
  container: { marginBottom: 8, marginHorizontal: 8 },
  list: { maxHeight: 200 },
  listContent: { paddingHorizontal: 4, paddingBottom: 4 },
  systemMsg: { color: '#666', fontSize: 11, paddingVertical: 2, paddingHorizontal: 4 },
  giftMsg: {
    backgroundColor: 'rgba(224,64,251,0.2)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginVertical: 2,
    alignSelf: 'flex-start',
  },
  giftMsgText: { color: '#E040FB', fontSize: 12, fontWeight: '600' },
  chatMsg: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  chatName: { flexDirection: 'row', alignItems: 'center' },
  chatNameText: { color: '#E040FB', fontSize: 12, fontWeight: '700' },
  chatContent: { color: '#fff', fontSize: 13, flexShrink: 1 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 14,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E040FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: { color: '#fff', fontSize: 16 },
});

// Re-export with correct styles
const styles = chatStyles; 
