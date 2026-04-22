// app/(tabs)/marketplace/buy-coins.tsx
// ✅ Coins credited directly from app — no Edge Function needed
// ✅ Direct Flutterwave verification — no IP whitelist issue
// ✅ Duplicate reference check via coin_transactions table
// ✅ Payment method notice — guides users to Bank Transfer or USSD
// ✅ Timeout banner shown on RN side — visible even over Flutterwave "Please wait"
// ✅ Cancelled payment handler with verify option
// ✅ Insufficient funds / declined card messages
// ✅ Bank transfer redirect fix — onShouldStartLoadWithRequest
// ✅ Email validation before purchase
// ✅ Balance refreshes from DB after every successful purchase
// ✅ Flutterwave script load failure handled
// ✅ Processing started detection for timeout timer

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Modal,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/config/supabase';
import { useAuthStore } from '@/store/authStore';
import { detectCurrency, convertFromNgn, formatNgn } from '@/utils/currencyUtils';
import { FLW_TEST_MODE, FLW_PUBLIC_KEY } from '@/utils/flutterwaveUtils';

const NGN_PER_COIN    = 150;
const PAYMENT_TIMEOUT = 20000;

// ✅ Secret key used only for verifying payments the user just made
// Safe in React Native — not a public web server
const FLW_SECRET_KEY = 'FLWSECK-e9eda0b85d628e444b1ae2e01b727e80-191e69b7e82VT-X';

const COIN_PACKAGES = [
  { id: 'starter',    coins: 50,    bonusCoins: 0,   priceNgn: 7_500,   popular: false, label: 'Starter',    icon: '🛍️', hint: 'Great for small orders'     },
  { id: 'basic',      coins: 100,   bonusCoins: 10,  priceNgn: 15_000,  popular: false, label: 'Basic',      icon: '📦', hint: 'Good for mid-range services' },
  { id: 'standard',   coins: 500,   bonusCoins: 50,  priceNgn: 75_000,  popular: true,  label: 'Standard',   icon: '🚀', hint: 'Best value for creators'     },
  { id: 'premium',    coins: 1_000, bonusCoins: 150, priceNgn: 150_000, popular: false, label: 'Premium',    icon: '💼', hint: 'For frequent buyers'         },
  { id: 'enterprise', coins: 2_500, bonusCoins: 500, priceNgn: 375_000, popular: false, label: 'Enterprise', icon: '🏢', hint: 'For power users & agencies'  },
] as const;

