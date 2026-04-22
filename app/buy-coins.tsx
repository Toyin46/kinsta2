// app/buy-coins.tsx
// ✅ SECRET KEY removed from app — now lives only in Supabase Edge Function
// ✅ Edge Function verifies payment server-side (no IP whitelist issue)
// ✅ Edge Function checks amount matches package (prevents fraud/underpayment)
// ✅ Idempotency — same reference can never be credited twice
// ✅ User JWT validated server-side — no one can spoof another user's ID
// ✅ All previous UX fixes retained (timeout banner, cancel verify, etc.)

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Modal,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/config/supabase';
import { useAuthStore } from '@/store/authStore';
import { detectCurrency, convertFromNgn, formatNgn } from '@/utils/currencyUtils';
import { useTranslation } from '@/locales/LanguageContext';
import { FLW_TEST_MODE, FLW_PUBLIC_KEY } from '@/utils/flutterwaveUtils';

// 🔍 LOG 1 — fires when file loads, confirms new version + TEST_MODE value
console.log('🪙 buy-coins.tsx LOADED — FLW_TEST_MODE =', FLW_TEST_MODE);

const NGN_PER_COIN = 150;
const PAYMENT_TIMEOUT_MS = 20000;

// ✅ NO SECRET KEY HERE — it lives in the Edge Function on the server

const COIN_PACKAGES = [
  { id: 'rose',        coins: 10,    bonusCoins: 0,   priceNgn: 1_500,   popular: false, label: 'Rose',        icon: '🌹', giftHint: 'Send 1 Rose gift' },
  { id: 'ice_cream',   coins: 50,    bonusCoins: 0,   priceNgn: 7_500,   popular: false, label: 'Ice Cream',   icon: '🍦', giftHint: 'Send Ice Cream gifts' },
  { id: 'love_letter', coins: 100,   bonusCoins: 10,  priceNgn: 15_000,  popular: true,  label: 'Love Letter', icon: '💌', giftHint: 'Send Love Letter gifts' },
  { id: 'trophy',      coins: 500,   bonusCoins: 60,  priceNgn: 75_000,  popular: false, label: 'Trophy',      icon: '🏆', giftHint: 'Send Trophy gifts' },
  { id: 'crown',       coins: 1000,  bonusCoins: 100, priceNgn: 150_000, popular: false, label: 'Crown',       icon: '👑', giftHint: 'Send Crown gifts' },
  { id: 'diamond',     coins: 5_000, bonusCoins: 500, priceNgn: 750_000, popular: false, label: 'Diamond',     icon: '💎', giftHint: 'Send Diamond gifts' },
] as const;

