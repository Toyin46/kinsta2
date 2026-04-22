import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function Return() {
  const [countdown, setCountdown] = useState(3);
  const params = useLocalSearchParams();

  useEffect(() => {
    const sessionId = params.session_id;

    if (!sessionId) {
      router.replace('/buy-coins');
      return;
    }

    // Countdown and redirect to wallet
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.replace('./wallet');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [params.session_id]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={64} color="#10b981" />
        </View>
        
        <Text style={styles.title}>Payment Successful!</Text>
        
        <Text style={styles.description}>
          Your coins have been added to your account.
        </Text>
        
        <Text style={styles.countdown}>
          Redirecting to your wallet in {countdown} seconds...
        </Text>
        
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace('./wallet')}
        >
          <Text style={styles.buttonText}>Go to Wallet Now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  iconContainer: {
    width: 80,
    height: 80,
    backgroundColor: '#d1fae5',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10b981',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 24,
    textAlign: 'center',
  },
  countdown: {
    fontSize: 14,
    color: '#9ca3af',
    marginBottom: 16,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});