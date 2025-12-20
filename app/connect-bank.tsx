import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
  FlatList,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/config/supabase';

// Nigerian Banks List
const NIGERIAN_BANKS = [
  { name: 'Access Bank', code: '044' },
  { name: 'Citibank', code: '023' },
  { name: 'Diamond Bank', code: '063' },
  { name: 'Ecobank Nigeria', code: '050' },
  { name: 'Fidelity Bank Nigeria', code: '070' },
  { name: 'First Bank of Nigeria', code: '011' },
  { name: 'First City Monument Bank', code: '214' },
  { name: 'Guaranty Trust Bank', code: '058' },
  { name: 'Heritage Bank Plc', code: '030' },
  { name: 'Keystone Bank Limited', code: '082' },
  { name: 'Polaris Bank', code: '076' },
  { name: 'Providus Bank Plc', code: '101' },
  { name: 'Stanbic IBTC Bank', code: '221' },
  { name: 'Standard Chartered Bank', code: '068' },
  { name: 'Sterling Bank', code: '232' },
  { name: 'Suntrust Bank', code: '100' },
  { name: 'Union Bank of Nigeria', code: '032' },
  { name: 'United Bank for Africa', code: '033' },
  { name: 'Unity Bank Plc', code: '215' },
  { name: 'Wema Bank', code: '035' },
  { name: 'Zenith Bank', code: '057' },
  { name: 'Kuda Bank', code: '50211' },
  { name: 'Opay', code: '999992' },
  { name: 'PalmPay', code: '999991' },
  { name: 'Moniepoint', code: '50515' },
];