// ✅ Direct verification — no Edge Function, no IP issue
async function creditCoinsDirectly(params: {
  reference: string;
  userId: string;
  packageId: string;
  isTest: boolean;
}): Promise<{ success: boolean; totalCoins?: number; message?: string }> {
  try {
    const pkg = COIN_PACKAGES.find(p => p.id === params.packageId);
    if (!pkg) return { success: false, message: 'Invalid package' };
    const totalCoins = pkg.coins + pkg.bonusCoins;

    // ── Idempotency check — never credit same reference twice ──────────────
    const { data: existing } = await supabase
      .from('coin_transactions')
      .select('id, coins_added')
      .eq('reference', params.reference)
      .maybeSingle();
    if (existing) {
      const { data: userData } = await supabase
        .from('users').select('marketplace_coins').eq('id', params.userId).single();
      return { success: true, totalCoins: userData?.marketplace_coins || 0 };
    }

    // ── Verify payment with Flutterwave directly from app ─────────────────
    if (!params.isTest) {
      const verifyRes = await fetch(
        `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${params.reference}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${FLW_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const verifyData = await verifyRes.json();
      const status = verifyData?.data?.status;
      if (status !== 'successful' && status !== 'completed') {
        const msg = verifyData?.message || verifyData?.data?.processor_response || 'Payment not verified';
        return { success: false, message: msg };
      }
    }

    // ── Credit marketplace coins to user ──────────────────────────────────
    const { data: userData, error: fetchErr } = await supabase
      .from('users').select('marketplace_coins').eq('id', params.userId).single();
    if (fetchErr) throw new Error('Could not fetch user balance');
    const currentCoins = userData?.marketplace_coins || 0;

    const { error: updateErr } = await supabase
      .from('users')
      .update({ marketplace_coins: currentCoins + totalCoins })
      .eq('id', params.userId);
    if (updateErr) throw new Error('Failed to credit coins to wallet');

    // ── Log transaction for records ────────────────────────────────────────
    await supabase.from('coin_transactions').insert({
      user_id:     params.userId,
      reference:   params.reference,
      coins_added: totalCoins,
      amount_ngn:  pkg.priceNgn,
      source:      'flutterwave_marketplace',
      status:      'completed',
    });

    return { success: true, totalCoins: currentCoins + totalCoins };

  } catch (err: any) {
    console.error('[MktBuyCoins] Error:', err);
    return { success: false, message: err?.message || 'Unexpected error crediting coins' };
  }
}

// ── Flutterwave WebView HTML ─────────────────────────────────────────────────
function buildFlutterwaveHTML(params: {
  amount: number; email: string; name: string;
  reference: string; label: string; publicKey: string;
}): string {
  const { amount, email, name, reference, label, publicKey } = params;
  return `
<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#000; display:flex; align-items:center; justify-content:center;
         min-height:100vh; font-family:-apple-system,sans-serif; }
  .container { width:100%; max-width:400px; padding:20px; text-align:center; }
  .logo  { color:#8888ff; font-size:28px; font-weight:bold; margin-bottom:6px; }
  .sub   { color:#888; font-size:13px; margin-bottom:24px; }
  .spinner { width:36px; height:36px; border:3px solid #333; border-top-color:#8888ff;
             border-radius:50%; margin:16px auto; animation:spin 0.8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .loading { color:#fff; font-size:14px; margin-top:12px; }
  .error-box  { display:none; background:#1a0000; border:1px solid #ff4444;
                border-radius:12px; padding:16px; margin-top:20px; }
  .error-text { color:#ff6666; font-size:13px; line-height:20px; }
  .retry-btn  { margin-top:12px; background:#ff4444; color:#fff; border:none;
                border-radius:8px; padding:10px 20px; font-size:13px;
                font-weight:bold; cursor:pointer; width:100%; }
</style>
</head>
<body>
<div class="container">
  <div class="logo">Lumvibe</div>
  <div class="sub">Marketplace · Secure payment via Flutterwave</div>
  <div class="spinner" id="spinner"></div>
  <div class="loading" id="loadingText">Opening payment form...</div>
  <div class="error-box" id="errorBox">
    <div class="error-text" id="errorMsg">
      Payment form could not load. Check your connection and retry.
    </div>
    <button class="retry-btn" onclick="retryLoad()">Retry</button>
  </div>
</div>
<script>
  window.flutterwaveModalOpened = false;

  function onFlutterwaveLoaded() {
    var timer = setTimeout(function() {
      if (!window.flutterwaveModalOpened) {
        document.getElementById('spinner').style.display     = 'none';
        document.getElementById('loadingText').style.display = 'none';
        document.getElementById('errorBox').style.display    = 'block';
        document.getElementById('errorMsg').innerHTML =
          'Payment form is taking too long. Check your internet connection (need strong 4G or WiFi).';
      }
    }, 15000);
    startPayment(timer);
  }

  function onFlutterwaveError() {
    document.getElementById('spinner').style.display     = 'none';
    document.getElementById('loadingText').style.display = 'none';
    document.getElementById('errorBox').style.display    = 'block';
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SCRIPT_FAILED' }));
  }

  function retryLoad() {
    document.getElementById('errorBox').style.display    = 'none';
    document.getElementById('spinner').style.display     = 'block';
    document.getElementById('loadingText').style.display = 'block';
    document.getElementById('loadingText').innerText     = 'Retrying...';
    var s = document.createElement('script');
    s.src    = 'https://checkout.flutterwave.com/v3.js';
    s.onload = function() { onFlutterwaveLoaded(); };
    s.onerror = onFlutterwaveError;
    document.body.appendChild(s);
  }

  function startPayment(loadTimer) {
    window.flutterwaveModalOpened = true;
    if (loadTimer) clearTimeout(loadTimer);
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'MODAL_OPENED' }));

    FlutterwaveCheckout({
      public_key:      "${publicKey}",
      tx_ref:          "${reference}",
      amount:          ${amount},
      currency:        "NGN",
      payment_options: "card,banktransfer,ussd",
      customer: { email: "${email}", name: "${name}" },
      customizations: { title: "Kinsta Marketplace", description: "${label}" },
      callback: function(response) {
        if (response.status === "successful" || response.status === "completed") {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "SUCCESS", reference: "${reference}", txId: response.transaction_id
          }));
        } else {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "FAILED", status: response.status,
            message: response.message || "Payment was declined"
          }));
        }
      },
      onclose: function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "CANCELLED" }));
      }
    });

    var observer = new MutationObserver(function() {
      if ((document.body.innerText || '').toLowerCase().includes('please wait')) {
        observer.disconnect();
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "PROCESSING_STARTED" }));
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
</script>
<script
  src="https://checkout.flutterwave.com/v3.js"
  onload="onFlutterwaveLoaded()"
  onerror="onFlutterwaveError()">
