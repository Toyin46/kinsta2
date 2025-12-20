// components/TipButton.tsx
// Example component showing how to implement tipping functionality

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuthStore } from '@/store/authStore';
import {
  sendTip,
  validateBalance,
  formatCoins,
  coinsToUSD,
} from '@/utils/coinUtils';

interface TipButtonProps {
  postId: string;
  postAuthorId: string;
  postAuthorName: string;
}

export default function TipButton({
  postId,
  postAuthorId,
  postAuthorName,
}: TipButtonProps) {
  const { user } = useAuthStore();
  const userId = user?.id;

  const [modalVisible, setModalVisible] = useState(false);
  const [tipAmount, setTipAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const quickTipAmounts = [0.1, 0.5, 1, 5];

  const handleTip = async (amount: number) => {
    if (!userId) {
      Alert.alert('Error', 'You must be logged in to send tips');
      return;
    }

    if (userId === postAuthorId) {
      Alert.alert('Oops', "You can't tip yourself! 😊");
      return;
    }

    setLoading(true);

    try {
      // Validate balance first
      const balanceCheck = await validateBalance(userId, amount);
     
      if (!balanceCheck.valid) {
        Alert.alert('Insufficient Balance', balanceCheck.error || 'Not enough coins');
        setLoading(false);
        return;
      }

      // Send the tip
      const result = await sendTip(userId, postAuthorId, amount, postId);

      if (result.success) {
        Alert.alert(
          'Tip Sent! 🎉',
          `You sent ${formatCoins(amount)} coins ($${coinsToUSD(amount)}) to ${postAuthorName}`,
          [
            {
              text: 'OK',
              onPress: () => {
                setModalVisible(false);
                setTipAmount('');
              },
            },
          ]
        );
      } else {
        Alert.alert('Failed', result.error || 'Could not send tip');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickTip = (amount: number) => {
    handleTip(amount);
  };

  const handleCustomTip = () => {
    const amount = parseFloat(tipAmount);
   
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount');
      return;
    }

    handleTip(amount);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.tipButton}
        onPress={() => setModalVisible(true)}
      >
        <Feather name="dollar-sign" size={18} color="#ffd700" />
        <Text style={styles.tipButtonText}>Tip</Text>
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Send Tip</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Feather name="x" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Recipient */}
            <View style={styles.recipientSection}>
              <Text style={styles.recipientLabel}>To:</Text>
              <Text style={styles.recipientName}>{postAuthorName}</Text>
            </View>

            {/* Quick Tip Amounts */}
            <View style={styles.quickTipsSection}>
              <Text style={styles.sectionTitle}>Quick Tip</Text>
              <View style={styles.quickTipsGrid}>
                {quickTipAmounts.map((amount) => (
                  <TouchableOpacity
                    key={amount}
                    style={styles.quickTipButton}
                    onPress={() => handleQuickTip(amount)}
                    disabled={loading}
                  >
                    <Text style={styles.quickTipAmount}>
                      {formatCoins(amount)}
                    </Text>
                    <Text style={styles.quickTipUSD}>
                      ${coinsToUSD(amount)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Custom Amount */}
            <View style={styles.customSection}>
              <Text style={styles.sectionTitle}>Custom Amount</Text>
              <View style={styles.inputContainer}>
                <Feather name="dollar-sign" size={20} color="#00ff88" />
                <TextInput
                  style={styles.input}
                  placeholder="Enter amount"
                  placeholderTextColor="#666"
                  keyboardType="decimal-pad"
                  value={tipAmount}
                  onChangeText={setTipAmount}
                />
                <Text style={styles.coinLabel}>coins</Text>
              </View>
             
              {tipAmount && !isNaN(parseFloat(tipAmount)) && (
                <Text style={styles.usdEquivalent}>
                  ≈ ${coinsToUSD(parseFloat(tipAmount))} USD
                </Text>
              )}
            </View>

            {/* Send Button */}
            <TouchableOpacity
              style={[
                styles.sendButton,
                loading && styles.sendButtonDisabled,
              ]}
              onPress={handleCustomTip}
              disabled={loading || !tipAmount}
            >
              {loading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Feather name="send" size={20} color="#000" />
                  <Text style={styles.sendButtonText}>Send Tip</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Info */}
            <Text style={styles.infoText}>
              Tips help creators continue making great content! 💚
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  tipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderWidth: 1,
    borderColor: '#ffd700',
  },
  tipButtonText: {
    color: '#ffd700',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#000',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: '#00ff88',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00ff88',
  },
  recipientSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  recipientLabel: {
    fontSize: 16,
    color: '#666',
    marginRight: 8,
  },
  recipientName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  quickTipsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  quickTipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickTipButton: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: '#0a0a0a',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#00ff88',
  },
  quickTipAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00ff88',
    marginBottom: 4,
  },
  quickTipUSD: {
    fontSize: 12,
    color: '#666',
  },
  customSection: {
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#00ff88',
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  coinLabel: {
    fontSize: 16,
    color: '#666',
  },
  usdEquivalent: {
    fontSize: 14,
    color: '#00ff88',
    marginTop: 8,
    textAlign: 'center',
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00ff88',
    padding: 18,
    borderRadius: 12,
    gap: 8,
    marginBottom: 16,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
}); 
	