// ✅ Calls Edge Function — secret key never touches the app
async function creditCoinsViaEdgeFunction(params: {
  reference: string;
  packageId: string;
  isTest: boolean;
}): Promise<{ success: boolean; totalCoins?: number; message?: string; status?: string }> {
  try {
    console.log('🪙 Calling Edge Function credit-coins — params:', JSON.stringify(params));
    const { data, error } = await supabase.functions.invoke('credit-coins', {
      body: {
        reference: params.reference,
        packageId: params.packageId,
        isTest:    params.isTest,
      },
    });
    console.log('🪙 Edge Function response — data:', JSON.stringify(data), '| error:', JSON.stringify(error));

    if (error) {
      const msg = (error as any)?.context?.message
        || (error as any)?.message
        || 'Verification failed';
      console.log('🪙 Edge Function error msg:', msg);
      return { success: false, message: msg };
    }

    return data as { success: boolean; totalCoins?: number; message?: string; status?: string };

  } catch (err: any) {
    console.log('🪙 creditCoinsViaEdgeFunction CATCH ERROR:', err?.message);
    return { success: false, message: err?.message || 'Network error — please try again' };
  }
}

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
  .logo  { color:#00ff88; font-size:28px; font-weight:bold; margin-bottom:6px; }
  .sub   { color:#888; font-size:13px; margin-bottom:24px; }
  .spinner { width:36px; height:36px; border:3px solid #333; border-top-color:#00ff88;
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
  <div class="logo">LumVibe</div>
  <div class="sub">Secure payment via Flutterwave</div>
  <div class="spinner" id="spinner"></div>
  <div class="loading" id="loadingText">Opening payment form...</div>
  <div class="error-box" id="errorBox">
    <div class="error-text">
      ⚠️ Payment form could not load.<br/>
      Please check your internet connection and try again.
    </div>
    <button class="retry-btn" onclick="retryLoad()">↺ Retry</button>
  </div>
</div>
<script>
  function onFlutterwaveLoaded() { startPayment(); }
  function onFlutterwaveError() {
    document.getElementById('spinner').style.display     = 'none';
    document.getElementById('loadingText').style.display = 'none';
    document.getElementById('errorBox').style.display    = 'block';
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "SCRIPT_FAILED" }));
  }
  function retryLoad() {
    document.getElementById('errorBox').style.display    = 'none';
    document.getElementById('spinner').style.display     = 'block';
    document.getElementById('loadingText').style.display = 'block';
    document.getElementById('loadingText').innerText     = 'Retrying...';
    var s = document.createElement('script');
    s.src = 'https://checkout.flutterwave.com/v3.js';
    s.onload = onFlutterwaveLoaded;
    s.onerror = onFlutterwaveError;
    document.body.appendChild(s);
  }
  function startPayment() {
    FlutterwaveCheckout({
      public_key:      "${publicKey}",
      tx_ref:          "${reference}",
      amount:          ${amount},
      currency:        "NGN",
      payment_options: "card,banktransfer,ussd",
      customer: { email: "${email}", name: "${name}" },
      customizations: { title: "LumVibe", description: "${label}" },
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
      var bodyText = document.body.innerText || '';
      var iframes  = document.querySelectorAll('iframe');
      var pleaseWaitFound = bodyText.toLowerCase().includes('please wait');
      if (!pleaseWaitFound && iframes.length > 0) {
        try {
          for (var i = 0; i < iframes.length; i++) {
            var iframeText = iframes[i].contentDocument &&
                             iframes[i].contentDocument.body &&
                             iframes[i].contentDocument.body.innerText;
            if (iframeText && iframeText.toLowerCase().includes('please wait')) {
              pleaseWaitFound = true; break;
            }
          }
        } catch(e) {}
      }
      if (pleaseWaitFound) {
        observer.disconnect();
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "PROCESSING_STARTED" }));
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
</script>
<script src="https://checkout.flutterwave.com/v3.js" onload="onFlutterwaveLoaded()" onerror="onFlutterwaveError()"></script>
</body></html>`;
}

export default function BuyCoinsScreen() {
  const router   = useRouter();
  const { user } = useAuthStore();
  const { t }    = useTranslation();
  const currency = detectCurrency();

  const [loading,           setLoading]           = useState<string | null>(null);
  const [coins,             setCoins]             = useState(0);
  const [webViewVisible,    setWebViewVisible]    = useState(false);
  const [webViewHtml,       setWebViewHtml]       = useState('');
  const [webViewLoading,    setWebViewLoading]    = useState(true);
  const [verifying,         setVerifying]         = useState(false);
  const [showTimeoutBanner, setShowTimeoutBanner] = useState(false);

  const currentPkg     = useRef<typeof COIN_PACKAGES[number] | null>(null);
  const currentRef     = useRef<string>('');
  const paymentHandled = useRef(false);
  const timeoutTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimeoutTimer = () => {
    if (timeoutTimer.current) { clearTimeout(timeoutTimer.current); timeoutTimer.current = null; }
  };
  const startPaymentTimeout = () => {
    clearTimeoutTimer();
    setShowTimeoutBanner(false);
    timeoutTimer.current = setTimeout(() => setShowTimeoutBanner(true), PAYMENT_TIMEOUT_MS);
  };

  useEffect(() => { return () => clearTimeoutTimer(); }, []);

  const loadBalance = async () => {
    if (!user?.id) return;
    try {
      const { data } = await supabase.from('users').select('coins').eq('id', user.id).single();
      setCoins(data?.coins || 0);
    } catch {}
  };

  React.useEffect(() => { loadBalance(); }, [user?.id]);

  const verifyAndCredit = async (
    pkg: typeof COIN_PACKAGES[number],
    reference: string,
    isTest: boolean = false,
  ) => {
    if (!user?.id) return;
    clearTimeoutTimer();
    setShowTimeoutBanner(false);
    setVerifying(true);
    try {
      const result = await creditCoinsViaEdgeFunction({ reference, packageId: pkg.id, isTest });

      if (result.success) {
        await loadBalance();
        Alert.alert(
          '🎉 Coins Added!',
          `${pkg.coins + pkg.bonusCoins} coins added to your wallet!`,
          [{ text: t.common.done, onPress: () => router.back() }],
        );
      } else {
        const msg = result.message || '';
        const isDeclined = msg.toLowerCase().includes('insufficient') ||
                           msg.toLowerCase().includes('declined') ||
                           msg.toLowerCase().includes('failed') ||
                           msg.toLowerCase().includes('no funds');
        if (isDeclined) {
          Alert.alert(
            '💳 Payment Declined',
            'Your payment was declined.\n\n• Insufficient funds\n• Card not enabled for online payments\n• Transaction limit exceeded\n\nNo money was charged.',
          );
        } else {
          const isPending = msg.toLowerCase().includes('processing') ||
                            msg.toLowerCase().includes('pending');
          if (isPending) {
            Alert.alert(
              '⏳ Payment Processing',
              `Bank transfers take 1–5 minutes to confirm.\n\nRef: ${reference}\n\nTap Check Again in a few minutes.`,
              [
                { text: 'Check Again', onPress: async () => { setLoading(pkg.id); await verifyAndCredit(pkg, reference, false); }},
                { text: 'Contact Support', style: 'cancel', onPress: () => Alert.alert('Support', `Email support@lumvibe.app\nRef: ${reference}`) },
              ],
            );
          } else {
            Alert.alert(
              'Payment Received — Coins Pending',
              `Ref: ${reference}\n\nContact support@lumvibe.app and we will credit your coins within 1 hour.`,
            );
          }
        }
      }
    } catch {
      Alert.alert('Verification Error', `Contact support@lumvibe.app with ref: ${reference}`);
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
    try { msg = JSON.parse(event.nativeEvent.data); } catch { return; }

    const pkg = currentPkg.current;
    const ref = currentRef.current;

    if (msg.type === 'PROCESSING_STARTED') { startPaymentTimeout(); return; }
    if (msg.type === 'SCRIPT_FAILED')      { clearTimeoutTimer(); setShowTimeoutBanner(false); return; }
    if (paymentHandled.current || !pkg || !ref) return;

    if (msg.type === 'SUCCESS') {
      paymentHandled.current = true;
      clearTimeoutTimer();
      setWebViewVisible(false);
      setShowTimeoutBanner(false);
      setLoading(pkg.id);
      await verifyAndCredit(pkg, ref, false);

    } else if (msg.type === 'CANCELLED') {
      clearTimeoutTimer();
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
      clearTimeoutTimer();
      setWebViewVisible(false);
      setShowTimeoutBanner(false);
      setLoading(null);
      const isInsufficient = (msg.status || '').toLowerCase().includes('insufficient') ||
                             (msg.message || '').toLowerCase().includes('insufficient');
      Alert.alert(
        isInsufficient ? '💳 Insufficient Funds' : '❌ Payment Failed',
        isInsufficient
          ? 'Your card does not have enough balance. No money was charged.'
          : `Reason: ${msg.message || 'Payment was declined'}\n\nNo money was charged.`,
      );
    }
  };

  const handleBuyPackage = async (pkg: typeof COIN_PACKAGES[number]) => {
    console.log('🪙 handleBuyPackage — pkg:', pkg.id, '| FLW_TEST_MODE:', FLW_TEST_MODE);
    if (!user?.id) { Alert.alert(t.errors.generic, t.auth.login); return; }
    const userEmail = (user as any).email;
    if (!userEmail?.trim()) {
      Alert.alert('Email Required', 'Please add an email to your account before purchasing.');
      return;
    }

    const totalCoins = pkg.coins + pkg.bonusCoins;
    const reference  = `LUMVIBE_${user.id.slice(0, 8).toUpperCase()}_${Date.now()}`;
    const localPrice = convertFromNgn(pkg.priceNgn, currency);
    const bonusLine  = pkg.bonusCoins > 0
      ? `🎁 Bonus: +${pkg.bonusCoins} coins\n✅ Total: ${totalCoins} coins\n\n`
      : `✅ You get: ${totalCoins} coins\n\n`;

    if (FLW_TEST_MODE) {
      console.log('🪙 TEST MODE — showing simulate dialog');
      Alert.alert(
        `🧪 Test Mode — ${pkg.icon} ${pkg.label}`,
        `${bonusLine}Price: ${localPrice} ${currency.code}\n\nTest mode — no real charge.`,
        [
          { text: t.common.cancel, style: 'cancel' },
          { text: 'Simulate Payment ✓', onPress: async () => {
            setLoading(pkg.id);
            await verifyAndCredit(pkg, reference, true);
          }},
        ],
      );
      return;
    }

    Alert.alert(
      `${pkg.icon} ${t.wallet.buyCoins}`,
      `${bonusLine}You will pay ${localPrice} ${currency.code}` +
      `${currency.code !== 'NGN' ? `\n(${formatNgn(pkg.priceNgn)})` : ''}` +
      `\n\nPayment will open securely inside the app.`,
      [
        { text: t.common.cancel, style: 'cancel' },
        { text: 'Pay Now →', onPress: () => {
          currentPkg.current     = pkg;
          currentRef.current     = reference;
          paymentHandled.current = false;
          setLoading(pkg.id);
          setWebViewHtml(buildFlutterwaveHTML({
            amount: pkg.priceNgn, email: userEmail,
            name: (user as any).user_metadata?.display_name || 'LumVibe User',
            reference,
            label: `LumVibe - ${pkg.label} Pack (${totalCoins} coins)`,
            publicKey: FLW_PUBLIC_KEY,
          }));
          setWebViewLoading(true);
          setShowTimeoutBanner(false);
          setWebViewVisible(true);
        }},
      ],
    );
  };

  const localBalance = convertFromNgn(coins * NGN_PER_COIN, currency);

  return (
    <View style={s.container}>
      <Modal
        visible={webViewVisible}
        animationType="slide"
        onRequestClose={() => { clearTimeoutTimer(); setWebViewVisible(false); setShowTimeoutBanner(false); setLoading(null); }}
      >
        <View style={s.webViewContainer}>
          <View style={s.webViewHeader}>
            <TouchableOpacity onPress={() => { clearTimeoutTimer(); setWebViewVisible(false); setShowTimeoutBanner(false); setLoading(null); }} style={s.webViewClose}>
              <Feather name="x" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={s.webViewTitle}>Secure Payment</Text>
            <View style={{ width: 38 }} />
          </View>
          {webViewLoading && (
            <View style={s.webViewLoadingOverlay}>
              <ActivityIndicator size="large" color="#00ff88" />
              <Text style={s.webViewLoadingText}>Loading payment form...</Text>
            </View>
          )}
          {verifying && (
            <View style={s.webViewLoadingOverlay}>
              <ActivityIndicator size="large" color="#00ff88" />
              <Text style={s.webViewLoadingText}>Verifying your payment...</Text>
              <Text style={s.webViewLoadingSubText}>Please do not close this screen</Text>
            </View>
          )}
          {showTimeoutBanner && !verifying && (
            <View style={s.timeoutBanner}>
              <View style={s.timeoutBannerInner}>
                <Text style={s.timeoutBannerTitle}>⏳ Payment taking too long?</Text>
                <Text style={s.timeoutBannerBody}>
                  If you already entered your OTP and see "Please wait" — tap below to check if your payment went through.
                </Text>
                <TouchableOpacity style={s.timeoutVerifyBtn} onPress={handleManualVerify}>
                  <Text style={s.timeoutVerifyBtnText}>✅ I paid — verify my coins</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.timeoutDismissBtn} onPress={() => setShowTimeoutBanner(false)}>
                  <Text style={s.timeoutDismissBtnText}>Still waiting — dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          <WebView
            source={{ html: webViewHtml }}
            onMessage={handleWebViewMessage}
            onLoadEnd={() => setWebViewLoading(false)}
            javaScriptEnabled domStorageEnabled originWhitelist={['*']}
            mixedContentMode="always" onShouldStartLoadWithRequest={() => true}
            style={{ flex: 1, backgroundColor: '#000' }}
          />
        </View>
      </Modal>

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Feather name="arrow-left" size={24} color="#fff" /></TouchableOpacity>
        <Text style={s.headerTitle}>{t.wallet.buyCoins}</Text>
        <TouchableOpacity onPress={loadBalance}><Feather name="refresh-cw" size={20} color="#666" /></TouchableOpacity>
      </View>

      {FLW_TEST_MODE && (
        <View style={s.testBanner}><Text style={s.testBannerText}>🧪 TEST MODE — No real charge</Text></View>
      )}

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.balanceCard}>
          <Text style={s.balanceLabel}>Profile Wallet</Text>
          <Text style={s.balanceCoins}>{coins.toLocaleString()}</Text>
          <Text style={s.balanceSub}>coins available</Text>
          <Text style={s.balanceNgn}>{localBalance} {currency.code}</Text>
        </View>

        <View style={s.currencyBanner}>
          <Text style={s.currencyBannerText}>
            🌍 Showing prices in <Text style={s.currencyHighlight}>{currency.code}</Text>
            {currency.code !== 'NGN' ? '  ·  Charged in NGN' : ''}
          </Text>
        </View>

        <View style={s.rateCard}>
          <View style={s.rateRow}>
            <View>
              <Text style={s.rateLabel}>{t.wallet.coinRate.split('=')[0].trim()}</Text>
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

        <View style={s.giftHintBox}>
          <Text style={s.giftHintText}>
            🌹 Rose = 10  ·  🍦 Ice Cream = 50  ·  💌 Love Letter = 100  ·  🏆 Trophy = 500  ·  👑 Crown = 1,000  ·  💎 Diamond = 5,000
          </Text>
        </View>

        <View style={s.paymentNotice}>
          <View style={s.paymentNoticeRow}>
            <Text style={s.paymentNoticeIcon}>✅</Text>
            <View style={s.paymentNoticeTextWrap}>
              <Text style={s.paymentNoticeGreen}>Recommended: Bank Transfer or USSD</Text>
              <Text style={s.paymentNoticeBody}>
                After payment opens, tap <Text style={s.paymentNoticeHighlight}>"Change payment method"</Text> to switch. Faster and more reliable than card.
              </Text>
            </View>
          </View>
          <View style={s.paymentNoticeLine} />
          <View style={s.paymentNoticeRow}>
            <Text style={s.paymentNoticeIcon}>⚠️</Text>
            <View style={s.paymentNoticeTextWrap}>
              <Text style={s.paymentNoticeYellow}>Card may get stuck on "Please wait"</Text>
              <Text style={s.paymentNoticeBody}>If stuck after OTP, wait for the verify button that appears automatically.</Text>
            </View>
          </View>
        </View>

        <Text style={s.sectionTitle}>{t.common.buy} Coins</Text>

        {COIN_PACKAGES.map((pkg) => {
          const totalCoins = pkg.coins + pkg.bonusCoins;
          const isLoading  = loading === pkg.id;
          const localPrice = convertFromNgn(pkg.priceNgn, currency);
          return (
            <TouchableOpacity key={pkg.id} style={[s.card, pkg.popular && s.cardPopular]}
              onPress={() => handleBuyPackage(pkg)} disabled={loading !== null} activeOpacity={0.8}>
              {pkg.popular && <View style={s.popularBadge}><Text style={s.popularBadgeText}>⭐ Most Popular</Text></View>}
              <View style={s.cardLeft}>
                <Text style={s.cardIcon}>{pkg.icon}</Text>
                <View>
                  <Text style={s.cardLabel}>{pkg.label}</Text>
                  <Text style={s.cardCoins}>{pkg.coins.toLocaleString()} {t.common.coins}</Text>
                  {pkg.bonusCoins > 0 && <Text style={s.cardBonus}>+{pkg.bonusCoins} bonus 🎁</Text>}
                  {pkg.bonusCoins > 0 && <Text style={s.cardTotal}>Total: {totalCoins.toLocaleString()}</Text>}
                  <Text style={s.cardGiftHint}>{pkg.giftHint}</Text>
                </View>
              </View>
              <View style={s.cardRight}>
                <Text style={s.cardLocalPrice}>{localPrice}</Text>
                {currency.code !== 'NGN' && <Text style={s.cardNgnPrice}>{formatNgn(pkg.priceNgn)}</Text>}
                {isLoading
                  ? <ActivityIndicator size="small" color="#00ff88" style={{ marginTop: 10 }} />
                  : <View style={[s.buyBtn, pkg.popular && s.buyBtnPopular]}>
                      <Text style={[s.buyBtnText, pkg.popular && s.buyBtnTextPopular]}>{FLW_TEST_MODE ? 'Test' : 'Buy'}</Text>
                    </View>}
              </View>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity style={s.historyLink} onPress={() => router.push('./transaction-history')}>
          <Feather name="clock" size={14} color="#555" />
          <Text style={s.historyLinkText}>View purchase history</Text>
        </TouchableOpacity>

        <View style={s.infoCard}>
          <Text style={s.infoTitle}>ℹ️ How coins work</Text>
          <Text style={s.infoText}>• Send coins as gifts or tips to creators</Text>
          <Text style={s.infoText}>• Coins are non-refundable once purchased</Text>
          <Text style={s.infoText}>• Payments processed securely by Flutterwave</Text>
          <Text style={s.infoText}>• Coins credited instantly after payment verified</Text>
          <Text style={s.infoText}>• Issues? Email support@lumvibe.app with your payment reference</Text>
        </View>
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:              { flex: 1, backgroundColor: '#000' },
  header:                 { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  headerTitle:            { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  testBanner:             { backgroundColor: '#1a1200', paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#ffd70033' },
  testBannerText:         { fontSize: 11, color: '#ffd700', textAlign: 'center' },
  scroll:                 { padding: 16 },
  balanceCard:            { backgroundColor: '#0d1a0d', borderRadius: 16, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: '#00ff8833', alignItems: 'center' },
  balanceLabel:           { color: '#666', fontSize: 12, marginBottom: 4 },
  balanceCoins:           { color: '#00ff88', fontSize: 36, fontWeight: 'bold', lineHeight: 42 },
  balanceSub:             { color: '#444', fontSize: 12, marginBottom: 4 },
  balanceNgn:             { color: '#ffd700', fontSize: 15, fontWeight: '600' },
  currencyBanner:         { backgroundColor: '#0d1a0d', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#00ff8833', alignItems: 'center' },
  currencyBannerText:     { color: '#888', fontSize: 12, textAlign: 'center' },
  currencyHighlight:      { color: '#00ff88', fontWeight: 'bold' },
  rateCard:               { backgroundColor: '#111', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#222' },
  rateRow:                { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rateLabel:              { color: '#666', fontSize: 12, marginBottom: 2 },
  rateValue:              { color: '#00ff88', fontSize: 20, fontWeight: 'bold' },
  rateNgnBox:             { alignItems: 'flex-end' },
  rateNgnLabel:           { color: '#444', fontSize: 10, marginBottom: 2 },
  rateNgn:                { color: '#555', fontSize: 14, fontWeight: '600' },
  giftHintBox:            { backgroundColor: '#0a0a0a', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#1a1a1a' },
  giftHintText:           { color: '#555', fontSize: 11, textAlign: 'center', lineHeight: 18 },
  paymentNotice:          { backgroundColor: '#0d0d0d', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#1e1e1e' },
  paymentNoticeRow:       { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  paymentNoticeIcon:      { fontSize: 16, marginTop: 1 },
  paymentNoticeTextWrap:  { flex: 1 },
  paymentNoticeGreen:     { color: '#00ff88', fontSize: 13, fontWeight: 'bold', marginBottom: 3 },
  paymentNoticeYellow:    { color: '#ffd700', fontSize: 13, fontWeight: 'bold', marginBottom: 3 },
  paymentNoticeHighlight: { color: '#00ff88', fontWeight: 'bold' },
  paymentNoticeBody:      { color: '#555', fontSize: 12, lineHeight: 18 },
  paymentNoticeLine:      { height: 1, backgroundColor: '#1e1e1e', marginVertical: 12 },
  sectionTitle:           { color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 12 },
  card:                   { backgroundColor: '#111', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#222', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPopular:            { borderColor: '#00ff8866', backgroundColor: '#0a1a0a' },
  popularBadge:           { position: 'absolute', top: -10, left: 16, backgroundColor: '#00ff88', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  popularBadgeText:       { color: '#000', fontSize: 10, fontWeight: 'bold' },
  cardLeft:               { flexDirection: 'row', alignItems: 'flex-start', flex: 1, gap: 12 },
  cardIcon:               { fontSize: 28, marginTop: 2 },
  cardLabel:              { color: '#666', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2 },
  cardCoins:              { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  cardBonus:              { color: '#ffd700', fontSize: 12, marginTop: 2 },
  cardTotal:              { color: '#00ff88', fontSize: 12, fontWeight: '600' },
  cardGiftHint:           { color: '#444', fontSize: 11, marginTop: 4 },
  cardRight:              { alignItems: 'flex-end' },
  cardLocalPrice:         { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  cardNgnPrice:           { color: '#555', fontSize: 11, marginTop: 1 },
  buyBtn:                 { backgroundColor: '#1a1a1a', borderRadius: 8, paddingHorizontal: 18, paddingVertical: 8, marginTop: 8, borderWidth: 1, borderColor: '#333' },
  buyBtnPopular:          { backgroundColor: '#00ff88', borderColor: '#00ff88' },
  buyBtnText:             { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  buyBtnTextPopular:      { color: '#000' },
  historyLink:            { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginBottom: 8 },
  historyLinkText:        { color: '#555', fontSize: 13 },
  infoCard:               { backgroundColor: '#0d0d0d', borderRadius: 12, padding: 16, marginTop: 8, borderWidth: 1, borderColor: '#1a1a1a' },
  infoTitle:              { color: '#fff', fontSize: 13, fontWeight: 'bold', marginBottom: 10 },
  infoText:               { color: '#555', fontSize: 12, lineHeight: 22 },
  webViewContainer:       { flex: 1, backgroundColor: '#000' },
  webViewHeader:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  webViewClose:           { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  webViewTitle:           { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  webViewLoadingOverlay:  { position: 'absolute', top: 100, left: 0, right: 0, bottom: 0, zIndex: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  webViewLoadingText:     { color: '#666', fontSize: 14, marginTop: 16 },
  webViewLoadingSubText:  { color: '#444', fontSize: 12, marginTop: 6 },
  timeoutBanner:          { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100, padding: 16 },
  timeoutBannerInner:     { backgroundColor: '#111', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#00ff8844', elevation: 10 },
  timeoutBannerTitle:     { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  timeoutBannerBody:      { color: '#888', fontSize: 13, lineHeight: 20, marginBottom: 16 },
  timeoutVerifyBtn:       { backgroundColor: '#00ff88', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 10 },
  timeoutVerifyBtnText:   { color: '#000', fontSize: 15, fontWeight: 'bold' },
  timeoutDismissBtn:      { alignItems: 'center', padding: 8 },
  timeoutDismissBtnText:  { color: '#444', fontSize: 13 },
}); 