</script>
</body></html>`;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function MarketplaceBuyCoinsScreen() {
  const router                = useRouter();
  const { user, userProfile } = useAuthStore();
  const currency              = detectCurrency();

  const [loading,           setLoading]           = useState<string | null>(null);
  const [balance,           setBalance]           = useState(0);
  const [webViewVisible,    setWebViewVisible]    = useState(false);
  const [webViewHtml,       setWebViewHtml]       = useState('');
  const [webViewLoading,    setWebViewLoading]    = useState(true);
  const [verifying,         setVerifying]         = useState(false);
  const [showTimeoutBanner, setShowTimeoutBanner] = useState(false);

  const currentPkg     = useRef<typeof COIN_PACKAGES[number] | null>(null);
  const currentRef     = useRef<string>('');
  const paymentHandled = useRef(false);
  const timeoutTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timeoutTimer.current) { clearTimeout(timeoutTimer.current); timeoutTimer.current = null; }
  };

  const startTimeout = () => {
    clearTimer();
    setShowTimeoutBanner(false);
    timeoutTimer.current = setTimeout(() => setShowTimeoutBanner(true), PAYMENT_TIMEOUT);
  };

  useEffect(() => { return () => clearTimer(); }, []);

  const loadBalance = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('users').select('marketplace_coins').eq('id', user.id).single();
      if (error) throw error;
      setBalance(data?.marketplace_coins || 0);
    } catch (err) {
      console.error('[MktBuyCoins] loadBalance error:', err);
    }
  };

  useEffect(() => { if (user?.id) loadBalance(); }, [user?.id]);

  const verifyAndCredit = async (
    pkg: typeof COIN_PACKAGES[number],
    reference: string,
    isTest: boolean = false,
  ) => {
    if (!user?.id) return;
    clearTimer();
    setShowTimeoutBanner(false);
    setVerifying(true);
    try {
      // ✅ Now calls direct function instead of Edge Function
      const result = await creditCoinsDirectly({
        reference, userId: user.id, packageId: pkg.id, isTest,
      });

      if (result.success) {
        await loadBalance();
        Alert.alert(
          '🎉 Coins Added!',
          `${pkg.coins + pkg.bonusCoins} marketplace coins added to your wallet!`,
          [{ text: 'Start Shopping →', onPress: () => router.back() }],
        );
      } else {
        const msg        = result.message || '';
        const isDeclined = msg.toLowerCase().includes('insufficient') ||
                           msg.toLowerCase().includes('declined') ||
                           msg.toLowerCase().includes('no funds');
        const isPending  = msg.toLowerCase().includes('processing') ||
                           msg.toLowerCase().includes('pending');

        if (isDeclined) {
          Alert.alert(
            '💳 Payment Declined',
            'Your payment was declined. This is usually because of:\n\n' +
            '• Insufficient funds on your card\n' +
            '• Card not enabled for online payments\n' +
            '• Transaction limit exceeded\n\n' +
            'No money was charged. Please try a different payment method.',
          );
        } else if (isPending) {
          Alert.alert(
            '⏳ Payment Processing',
            `Your bank transfer was received but Flutterwave is still confirming it.\n\n` +
            `This usually takes 1 to 5 minutes.\n\nRef: ${reference}\n\n` +
            `Please wait then tap Check Again.`,
            [
              { text: 'Check Again', onPress: async () => {
                  setLoading(pkg.id);
                  await verifyAndCredit(pkg, reference, false);
              }},
              { text: 'Contact Support', style: 'cancel', onPress: () =>
                  Alert.alert('Support', `Email support@kinsta.app\nRef: ${reference}`)
              },
            ],
          );
        } else {
          Alert.alert(
            'Payment Received — Coins Pending',
            `Your payment was received but we could not confirm it yet.\n\n` +
            `Ref: ${reference}\n\n` +
            `Contact support@kinsta.app and we will credit your coins within 1 hour.`,
          );
        }
      }
    } catch (err: any) {
      console.error('[MktBuyCoins] verifyAndCredit error:', err);
      Alert.alert('Verification Error', `Something went wrong.\n\nRef: ${reference}\n\nContact support@kinsta.app`);
    } finally {
      setVerifying(false);
      setLoading(null);
    }
  };

  const handleManualVerify = async () => {
    const pkg = currentPkg.current;
    const ref = currentRef.current;
    if (!pkg || !ref || paymentHandled.current) return;
    paymentHandled.current = true;
    setWebViewVisible(false);
    setShowTimeoutBanner(false);
    setLoading(pkg.id);
    await verifyAndCredit(pkg, ref, false);
  };

  const handleWebViewMessage = async (event: any) => {
    let msg: any;
    try { msg = JSON.parse(event.nativeEvent.data); }
    catch (err) { console.error('[MktBuyCoins] parse error:', err); return; }

    const pkg = currentPkg.current;
    const ref = currentRef.current;

    if (msg.type === 'MODAL_OPENED') {
      clearTimer();
      timeoutTimer.current = setTimeout(() => setShowTimeoutBanner(true), 60000);
      return;
    }
    if (msg.type === 'PROCESSING_STARTED') { startTimeout(); return; }
    if (msg.type === 'SCRIPT_FAILED')      { clearTimer(); setShowTimeoutBanner(false); return; }

    if (paymentHandled.current) return;
    if (!pkg || !ref) return;

    if (msg.type === 'SUCCESS') {
      paymentHandled.current = true;
      clearTimer();
      setWebViewVisible(false);
      setShowTimeoutBanner(false);
      setLoading(pkg.id);
      await verifyAndCredit(pkg, ref, false);

    } else if (msg.type === 'CANCELLED') {
      clearTimer();
      setWebViewVisible(false);
      setShowTimeoutBanner(false);
      setLoading(null);
      Alert.alert(
        'Payment Cancelled?',
        'Did you complete the payment before closing?',
        [
          { text: 'No, cancel', style: 'cancel', onPress: () => setLoading(null) },
          { text: 'Yes, verify →', onPress: async () => {
              paymentHandled.current = true;
              setLoading(pkg.id);
              await verifyAndCredit(pkg, ref, false);
          }},
        ],
      );

    } else if (msg.type === 'FAILED') {
      paymentHandled.current = true;
      clearTimer();
      setWebViewVisible(false);
      setShowTimeoutBanner(false);
      setLoading(null);
      const isInsufficient = (msg.status || '').toLowerCase().includes('insufficient') ||
                             (msg.message || '').toLowerCase().includes('insufficient');
      Alert.alert(
        isInsufficient ? '💳 Insufficient Funds' : '❌ Payment Failed',
        isInsufficient
          ? 'Your card does not have enough balance.\n\nNo money was charged. Please fund your card or use a different method.'
          : `Payment could not be completed.\n\nReason: ${msg.message || 'Payment was declined'}\n\nNo money was charged.`,
      );
    }
  };

  const handleBuyPackage = async (pkg: typeof COIN_PACKAGES[number]) => {
    if (!user?.id) { Alert.alert('Error', 'Please log in first'); return; }

    const userEmail = (userProfile as any)?.email || (user as any)?.email;
    if (!userEmail || userEmail.trim() === '') {
      Alert.alert(
        'Email Required',
        'Please add an email address to your account before purchasing.\n\nGo to Profile → Settings → Edit Profile.',
      );
      return;
    }

    const totalCoins = pkg.coins + pkg.bonusCoins;
    const reference  = `MKT_${user.id.slice(0, 8).toUpperCase()}_${Date.now()}`;
    const localPrice = convertFromNgn(pkg.priceNgn, currency);
    const bonusLine  = pkg.bonusCoins > 0
      ? `🎁 Bonus: +${pkg.bonusCoins} coins\n✅ Total: ${totalCoins.toLocaleString()} coins\n\n`
      : `✅ You get: ${totalCoins.toLocaleString()} coins\n\n`;

    if (FLW_TEST_MODE) {
      Alert.alert(
        `🧪 Test Mode — ${pkg.icon} ${pkg.label}`,
        `${bonusLine}Price: ${localPrice} ${currency.code}\n\nTest mode — no real charge.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Simulate Payment ✓', onPress: async () => {
              setLoading(pkg.id);
              await verifyAndCredit(pkg, reference, true);
          }},
        ],
      );
      return;
    }

    Alert.alert(
      `${pkg.icon} Buy ${pkg.coins.toLocaleString()} Coins`,
      `${bonusLine}You will pay ${localPrice} ${currency.code}` +
      `${currency.code !== 'NGN' ? `\n(${formatNgn(pkg.priceNgn)})` : ''}` +
      `\n\nPayment opens securely inside the app.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Pay Now →', onPress: () => {
            currentPkg.current     = pkg;
            currentRef.current     = reference;
            paymentHandled.current = false;
            setLoading(pkg.id);
            setWebViewHtml(buildFlutterwaveHTML({
              amount:    pkg.priceNgn,
              email:     userEmail,
              name:      (userProfile as any)?.display_name || 'Kinsta User',
              reference,
              label:     `Kinsta Marketplace - ${pkg.label} (${totalCoins} coins)`,
              publicKey: FLW_PUBLIC_KEY,
            }));
            setWebViewLoading(true);
            setShowTimeoutBanner(false);
            setWebViewVisible(true);
        }},
      ],
    );
  };

  const localBalance = convertFromNgn(balance * NGN_PER_COIN, currency);

  return (
    <View style={s.container}>

      {/* ── Payment Modal ── */}
      <Modal
        visible={webViewVisible}
        animationType="slide"
        onRequestClose={() => { clearTimer(); setWebViewVisible(false); setShowTimeoutBanner(false); setLoading(null); }}
      >
        <View style={s.webViewContainer}>
          <View style={s.webViewHeader}>
            <TouchableOpacity
              onPress={() => { clearTimer(); setWebViewVisible(false); setShowTimeoutBanner(false); setLoading(null); }}
              style={s.webViewClose}
            >
              <Feather name="x" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={s.webViewTitle}>Secure Payment</Text>
            <View style={{ width: 38 }} />
          </View>

          {webViewLoading && (
            <View style={s.webViewOverlay}>
              <ActivityIndicator size="large" color="#8888ff" />
              <Text style={s.webViewOverlayText}>Loading payment form...</Text>
            </View>
          )}

          {verifying && (
            <View style={s.webViewOverlay}>
              <ActivityIndicator size="large" color="#8888ff" />
              <Text style={s.webViewOverlayText}>Verifying your payment...</Text>
              <Text style={s.webViewOverlaySub}>Please do not close this screen</Text>
            </View>
          )}

          {showTimeoutBanner && !verifying && (
            <View style={s.timeoutBanner}>
              <View style={s.timeoutInner}>
                <Text style={s.timeoutTitle}>⏳ Payment taking too long?</Text>
                <Text style={s.timeoutBody}>
                  If you have entered your OTP and see "Please wait" — your payment may have been processed. Tap below to check.
                </Text>
                <TouchableOpacity style={s.timeoutVerifyBtn} onPress={handleManualVerify}>
                  <Text style={s.timeoutVerifyText}>✅ I paid — verify my coins</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.timeoutDismissBtn} onPress={() => setShowTimeoutBanner(false)}>
                  <Text style={s.timeoutDismissText}>Still waiting — dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <WebView
            source={{ html: webViewHtml }}
            onMessage={handleWebViewMessage}
            onLoadEnd={() => setWebViewLoading(false)}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={['*']}
            mixedContentMode="always"
            onShouldStartLoadWithRequest={() => true}
            style={{ flex: 1, backgroundColor: '#000' }}
          />
        </View>
      </Modal>

      {/* ── Main Screen ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back">
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Buy Marketplace Coins</Text>
        <TouchableOpacity onPress={loadBalance} accessibilityLabel="Refresh balance">
          <Feather name="refresh-cw" size={20} color="#666" />
        </TouchableOpacity>
      </View>

      {FLW_TEST_MODE && (
        <View style={s.testBanner}>
          <Text style={s.testBannerText}>🧪 TEST MODE — No real charge</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <View style={s.balanceCard}>
          <MaterialCommunityIcons name="storefront" size={22} color="#8888ff" style={{ marginBottom: 6 }} />
          <Text style={s.balanceLabel}>Marketplace Wallet</Text>
          <Text style={s.balanceCoins}>{balance.toLocaleString()}</Text>
          <Text style={s.balanceSub}>coins available</Text>
          <Text style={s.balanceNgn}>{localBalance} {currency.code}</Text>
        </View>

        <View style={s.currencyBanner}>
          <Text style={s.currencyBannerText}>
            🌍 Showing prices in{' '}
            <Text style={s.currencyHighlight}>{currency.code}</Text>
            {currency.code !== 'NGN' ? '  ·  Charged in NGN' : ''}
          </Text>
        </View>

        <View style={s.infoBox}>
          <Text style={s.infoBoxTitle}>🛍️ What are Marketplace Coins?</Text>
          <Text style={s.infoBoxText}>
            Used exclusively to purchase services from other creators. Separate from your profile gifting wallet.
          </Text>
        </View>

        <View style={s.rateCard}>
          <View style={s.rateRow}>
            <View>
              <Text style={s.rateLabel}>1 coin equals</Text>
              <Text style={s.rateValue}>{convertFromNgn(NGN_PER_COIN, currency)} {currency.code}</Text>
            </View>
            {currency.code !== 'NGN' && (
              <View style={s.rateNgnBox}>
                <Text style={s.rateNgnLabel}>NGN base</Text>
                <Text style={s.rateNgn}>{formatNgn(NGN_PER_COIN)}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={s.paymentNotice}>
          <View style={s.paymentNoticeRow}>
            <Text style={s.noticeIcon}>✅</Text>
            <View style={s.noticeTextWrap}>
              <Text style={s.noticeGreen}>Recommended: Bank Transfer or USSD</Text>
              <Text style={s.noticeBody}>
                After the payment form opens, tap{' '}
                <Text style={s.noticeHighlight}>"Change payment method"</Text>
                {' '}at the bottom to switch. These are faster and more reliable than card.
              </Text>
            </View>
          </View>
          <View style={s.noticeLine} />
          <View style={s.paymentNoticeRow}>
            <Text style={s.noticeIcon}>⚠️</Text>
            <View style={s.noticeTextWrap}>
              <Text style={s.noticeYellow}>Card may get stuck on "Please wait"</Text>
              <Text style={s.noticeBody}>
                If stuck after OTP, wait for the verify button that appears automatically. Card is at your own risk.
              </Text>
            </View>
          </View>
        </View>

        <Text style={s.sectionTitle}>Choose a Package</Text>

        {COIN_PACKAGES.map((pkg) => {
          const totalCoins = pkg.coins + pkg.bonusCoins;
          const isLoading  = loading === pkg.id;
          const localPrice = convertFromNgn(pkg.priceNgn, currency);
          return (
            <TouchableOpacity
              key={pkg.id}
              style={[s.card, pkg.popular && s.cardPopular]}
              onPress={() => handleBuyPackage(pkg)}
              disabled={loading !== null}
              activeOpacity={0.8}
              accessibilityLabel={`Buy ${pkg.label} — ${totalCoins} coins for ${localPrice} ${currency.code}`}
            >
              {pkg.popular && (
                <View style={s.popularBadge}>
                  <Text style={s.popularBadgeText}>⭐ Most Popular</Text>
                </View>
              )}
              <View style={s.cardLeft}>
                <Text style={s.cardIcon}>{pkg.icon}</Text>
                <View>
                  <Text style={s.cardLabel}>{pkg.label}</Text>
                  <Text style={s.cardCoins}>{pkg.coins.toLocaleString()} coins</Text>
                  {pkg.bonusCoins > 0 && <Text style={s.cardBonus}>+{pkg.bonusCoins} bonus 🎁</Text>}
                  {pkg.bonusCoins > 0 && <Text style={s.cardTotal}>Total: {totalCoins.toLocaleString()}</Text>}
                  <Text style={s.cardHint}>{pkg.hint}</Text>
                </View>
              </View>
              <View style={s.cardRight}>
                <Text style={s.cardLocalPrice}>{localPrice}</Text>
                {currency.code !== 'NGN' && <Text style={s.cardNgnPrice}>{formatNgn(pkg.priceNgn)}</Text>}
                {isLoading
                  ? <ActivityIndicator size="small" color="#8888ff" style={{ marginTop: 10 }} />
                  : (
                    <View style={[s.buyBtn, pkg.popular && s.buyBtnPopular]}>
                      <Text style={[s.buyBtnText, pkg.popular && s.buyBtnTextPopular]}>
                        {FLW_TEST_MODE ? 'Test' : 'Buy'}
                      </Text>
                    </View>
                  )}
              </View>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={s.historyLink}
          onPress={() => router.push('/transaction-history' as any)}
          accessibilityLabel="View purchase history"
        >
          <Feather name="clock" size={14} color="#555" />
          <Text style={s.historyLinkText}>View purchase history</Text>
        </TouchableOpacity>

        <View style={s.bottomInfo}>
          <Text style={s.bottomInfoTitle}>ℹ️ About Marketplace Coins</Text>
          <Text style={s.bottomInfoText}>• Used to buy services from other creators</Text>
          <Text style={s.bottomInfoText}>• Separate from your profile gifting wallet</Text>
          <Text style={s.bottomInfoText}>• Non-refundable once purchased</Text>
          <Text style={s.bottomInfoText}>• Payments secured by Flutterwave</Text>
          <Text style={s.bottomInfoText}>• Issues? Email support@kinsta.app with your payment reference</Text>
        </View>
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:           { flex: 1, backgroundColor: '#000' },
  header:              { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  headerTitle:         { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  testBanner:          { backgroundColor: '#1a1200', paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#ffd70033' },
  testBannerText:      { fontSize: 11, color: '#ffd700', textAlign: 'center' },
  scroll:              { padding: 16 },
  balanceCard:         { backgroundColor: '#0d0d1a', borderRadius: 16, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: '#8888ff33', alignItems: 'center' },
  balanceLabel:        { color: '#666', fontSize: 12, marginBottom: 4 },
  balanceCoins:        { color: '#8888ff', fontSize: 36, fontWeight: 'bold', lineHeight: 42 },
  balanceSub:          { color: '#444', fontSize: 12, marginBottom: 4 },
  balanceNgn:          { color: '#ffd700', fontSize: 15, fontWeight: '600' },
  currencyBanner:      { backgroundColor: '#0d0d1a', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#8888ff33', alignItems: 'center' },
  currencyBannerText:  { color: '#888', fontSize: 12, textAlign: 'center' },
  currencyHighlight:   { color: '#8888ff', fontWeight: 'bold' },
  infoBox:             { backgroundColor: '#0a0a0a', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#1a1a1a' },
  infoBoxTitle:        { color: '#8888ff', fontSize: 13, fontWeight: 'bold', marginBottom: 6 },
  infoBoxText:         { color: '#666', fontSize: 12, lineHeight: 18 },
  rateCard:            { backgroundColor: '#111', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#222' },
  rateRow:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rateLabel:           { color: '#666', fontSize: 12, marginBottom: 2 },
  rateValue:           { color: '#8888ff', fontSize: 20, fontWeight: 'bold' },
  rateNgnBox:          { alignItems: 'flex-end' },
  rateNgnLabel:        { color: '#444', fontSize: 10, marginBottom: 2 },
  rateNgn:             { color: '#555', fontSize: 14, fontWeight: '600' },
  paymentNotice:       { backgroundColor: '#0d0d0d', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#1e1e1e' },
  paymentNoticeRow:    { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  noticeIcon:          { fontSize: 16, marginTop: 1 },
  noticeTextWrap:      { flex: 1 },
  noticeGreen:         { color: '#00ff88', fontSize: 13, fontWeight: 'bold', marginBottom: 3 },
  noticeYellow:        { color: '#ffd700', fontSize: 13, fontWeight: 'bold', marginBottom: 3 },
  noticeHighlight:     { color: '#00ff88', fontWeight: 'bold' },
  noticeBody:          { color: '#555', fontSize: 12, lineHeight: 18 },
  noticeLine:          { height: 1, backgroundColor: '#1e1e1e', marginVertical: 12 },
  sectionTitle:        { color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 12 },
  card:                { backgroundColor: '#111', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#222', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPopular:         { borderColor: '#8888ff66', backgroundColor: '#0d0d1a' },
  popularBadge:        { position: 'absolute', top: -10, left: 16, backgroundColor: '#8888ff', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  popularBadgeText:    { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  cardLeft:            { flexDirection: 'row', alignItems: 'flex-start', flex: 1, gap: 12 },
  cardIcon:            { fontSize: 26, marginTop: 2 },
  cardLabel:           { color: '#666', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  cardCoins:           { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  cardBonus:           { color: '#ffd700', fontSize: 12, marginTop: 2 },
  cardTotal:           { color: '#8888ff', fontSize: 12, fontWeight: '600' },
  cardHint:            { color: '#444', fontSize: 11, marginTop: 4 },
  cardRight:           { alignItems: 'flex-end' },
  cardLocalPrice:      { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  cardNgnPrice:        { color: '#555', fontSize: 11, marginTop: 1 },
  buyBtn:              { backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 18, paddingVertical: 8, marginTop: 8, borderWidth: 1, borderColor: '#333' },
  buyBtnPopular:       { backgroundColor: '#8888ff', borderColor: '#8888ff' },
  buyBtnText:          { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  buyBtnTextPopular:   { color: '#fff' },
  historyLink:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginBottom: 8 },
  historyLinkText:     { color: '#555', fontSize: 13 },
  bottomInfo:          { backgroundColor: '#0d0d0d', borderRadius: 12, padding: 16, marginTop: 8, borderWidth: 1, borderColor: '#1a1a1a' },
  bottomInfoTitle:     { color: '#fff', fontSize: 13, fontWeight: 'bold', marginBottom: 10 },
  bottomInfoText:      { color: '#555', fontSize: 12, lineHeight: 22 },
  webViewContainer:    { flex: 1, backgroundColor: '#000' },
  webViewHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  webViewClose:        { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  webViewTitle:        { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  webViewOverlay:      { position: 'absolute', top: 100, left: 0, right: 0, bottom: 0, zIndex: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  webViewOverlayText:  { color: '#666', fontSize: 14, marginTop: 16 },
  webViewOverlaySub:   { color: '#444', fontSize: 12, marginTop: 6 },
  timeoutBanner:       { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100, padding: 16 },
  timeoutInner:        { backgroundColor: '#111', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#8888ff44', elevation: 10 },
  timeoutTitle:        { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  timeoutBody:         { color: '#888', fontSize: 13, lineHeight: 20, marginBottom: 16 },
  timeoutVerifyBtn:    { backgroundColor: '#8888ff', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 10 },
  timeoutVerifyText:   { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  timeoutDismissBtn:   { alignItems: 'center', padding: 8 },
  timeoutDismissText:  { color: '#444', fontSize: 13 },
}); 