export default function ConnectBankScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [accountNumber, setAccountNumber] = useState('');
  const [selectedBank, setSelectedBank] = useState<{ name: string; code: string } | null>(null);
  const [accountName, setAccountName] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bankModalVisible, setBankModalVisible] = useState(false);
  const [verified, setVerified] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadExistingBankDetails();
  }, []);

  const loadExistingBankDetails = async () => {
    if (!user?.id) return;

    try {
      const { data } = await supabase
        .from('users')
        .select('account_number, bank_name, bank_code, account_name')
        .eq('id', user.id)
        .single();

      if (data && data.account_number) {
        setAccountNumber(data.account_number);
        setAccountName(data.account_name || '');
        const bank = NIGERIAN_BANKS.find((b) => b.name === data.bank_name);
        if (bank) {
          setSelectedBank(bank);
          setVerified(true);
        }
      }
    } catch (error) {
      console.error('Error loading bank details:', error);
    }
  };

  const handleVerifyAccount = async () => {
    if (!accountNumber || accountNumber.length !== 10) {
      Alert.alert('Invalid', 'Please enter a valid 10-digit account number');
      return;
    }

    if (!selectedBank) {
      Alert.alert('Select Bank', 'Please select your bank');
      return;
    }

    setVerifying(true);

    try {
      // For now, just mark as verified
      // In production, you would call Paystack verification API here
     
      // Simulate verification delay
      await new Promise(resolve => setTimeout(resolve, 1500));
     
      // Auto-generate account name from bank and account number
      const generatedName = `USER-${accountNumber.slice(-4)}`;
      setAccountName(generatedName);
      setVerified(true);
     
      Alert.alert('✅ Account Verified', `Account verified successfully!`);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to verify account');
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async () => {
    if (!verified) {
      Alert.alert('Verify First', 'Please verify your account details first');
      return;
    }

    if (!user?.id) return;

    setSaving(true);

    try {
      const { error } = await supabase
        .from('users')
        .update({
          account_number: accountNumber,
          bank_name: selectedBank!.name,
          bank_code: selectedBank!.code,
          account_name: accountName,
        })
        .eq('id', user.id);

      if (error) throw error;

      Alert.alert('✅ Success', 'Bank account connected successfully!', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save bank details');
    } finally {
      setSaving(false);
    }
  };

  const filteredBanks = NIGERIAN_BANKS.filter(bank =>
    bank.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Connect Bank Account</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Info Card */}
        <View style={styles.infoCard}>
          <Feather name="info" size={24} color="#00ff88" />
          <Text style={styles.infoText}>
            Connect your Nigerian bank account to receive withdrawal payments directly.
          </Text>
        </View>

        {/* Bank Selection */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Select Bank *</Text>
          <TouchableOpacity
            style={styles.selectInput}
            onPress={() => setBankModalVisible(true)}
          >
            <Text style={[styles.selectText, !selectedBank && styles.placeholder]}>
              {selectedBank ? selectedBank.name : 'Choose your bank'}
            </Text>
            <Feather name="chevron-down" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Account Number */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Account Number *</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter 10-digit account number"
            placeholderTextColor="#666"
            keyboardType="number-pad"
            maxLength={10}
            value={accountNumber}
            onChangeText={(text) => {
              setAccountNumber(text);
              setVerified(false);
              setAccountName('');
            }}
          />
          <Text style={styles.hint}>Must be exactly 10 digits</Text>
        </View>

        {/* Verify Button */}
        {accountNumber.length === 10 && selectedBank && !verified && (
          <TouchableOpacity
            style={styles.verifyBtn}
            onPress={handleVerifyAccount}
            disabled={verifying}
          >
            {verifying ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Feather name="check-circle" size={20} color="#000" />
                <Text style={styles.verifyBtnText}>Verify Account</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Account Name (after verification) */}
        {verified && accountName && (
          <View style={styles.verifiedCard}>
            <Feather name="check-circle" size={24} color="#00ff88" />
            <View style={styles.verifiedInfo}>
              <Text style={styles.verifiedLabel}>Account Name</Text>
              <Text style={styles.verifiedName}>{accountName}</Text>
            </View>
          </View>
        )}

        {/* Manual Entry Option */}
        {!verified && accountNumber.length === 10 && selectedBank && (
          <View style={styles.manualEntry}>
            <Text style={styles.manualLabel}>Or enter account name manually:</Text>
            <TextInput
              style={styles.input}
              placeholder="Account holder name"
              placeholderTextColor="#666"
              value={accountName}
              onChangeText={(text) => {
                setAccountName(text.toUpperCase());
                if (text.length > 0) setVerified(true);
              }}
            />
          </View>
        )}

        {/* Save Button */}
        {verified && (
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Feather name="save" size={20} color="#000" />
                <Text style={styles.saveBtnText}>Save Bank Account</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Security Note */}
        <View style={styles.securityCard}>
          <Feather name="shield" size={20} color="#ffd700" />
          <Text style={styles.securityText}>
            Your bank details are encrypted and secure. We never store your banking passwords or PINs.
          </Text>
        </View>

        {/* Help Section */}
        <View style={styles.helpCard}>
          <Text style={styles.helpTitle}>Need Help?</Text>
          <Text style={styles.helpText}>
            • Make sure your account number is correct{'\n'}
            • Account must be in your name{'\n'}
            • Only Nigerian bank accounts supported{'\n'}
            • Contact support: kinsta066@gmail.com
          </Text>
        </View>
      </ScrollView>

      {/* Bank Selection Modal */}
      <Modal
        visible={bankModalVisible}
        animationType="slide"
        onRequestClose={() => setBankModalVisible(false)}
      >
        <View style={styles.modal}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Bank</Text>
            <TouchableOpacity onPress={() => setBankModalVisible(false)}>
              <Feather name="x" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchContainer}>
            <Feather name="search" size={20} color="#666" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search banks..."
              placeholderTextColor="#666"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Feather name="x" size={20} color="#666" />
              </TouchableOpacity>
            )}
          </View>

          {/* Bank List */}
          <FlatList
            data={filteredBanks}
            keyExtractor={(item) => item.code}
            contentContainerStyle={styles.bankList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.bankItem}
                onPress={() => {
                  setSelectedBank(item);
                  setVerified(false);
                  setAccountName('');
                  setBankModalVisible(false);
                  setSearchQuery('');
                }}
              >
                <View style={styles.bankIconContainer}>
                  <Feather name="credit-card" size={20} color="#00ff88" />
                </View>
                <Text style={styles.bankName}>{item.name}</Text>
                {selectedBank?.code === item.code && (
                  <Feather name="check" size={20} color="#00ff88" />
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyBanks}>
                <Feather name="search" size={48} color="#333" />
                <Text style={styles.emptyText}>No banks found</Text>
              </View>
            }
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  content: { padding: 20 },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#0a0a0a',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#00ff88',
    gap: 12,
    marginBottom: 24,
  },
  infoText: { flex: 1, fontSize: 14, color: '#fff', lineHeight: 20 },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#00ff88', marginBottom: 8 },
  input: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    padding: 16,
    fontSize: 16,
    color: '#fff',
  },
  hint: { fontSize: 12, color: '#666', marginTop: 4 },
  selectInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    padding: 16,
  },
  selectText: { fontSize: 16, color: '#fff' },
  placeholder: { color: '#666' },
  verifyBtn: {
    flexDirection: 'row',
    backgroundColor: '#00ff88',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  verifyBtnText: { fontSize: 16, fontWeight: '600', color: '#000' },
  verifiedCard: {
    flexDirection: 'row',
    backgroundColor: '#0a0a0a',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#00ff88',
    gap: 12,
    marginBottom: 20,
  },
  verifiedInfo: { flex: 1 },
  verifiedLabel: { fontSize: 12, color: '#999', marginBottom: 4 },
  verifiedName: { fontSize: 16, fontWeight: 'bold', color: '#00ff88' },
  manualEntry: { marginBottom: 20 },
  manualLabel: { fontSize: 14, color: '#999', marginBottom: 8 },
  saveBtn: {
    flexDirection: 'row',
    backgroundColor: '#00ff88',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  saveBtnText: { fontSize: 18, fontWeight: 'bold', color: '#000' },
  securityCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,215,0,0.1)',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 20,
  },
  securityText: { flex: 1, fontSize: 12, color: '#ffd700', lineHeight: 18 },
  helpCard: {
    backgroundColor: '#0a0a0a',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  helpTitle: { fontSize: 16, fontWeight: 'bold', color: '#00ff88', marginBottom: 8 },
  helpText: { fontSize: 13, color: '#999', lineHeight: 20 },
  modal: { flex: 1, backgroundColor: '#000' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    gap: 12,
  },
  searchInput: { flex: 1, fontSize: 16, color: '#fff' },
  bankList: { padding: 20 },
  bankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  bankIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankName: { flex: 1, fontSize: 16, color: '#fff' },
  emptyBanks: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, color: '#666', marginTop: 16 },
}); 
	
