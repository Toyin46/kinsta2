// app/auth/signup.tsx
// Signup screen with email/phone support and referral code

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/config/supabase';
import { processReferral } from '@/utils/coinUtils';

type SignupMethod = 'email' | 'phone';

export default function SignupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [signupMethod, setSignupMethod] = useState<SignupMethod>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showReferral, setShowReferral] = useState(false);

  useEffect(() => {
    // Check if referral code was passed via URL
    if (params.ref) {
      setReferralCode(params.ref as string);
      setShowReferral(true);
    }
  }, [params.ref]);

  const formatPhoneNumber = (text: string) => {
    // Remove all non-numeric characters
    const cleaned = text.replace(/\D/g, '');
   
    // Limit to 11 digits (assuming format like 1234567890)
    const limited = cleaned.slice(0, 11);
   
    // Format as +1 (234) 567-8900 or similar
    if (limited.length <= 3) {
      return limited;
    } else if (limited.length <= 6) {
      return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
    } else if (limited.length <= 10) {
      return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
    } else {
      return `+${limited.slice(0, 1)} (${limited.slice(1, 4)}) ${limited.slice(4, 7)}-${limited.slice(7)}`;
    }
  };

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePhone = (phone: string) => {
    // Remove all non-numeric characters
    const cleaned = phone.replace(/\D/g, '');
    // Must be at least 10 digits
    return cleaned.length >= 10;
  };

  const validateInputs = () => {
    if (!username || !displayName || !password) {
      Alert.alert('Error', 'Please fill in all required fields');
      return false;
    }

    if (signupMethod === 'email') {
      if (!email) {
        Alert.alert('Error', 'Please enter your email');
        return false;
      }
      if (!validateEmail(email)) {
        Alert.alert('Error', 'Please enter a valid email address');
        return false;
      }
    } else {
      if (!phone) {
        Alert.alert('Error', 'Please enter your phone number');
        return false;
      }
      if (!validatePhone(phone)) {
        Alert.alert('Error', 'Please enter a valid phone number (at least 10 digits)');
        return false;
      }
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return false;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return false;
    }

    if (username.length < 3) {
      Alert.alert('Error', 'Username must be at least 3 characters');
      return false;
    }

    // Username validation
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      Alert.alert('Error', 'Username can only contain letters, numbers, and underscores');
      return false;
    }

    return true;
  };

  const handleSignup = async () => {
    if (!validateInputs()) return;

    setLoading(true);

    try {
      // Check if username is already taken
      const { data: existingUser } = await supabase
        .from('users')
        .select('username')
        .eq('username', username.toLowerCase())
        .single();

      if (existingUser) {
        Alert.alert('Error', 'Username already taken');
        setLoading(false);
        return;
      }

      let authData;
      let authError;

      // Create auth account based on method
      if (signupMethod === 'email') {
        const result = await supabase.auth.signUp({
          email,
          password,
        });
        authData = result.data;
        authError = result.error;
      } else {
        // Phone signup
        const cleanedPhone = phone.replace(/\D/g, '');
        const formattedPhone = cleanedPhone.startsWith('1')
          ? `+${cleanedPhone}`
          : `+1${cleanedPhone}`;
       
        const result = await supabase.auth.signUp({
          phone: formattedPhone,
          password,
        });
        authData = result.data;
        authError = result.error;
      }

      if (authError) throw authError;

      if (!authData.user) {
        throw new Error('Signup failed - no user returned');
      }

      const userId = authData.user.id;

      // Create user profile
      const profileData: any = {
        id: userId,
        username: username.toLowerCase(),
        display_name: displayName,
        coins: 0,
        coins_sent: 0,
        coins_received: 0,
        created_at: new Date().toISOString(),
      };

      // Add email or phone to profile
      if (signupMethod === 'email') {
        profileData.email = email;
      } else {
        const cleanedPhone = phone.replace(/\D/g, '');
        profileData.phone = cleanedPhone.startsWith('1')
          ? `+${cleanedPhone}`
          : `+1${cleanedPhone}`;
      }

      const { error: profileError } = await supabase
        .from('users')
        .insert(profileData);

      if (profileError) throw profileError;

      // Process referral code if provided
      if (referralCode.trim()) {
        console.log('🎁 Processing referral code:', referralCode);
      
        const referralResult = await processReferral(userId, referralCode.toUpperCase());
      
        if (referralResult.success) {
          console.log('✅ Referral processed successfully');
         
          if (signupMethod === 'phone') {
            Alert.alert(
              'Verify Your Phone',
              'A verification code has been sent to your phone. Please verify to complete signup.',
              [
                {
                  text: 'Continue',
                  onPress: () => router.replace('/(tabs)/home' as any),
                },
              ]
            );
          } else {
            Alert.alert(
              'Welcome! 🎉',
              'Your account has been created! Check your email to verify your account.',
              [
                {
                  text: 'Get Started',
                  onPress: () => router.replace('/(tabs)/home' as any),
                },
              ]
            );
          }
        } else {
          console.log('⚠️ Invalid referral code, but signup succeeded');
         
          const message = signupMethod === 'phone'
            ? 'Your account is ready! Please verify your phone number. (Referral code was invalid)'
            : 'Your account is ready! Check your email. (Referral code was invalid)';
         
          Alert.alert(
            'Account Created',
            message,
            [
              {
                text: 'Continue',
                onPress: () => router.replace('/(tabs)/home' as any),
              },
            ]
          );
        }
      } else {
        // No referral code
        if (signupMethod === 'phone') {
          Alert.alert(
            'Welcome! 🎉',
            'A verification code has been sent to your phone number.',
            [
              {
                text: 'Continue',
                onPress: () => router.replace('/(tabs)/home' as any),
              },
            ]
          );
        } else {
          Alert.alert(
            'Welcome! 🎉',
            'Your account has been created! Please check your email to verify.',
            [
              {
                text: 'Get Started',
                onPress: () => router.replace('/(tabs)/home' as any),
              },
            ]
          );
        }
      }

    } catch (error: any) {
      console.error('Signup error:', error);
      Alert.alert('Signup Failed', error.message || 'An error occurred during signup');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Feather name="arrow-left" size={24} color="#00ff88" />
          </TouchableOpacity>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join the community today!</Text>
        </View>

        {/* Signup Method Toggle */}
        <View style={styles.methodToggle}>
          <TouchableOpacity
            style={[
              styles.methodButton,
              signupMethod === 'email' && styles.methodButtonActive
            ]}
            onPress={() => setSignupMethod('email')}
          >
            <Feather
              name="mail"
              size={20}
              color={signupMethod === 'email' ? '#00ff88' : '#666'}
            />
            <Text style={[
              styles.methodButtonText,
              signupMethod === 'email' && styles.methodButtonTextActive
            ]}>
              Email
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.methodButton,
              signupMethod === 'phone' && styles.methodButtonActive
            ]}
            onPress={() => setSignupMethod('phone')}
          >
            <Feather
              name="phone"
              size={20}
              color={signupMethod === 'phone' ? '#00ff88' : '#666'}
            />
            <Text style={[
              styles.methodButtonText,
              signupMethod === 'phone' && styles.methodButtonTextActive
            ]}>
              Phone
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Display Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Display Name</Text>
            <View style={styles.inputContainer}>
              <Feather name="user" size={20} color="#00ff88" />
              <TextInput
                style={styles.input}
                placeholder="Your name"
                placeholderTextColor="#666"
                value={displayName}
                onChangeText={setDisplayName}
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* Username */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <View style={styles.inputContainer}>
              <Feather name="at-sign" size={20} color="#00ff88" />
              <TextInput
                style={styles.input}
                placeholder="username"
                placeholderTextColor="#666"
                value={username}
                onChangeText={(text) => setUsername(text.toLowerCase())}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <Text style={styles.helperText}>
              Letters, numbers, and underscores only
            </Text>
          </View>

          {/* Email or Phone based on method */}
          {signupMethod === 'email' ? (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputContainer}>
                <Feather name="mail" size={20} color="#00ff88" />
                <TextInput
                  style={styles.input}
                  placeholder="email@example.com"
                  placeholderTextColor="#666"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
          ) : (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.inputContainer}>
                <Feather name="phone" size={20} color="#00ff88" />
                <TextInput
                  style={styles.input}
                  placeholder="(123) 456-7890"
                  placeholderTextColor="#666"
                  value={phone}
                  onChangeText={(text) => setPhone(formatPhoneNumber(text))}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                />
              </View>
              <Text style={styles.helperText}>
                You'll receive a verification code
              </Text>
            </View>
          )}

          {/* Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputContainer}>
              <Feather name="lock" size={20} color="#00ff88" />
              <TextInput
                style={styles.input}
                placeholder="Password (min 6 characters)"
                placeholderTextColor="#666"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Feather
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color="#666"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirm Password</Text>
            <View style={styles.inputContainer}>
              <Feather name="lock" size={20} color="#00ff88" />
              <TextInput
                style={styles.input}
                placeholder="Confirm your password"
                placeholderTextColor="#666"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
            </View>
          </View>

          {/* Referral Code Toggle */}
          <TouchableOpacity
            style={styles.referralToggle}
            onPress={() => setShowReferral(!showReferral)}
          >
            <Feather name="gift" size={20} color="#ffd700" />
            <Text style={styles.referralToggleText}>
              {showReferral ? 'Hide' : 'Have a'} Referral Code?
            </Text>
            <Feather
              name={showReferral ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="#666"
            />
          </TouchableOpacity>

          {/* Referral Code Input */}
          {showReferral && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Referral Code (Optional)</Text>
              <View style={[styles.inputContainer, styles.referralInput]}>
                <Feather name="gift" size={20} color="#ffd700" />
                <TextInput
                  style={styles.input}
                  placeholder="Enter referral code"
                  placeholderTextColor="#666"
                  value={referralCode}
                  onChangeText={(text) => setReferralCode(text.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>
              <Text style={styles.referralInfo}>
                💡 Both you and your referrer will benefit!
              </Text>
            </View>
          )}

          {/* Signup Button */}
          <TouchableOpacity
            style={[styles.signupButton, loading && styles.signupButtonDisabled]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Text style={styles.signupButtonText}>Create Account</Text>
                <Feather name="arrow-right" size={20} color="#000" />
              </>
            )}
          </TouchableOpacity>

          {/* Login Link */}
          <View style={styles.loginLink}>
            <Text style={styles.loginLinkText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.replace('/auth/login' as any)}>
              <Text style={styles.loginLinkButton}>Log In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
  },
  header: {
    marginTop: 40,
    marginBottom: 24,
  },
  backButton: {
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#00ff88',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  methodToggle: {
    flexDirection: 'row',
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  methodButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  methodButtonActive: {
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
  },
  methodButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  methodButtonTextActive: {
    color: '#00ff88',
  },
  form: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginTop: 6,
    marginLeft: 4,
  },
  referralToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ffd700',
  },
  referralToggleText: {
    flex: 1,
    color: '#ffd700',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
  },
  referralInput: {
    borderColor: '#ffd700',
  },
  referralInfo: {
    fontSize: 12,
    color: '#ffd700',
    marginTop: 8,
  },
  signupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00ff88',
    padding: 18,
    borderRadius: 12,
    marginTop: 8,
    gap: 8,
  },
  signupButtonDisabled: {
    opacity: 0.5,
  },
  signupButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loginLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
    marginBottom: 24,
  },
  loginLinkText: {
    color: '#666',
    fontSize: 14,
  },
  loginLinkButton: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: '600',
  },
}); 
	
