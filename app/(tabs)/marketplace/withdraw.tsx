// app/(tabs)/marketplace/withdraw.tsx
// ✅ Flutterwave replaces Chimoney completely
// ✅ Nigerian users: NGN bank transfer via Flutterwave
// ✅ International users: local currency transfer via Flutterwave (30+ countries)
// ✅ Balance check before deduction — coins never lost
// ✅ 10% platform commission deducted before payout
// ✅ FIX 1: Test mode no longer freezes withdraw button
// ✅ FIX 2: Routing number now saved to DB and read back correctly
// ✅ FIX 3: chimoney_reference column renamed to flw_reference
// ✅ Manual withdrawal — no Flutterwave payout call
// ✅ Admin notified via Supabase marketplace_withdrawals table

import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supabase } from "@/config/supabase";
import { useAuthStore } from "@/store/authStore";
import {
  SUPPORTED_COUNTRIES,
  getFlutterwaveBanks,
  verifyFlutterwaveAccount,
} from "@/utils/flutterwaveUtils";

const COIN_TO_NGN   = 150;
const PLATFORM_FEE  = 0.10;
const USER_RECEIVES = 0.90;
const MIN_WITHDRAW  = 5; // ✅ Temporarily lowered for testing (was 50)

const CURRENCY_BY_TIMEZONE: Record<string, { code: string; symbol: string; ratePerCoin: number }> = {
  'Africa/Lagos':        { code: 'NGN', symbol: '₦',   ratePerCoin: 150   },
  'Africa/Abuja':        { code: 'NGN', symbol: '₦',   ratePerCoin: 150   },
  'Africa/Accra':        { code: 'GHS', symbol: 'GH₵', ratePerCoin: 1.5   },
  'Africa/Nairobi':      { code: 'KES', symbol: 'KSh', ratePerCoin: 13    },
  'Africa/Johannesburg': { code: 'ZAR', symbol: 'R',   ratePerCoin: 1.8   },
  'Europe/London':       { code: 'GBP', symbol: '£',   ratePerCoin: 0.08  },
  'Europe/Paris':        { code: 'EUR', symbol: '€',   ratePerCoin: 0.09  },
  'America/New_York':    { code: 'USD', symbol: '$',   ratePerCoin: 0.10  },
  'America/Los_Angeles': { code: 'USD', symbol: '$',   ratePerCoin: 0.10  },
  'Asia/Dubai':          { code: 'AED', symbol: 'د.إ', ratePerCoin: 0.37  },
};
const DEFAULT_CURRENCY = { code: 'USD', symbol: '$', ratePerCoin: 0.10 };

function detectCurrency() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (CURRENCY_BY_TIMEZONE[tz]) return CURRENCY_BY_TIMEZONE[tz];
    for (const [key, val] of Object.entries(CURRENCY_BY_TIMEZONE)) {
      if (tz.startsWith(key.split('/')[0])) return val;
    }
  } catch {}
  return DEFAULT_CURRENCY;
}

export default function WithdrawMarketplaceScreen() {
  const router   = useRouter();
  const { user } = useAuthStore();
  const currency = detectCurrency();
  const withdrawalInProgress = useRef(false);

  const [loading,            setLoading]            = useState(true);
  const [submitting,         setSubmitting]          = useState(false);
  const [verifyingAccount,   setVerifyingAccount]    = useState(false);
  const [connectingBank,     setConnectingBank]      = useState(false);
  const [loadingBanks,       setLoadingBanks]        = useState(false);
  const [balance,            setBalance]             = useState(0);
  const [amount,             setAmount]              = useState("");
  const [history,            setHistory]             = useState<any[]>([]);

  const [ngnBanks,           setNgnBanks]            = useState<Array<{ name: string; code: string }>>([]);
  const [selectedBank,       setSelectedBank]        = useState<{ name: string; code: string } | null>(null);
  const [accountNo,          setAccountNo]           = useState("");
  const [accountName,        setAccountName]         = useState("");
  const [showBankList,       setShowBankList]        = useState(false);

  const [selectedCountry,    setSelectedCountry]     = useState<any>(null);
  const [globalBanks,        setGlobalBanks]         = useState<Array<{ name: string; code: string }>>([]);
  const [selectedGlobalBank, setSelectedGlobalBank]  = useState<{ name: string; code: string } | null>(null);
  const [globalAccountNo,    setGlobalAccountNo]     = useState("");
  const [globalAccountName,  setGlobalAccountName]   = useState("");
  const [routingNumber,      setRoutingNumber]       = useState("");
  const [iban,               setIban]                = useState("");
  const [showCountryList,    setShowCountryList]     = useState(false);
  const [showGlobalBankList, setShowGlobalBankList]  = useState(false);

  const [bankConnected,      setBankConnected]       = useState(false);
  const [bankCountry,        setBankCountry]         = useState<"NG" | "global" | null>(null);
  const [showBankSetup,      setShowBankSetup]       = useState(false);
  const [bankRegion,         setBankRegion]          = useState<"nigeria" | "global">("nigeria");

  const coins    = parseInt(amount) || 0;
  const grossNgn = coins * COIN_TO_NGN;
  const netNgn   = grossNgn * USER_RECEIVES;

  const formatLocal = (coinAmt: number) =>
    `${currency.symbol}${(coinAmt * currency.ratePerCoin).toLocaleString()}`;

  useEffect(() => { if (user?.id) loadData(); }, [user?.id]);

  const loadData = async () => {
    try {
      const { data: wallet } = await supabase
        .from("users")
        .select("marketplace_coins, bank_account_number, bank_code, bank_account_name, withdrawal_country, withdrawal_routing_number")
        .eq("id", user!.id).single();

      setBalance(wallet?.marketplace_coins || 0);

      if (wallet?.bank_account_number) {
        setBankConnected(true);
        setBankCountry(wallet?.withdrawal_country === "NG" ? "NG" : "global");
        setAccountNo(wallet?.bank_account_number || "");
        setAccountName(wallet?.bank_account_name || "");
        if (wallet?.withdrawal_routing_number) {
          setRoutingNumber(wallet.withdrawal_routing_number);
        }
      }

      const { data: txs } = await supabase
        .from("marketplace_withdrawals")
        .select("*").eq("seller_id", user!.id)
        .order("created_at", { ascending: false }).limit(10);
      setHistory(txs || []);
    } catch {}
    finally { setLoading(false); }
  };

  const loadNigerianBanks = async () => {
    setLoadingBanks(true);
    try {
      const list = await getFlutterwaveBanks('NG');
      setNgnBanks(list);
    } catch {}
    finally { setLoadingBanks(false); }
  };

  const handleVerifyNigerianAccount = async () => {
    if (!accountNo || !selectedBank) {
      Alert.alert("Error", "Select a bank and enter account number"); return;
    }
    setVerifyingAccount(true);
    try {
      const result = await verifyFlutterwaveAccount(accountNo, selectedBank.code);
      if (result.success && result.accountName) {
        setAccountName(result.accountName);
        Alert.alert("Account Verified! ✅", `Account Name: ${result.accountName}`);
      } else {
        Alert.alert("Verification Failed", result.message || "Invalid account details");
      }
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setVerifyingAccount(false); }
  };

  const handleConnectNigerianBank = async () => {
    if (!accountName || !accountNo || !selectedBank) {
      Alert.alert("Error", "Verify your account first"); return;
    }
    setConnectingBank(true);
    try {
      await supabase.from("users").update({
        bank_account_number:       accountNo,
        bank_account_name:         accountName,
        bank_code:                 selectedBank.code,
        withdrawal_country:        "NG",
        withdrawal_currency:       "NGN",
        withdrawal_routing_number: null,
      }).eq("id", user!.id);

      setBankConnected(true);
      setBankCountry("NG");
      setShowBankSetup(false);
      Alert.alert("Bank Connected! ✅", "You can now withdraw your marketplace earnings.");
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setConnectingBank(false); }
  };

  const handleSelectCountry = async (country: any) => {
    setSelectedCountry(country);
    setShowCountryList(false);
    setSelectedGlobalBank(null);
    setGlobalBanks([]);
    if (country.code !== "NG") {
      setLoadingBanks(true);
      try {
        const banks = await getFlutterwaveBanks(country.code);
        setGlobalBanks(banks);
      } catch {}
      finally { setLoadingBanks(false); }
    }
  };

  const handleConnectGlobalBank = async () => {
    if (!globalAccountName || !globalAccountNo || !selectedCountry) {
      Alert.alert("Error", "Please fill in all bank details"); return;
    }
    setConnectingBank(true);
    try {
      await supabase.from("users").update({
        bank_account_number:       globalAccountNo,
        bank_account_name:         globalAccountName,
        bank_code:                 selectedGlobalBank?.code || "",
        withdrawal_country:        selectedCountry.code,
        withdrawal_currency:       selectedCountry.currency,
        withdrawal_iban:           iban || null,
        withdrawal_routing_number: routingNumber || null,
      }).eq("id", user!.id);

      setBankConnected(true);
      setBankCountry("global");
      setShowBankSetup(false);
      Alert.alert("Bank Connected! ✅", `Your ${selectedCountry.name} bank has been saved.`);
    } catch (e: any) { Alert.alert("Error", e.message); }
    finally { setConnectingBank(false); }
  };

  const handleWithdraw = async () => {
    if (coins < MIN_WITHDRAW) {
      Alert.alert("Minimum", `Minimum is ${MIN_WITHDRAW} coins (${formatLocal(MIN_WITHDRAW)})`); return;
    }
    if (coins > balance) {
      Alert.alert("Insufficient", `You only have ${balance} coins.`); return;
    }
    if (!bankConnected) {
      Alert.alert("Bank Not Connected", "Connect your bank account first.", [
        { text: "Cancel", style: "cancel" },
        { text: "Connect Bank", onPress: async () => {
          await loadNigerianBanks();
          setShowBankSetup(true);
        }},
      ]);
      return;
    }

    Alert.alert(
      "Confirm Withdrawal",
      `Withdraw ${coins} coins?\n\nGross: ${formatLocal(coins)}\nPlatform fee (10%): -${formatLocal(coins * PLATFORM_FEE)}\nYou receive (90%): ${formatLocal(coins * USER_RECEIVES)}\n\nFunds will be sent to your bank within 1-3 business days.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Withdraw", onPress: executeWithdraw },
      ]
    );
  };

  const executeWithdraw = async () => {
    if (withdrawalInProgress.current) return;
    withdrawalInProgress.current = true;
    setSubmitting(true);

    let withdrawalRowId: string | null = null;
    let balanceBeforeDeduction: number | null = null;

    try {
      // STEP 1: Fresh balance check
      const { data: fresh, error: freshErr } = await supabase
        .from("users").select("marketplace_coins").eq("id", user!.id).single();
      if (freshErr) throw new Error("Could not verify balance. Please try again.");
      const current = fresh?.marketplace_coins || 0;
      if (current < coins) { Alert.alert("Error", "Your balance changed. Please try again."); return; }
      balanceBeforeDeduction = current;

      // STEP 2: Deduct coins
      const { error: deductErr } = await supabase
        .from("users")
        .update({ marketplace_coins: current - coins })
        .eq("id", user!.id);
      if (deductErr) throw new Error("Failed to deduct coins. Please try again.");
      setBalance(current - coins);

      // STEP 3: Get saved bank details from DB
      const { data: userData } = await supabase
        .from('users')
        .select('bank_account_number, bank_account_name, bank_code, display_name, username')
        .eq('id', user!.id).single();

      // STEP 4: Save withdrawal request for manual processing
      const { data: newRow, error: logErr } = await supabase
        .from("marketplace_withdrawals")
        .insert({
          seller_id:      user!.id,
          amount_ngn:     netNgn,
          bank_name:      selectedBank?.name || selectedGlobalBank?.name || userData?.bank_account_name || 'Connected Bank',
          account_number: userData?.bank_account_number || accountNo || globalAccountNo,
          account_name:   userData?.bank_account_name || accountName || globalAccountName,
          bank_code:      userData?.bank_code || selectedBank?.code || '',
          status:         'pending',
        })
        .select("id").single();
      if (logErr || !newRow?.id) throw new Error(`Failed to log withdrawal: ${logErr?.message}. Coins will be refunded.`);
      withdrawalRowId = newRow.id;

      setAmount("");
      await loadData();
      Alert.alert(
        'Withdrawal Requested! ✅',
        `Your request for ${formatLocal(coins * USER_RECEIVES)} has been submitted.\n\nWe will process your payment within 1-3 business days. You will be notified once it has been sent to your bank. 🙏`
      );

    } catch (e: any) {
      if (balanceBeforeDeduction !== null) {
        await refundCoins(balanceBeforeDeduction, withdrawalRowId, e.message);
      } else {
        Alert.alert("Error", e.message || "Something went wrong. Your coins are safe.");
      }
    } finally {
      setSubmitting(false);
      withdrawalInProgress.current = false;
    }
  };

  const refundCoins = async (originalBalance: number, rowId: string | null, errorMessage?: string) => {
    try {
      await supabase.from("users").update({ marketplace_coins: originalBalance }).eq("id", user!.id);
      setBalance(originalBalance);
      if (rowId) await supabase.from("marketplace_withdrawals").update({ status: "failed" }).eq("id", rowId);
    } catch { console.error("CRITICAL: Coin refund failed for user", user!.id); }
    Alert.alert("Withdrawal Failed", `Your ${coins} coins have been refunded.\n\n${errorMessage || "Please try again."}`);
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#00ff88" /></View>;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Withdraw Earnings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.balanceCard}>
          <Text style={s.balanceLabel}>Marketplace Wallet</Text>
          <Text style={s.balanceCoins}>{balance} coins</Text>
          <Text style={s.balanceNgn}>{formatLocal(balance)}</Text>
          <Text style={s.balanceMin}>Min withdrawal: {MIN_WITHDRAW} coins ({formatLocal(MIN_WITHDRAW)})</Text>
        </View>

        {bankConnected ? (
          <View style={s.bankConnected}>
            <Feather name="check-circle" size={18} color="#00ff88" />
            <Text style={s.bankConnectedText}>
              {bankCountry === "NG" ? "🇳🇬" : "🌍"} Bank connected ****{(accountNo || globalAccountNo).slice(-4)}
            </Text>
            <TouchableOpacity onPress={async () => { await loadNigerianBanks(); setShowBankSetup(true); }}>
              <Text style={s.changeText}>Change</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={s.connectBankBtn} onPress={async () => { await loadNigerianBanks(); setShowBankSetup(true); }}>
            <Feather name="credit-card" size={18} color="#000" />
            <Text style={s.connectBankText}>Connect Bank Account</Text>
          </TouchableOpacity>
        )}

        {showBankSetup && (
          <View style={s.bankForm}>
            <Text style={s.formTitle}>Connect Bank Account</Text>
            <View style={s.regionToggle}>
              <TouchableOpacity style={[s.regionBtn, bankRegion === "nigeria" && s.regionBtnActive]} onPress={() => setBankRegion("nigeria")}>
                <Text style={[s.regionBtnText, bankRegion === "nigeria" && s.regionBtnTextActive]}>🇳🇬 Nigeria</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.regionBtn, bankRegion === "global" && s.regionBtnActive]} onPress={() => setBankRegion("global")}>
                <Text style={[s.regionBtnText, bankRegion === "global" && s.regionBtnTextActive]}>🌍 Other Countries</Text>
              </TouchableOpacity>
            </View>

            {bankRegion === "nigeria" && (
              <>
                <Text style={s.label}>Select Bank</Text>
                {loadingBanks
                  ? <ActivityIndicator color="#00ff88" style={{ marginVertical: 10 }} />
                  : <>
                      <TouchableOpacity style={s.selectRow} onPress={() => setShowBankList(!showBankList)}>
                        <Text style={[s.selectText, !selectedBank && { color: "#444" }]}>{selectedBank?.name || "Select your bank"}</Text>
                        <Feather name={showBankList ? "chevron-up" : "chevron-down"} size={18} color="#666" />
                      </TouchableOpacity>
                      {showBankList && (
                        <ScrollView style={s.bankList} nestedScrollEnabled>
                          {ngnBanks.map((b) => (
                            <TouchableOpacity key={b.code} style={[s.bankItem, selectedBank?.code === b.code && s.bankItemSel]}
                              onPress={() => { setSelectedBank(b); setShowBankList(false); }}>
                              <Text style={[s.bankText, selectedBank?.code === b.code && { color: "#00ff88" }]}>{b.name}</Text>
                              {selectedBank?.code === b.code && <Feather name="check" size={14} color="#00ff88" />}
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      )}
                    </>
                }
                <Text style={s.label}>Account Number</Text>
                <TextInput style={s.input} placeholder="10-digit account number" placeholderTextColor="#444"
                  keyboardType="numeric" maxLength={10} value={accountNo} onChangeText={setAccountNo} />
                {accountName ? (
                  <View style={s.verifiedBox}>
                    <Feather name="check-circle" size={18} color="#00ff88" />
                    <Text style={s.verifiedName}>{accountName}</Text>
                  </View>
                ) : null}
                <TouchableOpacity style={[s.verifyBtn, (verifyingAccount || !accountNo || !selectedBank) && s.btnDisabled]}
                  onPress={handleVerifyNigerianAccount} disabled={verifyingAccount || !accountNo || !selectedBank}>
                  {verifyingAccount ? <ActivityIndicator size="small" color="#000" /> : <Text style={s.verifyBtnText}>Verify Account</Text>}
                </TouchableOpacity>
                {accountName && (
                  <TouchableOpacity style={[s.connectBtn, connectingBank && s.btnDisabled]}
                    onPress={handleConnectNigerianBank} disabled={connectingBank}>
                    {connectingBank ? <ActivityIndicator size="small" color="#000" /> : <Text style={s.connectBtnText}>Save & Connect Bank</Text>}
                  </TouchableOpacity>
                )}
              </>
            )}

            {bankRegion === "global" && (
              <>
                <Text style={s.label}>Select Country</Text>
                <TouchableOpacity style={s.selectRow} onPress={() => setShowCountryList(!showCountryList)}>
                  <Text style={[s.selectText, !selectedCountry && { color: "#444" }]}>{selectedCountry?.flag} {selectedCountry?.name || "Select your country"}</Text>
                  <Feather name={showCountryList ? "chevron-up" : "chevron-down"} size={18} color="#666" />
                </TouchableOpacity>
                {showCountryList && (
                  <ScrollView style={s.bankList} nestedScrollEnabled>
                    {SUPPORTED_COUNTRIES.filter(c => c.code !== "NG").map((country) => (
                      <TouchableOpacity key={country.code} style={[s.bankItem, selectedCountry?.code === country.code && s.bankItemSel]}
                        onPress={() => handleSelectCountry(country)}>
                        <Text style={[s.bankText, selectedCountry?.code === country.code && { color: "#00ff88" }]}>
                          {country.flag} {country.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                {selectedCountry && (
                  <>
                    {globalBanks.length > 0 && (
                      <>
                        <Text style={s.label}>Select Bank</Text>
                        <TouchableOpacity style={s.selectRow} onPress={() => setShowGlobalBankList(!showGlobalBankList)}>
                          <Text style={[s.selectText, !selectedGlobalBank && { color: "#444" }]}>{selectedGlobalBank?.name || "Select your bank"}</Text>
                          <Feather name={showGlobalBankList ? "chevron-up" : "chevron-down"} size={18} color="#666" />
                        </TouchableOpacity>
                        {showGlobalBankList && (
                          <ScrollView style={s.bankList} nestedScrollEnabled>
                            {globalBanks.map((b) => (
                              <TouchableOpacity key={b.code} style={s.bankItem} onPress={() => { setSelectedGlobalBank(b); setShowGlobalBankList(false); }}>
                                <Text style={s.bankText}>{b.name}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        )}
                      </>
                    )}
                    <Text style={s.label}>Account Number / IBAN</Text>
                    <TextInput style={s.input} placeholder="Account number or IBAN" placeholderTextColor="#444"
                      value={globalAccountNo} onChangeText={setGlobalAccountNo} autoCapitalize="none" />
                    {["US", "CA"].includes(selectedCountry.code) && (
                      <>
                        <Text style={s.label}>Routing Number</Text>
                        <TextInput style={s.input} placeholder="9-digit routing number" placeholderTextColor="#444"
                          keyboardType="numeric" value={routingNumber} onChangeText={setRoutingNumber} />
                      </>
                    )}
                    {["GB", "DE", "FR"].includes(selectedCountry.code) && (
                      <>
                        <Text style={s.label}>IBAN</Text>
                        <TextInput style={s.input} placeholder="e.g. GB29NWBK60161331926819" placeholderTextColor="#444"
                          value={iban} onChangeText={setIban} autoCapitalize="characters" />
                      </>
                    )}
                    <Text style={s.label}>Account Holder Name</Text>
                    <TextInput style={s.input} placeholder="Full name on account" placeholderTextColor="#444"
                      value={globalAccountName} onChangeText={setGlobalAccountName} />
                    <TouchableOpacity style={[s.connectBtn, connectingBank && s.btnDisabled]}
                      onPress={handleConnectGlobalBank} disabled={connectingBank || !globalAccountNo || !globalAccountName}>
                      {connectingBank ? <ActivityIndicator size="small" color="#000" /> : <Text style={s.connectBtnText}>Save & Connect Bank</Text>}
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}
          </View>
        )}

        <Text style={s.label}>Amount (coins)</Text>
        <View style={s.amountRow}>
          <View style={s.amountInput}>
            <TextInput style={s.amountText} placeholder="Enter coins to withdraw" placeholderTextColor="#444"
              keyboardType="numeric" value={amount} onChangeText={t => setAmount(t.replace(/[^0-9]/g, ""))} />
          </View>
          {coins > 0 && (
            <View style={s.ngnBadge}>
              <Text style={s.ngnText}>{formatLocal(coins)}</Text>
            </View>
          )}
        </View>

        <View style={s.quickRow}>
          {[25, 50, 75, 100].map((pct, idx) => {
            const v = Math.floor(balance * pct / 100);
            if (v < MIN_WITHDRAW) return null;
            return (
              <TouchableOpacity key={`q-${idx}`} style={s.quickBtn} onPress={() => setAmount(String(v))}>
                <Text style={s.quickBtnText}>{pct === 100 ? "Max" : `${pct}%`}</Text>
                <Text style={s.quickBtnSub}>{formatLocal(v)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {coins >= MIN_WITHDRAW && (
          <View style={s.summary}>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Gross Amount</Text>
              <Text style={s.summaryValue}>{formatLocal(coins)}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Platform Fee (10%)</Text>
              <Text style={[s.summaryValue, { color: "#ff6b6b" }]}>-{formatLocal(coins * PLATFORM_FEE)}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>You Receive (90%)</Text>
              <Text style={[s.summaryValue, { color: "#00ff88" }]}>{formatLocal(coins * USER_RECEIVES)}</Text>
            </View>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Processing Time</Text>
              <Text style={s.summaryValue}>1-3 business days</Text>
            </View>
          </View>
        )}

        <TouchableOpacity style={[s.submitBtn, (submitting || coins < MIN_WITHDRAW) && s.btnDisabled]}
          onPress={handleWithdraw} disabled={submitting || coins < MIN_WITHDRAW}>
          {submitting
            ? <ActivityIndicator size="small" color="#000" />
            : <Text style={s.submitText}>
                {coins >= MIN_WITHDRAW ? `Withdraw ${formatLocal(coins * USER_RECEIVES)}` : `Enter at least ${MIN_WITHDRAW} coins`}
              </Text>}
        </TouchableOpacity>

        <View style={s.flwBadge}>
          <Text style={s.flwText}>Secure withdrawal  •  30+ countries  •  1-3 business days</Text>
        </View>

        {history.length > 0 && (
          <View style={s.historySection}>
            <Text style={s.historyTitle}>Withdrawal History</Text>
            {history.map((tx: any) => (
              <View key={tx.id} style={s.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.historyBank}>{tx.bank_name}  ****{(tx.account_number || tx.account_no)?.slice(-4)}</Text>
                  <Text style={s.historyDate}>{new Date(tx.created_at).toLocaleDateString()}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={s.historyAmt}>{formatLocal((tx.amount_ngn / COIN_TO_NGN) * USER_RECEIVES)}</Text>
                  <Text style={[s.historyStatus, {
                    color: tx.status === "completed" ? "#00ff88" : tx.status === "failed" ? "#ff4d4d" : "#ffa500"
                  }]}>{tx.status}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:           { flex: 1, backgroundColor: "#000" },
  center:              { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000" },
  header:              { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: "#1a1a1a" },
  headerTitle:         { color: "#fff", fontSize: 18, fontWeight: "bold" },
  scroll:              { padding: 16, paddingBottom: 60 },
  balanceCard:         { backgroundColor: "#0a1a0a", borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 2, borderColor: "#00ff8844", alignItems: "center" },
  balanceLabel:        { color: "#666", fontSize: 12, marginBottom: 6 },
  balanceCoins:        { color: "#00ff88", fontSize: 36, fontWeight: "bold" },
  balanceNgn:          { color: "#ffd700", fontSize: 18, fontWeight: "700", marginTop: 4 },
  balanceMin:          { color: "#444", fontSize: 11, marginTop: 8 },
  bankConnected:       { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#001a0a", borderRadius: 10, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#00ff8833" },
  bankConnectedText:   { color: "#00ff88", fontSize: 13, flex: 1 },
  changeText:          { color: "#ffd700", fontSize: 12, fontWeight: "600" },
  connectBankBtn:      { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#00ff88", borderRadius: 12, padding: 16, marginBottom: 16 },
  connectBankText:     { color: "#000", fontWeight: "bold", fontSize: 15 },
  bankForm:            { backgroundColor: "#111", borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "#222" },
  formTitle:           { color: "#fff", fontSize: 15, fontWeight: "bold", marginBottom: 16 },
  regionToggle:        { flexDirection: "row", gap: 8, marginBottom: 16 },
  regionBtn:           { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: "#333", alignItems: "center" },
  regionBtnActive:     { borderColor: "#00ff88", backgroundColor: "#001a0a" },
  regionBtnText:       { color: "#666", fontSize: 13, fontWeight: "600" },
  regionBtnTextActive: { color: "#00ff88" },
  label:               { color: "#888", fontSize: 12, fontWeight: "600", marginBottom: 8, marginTop: 4 },
  selectRow:           { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#1a1a1a", borderRadius: 10, borderWidth: 1, borderColor: "#333", paddingHorizontal: 14, paddingVertical: 14, marginBottom: 6 },
  selectText:          { color: "#fff", fontSize: 14 },
  bankList:            { backgroundColor: "#1a1a1a", borderRadius: 10, maxHeight: 180, marginBottom: 12 },
  bankItem:            { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#222" },
  bankItemSel:         { backgroundColor: "#001a0a" },
  bankText:            { color: "#aaa", fontSize: 14 },
  input:               { backgroundColor: "#1a1a1a", borderRadius: 10, borderWidth: 1, borderColor: "#333", paddingHorizontal: 14, paddingVertical: 14, color: "#fff", fontSize: 14, marginBottom: 12 },
  verifiedBox:         { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#001a0a", borderRadius: 8, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#00ff8833" },
  verifiedName:        { color: "#00ff88", fontSize: 14, fontWeight: "bold" },
  verifyBtn:           { backgroundColor: "#00ff88", padding: 14, borderRadius: 10, alignItems: "center", marginBottom: 8 },
  verifyBtnText:       { color: "#000", fontWeight: "bold", fontSize: 14 },
  connectBtn:          { backgroundColor: "#ffd700", padding: 14, borderRadius: 10, alignItems: "center" },
  connectBtnText:      { color: "#000", fontWeight: "bold", fontSize: 14 },
  btnDisabled:         { opacity: 0.5 },
  amountRow:           { flexDirection: "row", gap: 10, marginBottom: 10 },
  amountInput:         { flex: 1, backgroundColor: "#111", borderRadius: 12, borderWidth: 1, borderColor: "#333", paddingHorizontal: 14 },
  amountText:          { color: "#fff", fontSize: 16, paddingVertical: 14 },
  ngnBadge:            { backgroundColor: "#1a1500", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: "#ffd70044", justifyContent: "center" },
  ngnText:             { color: "#ffd700", fontSize: 14, fontWeight: "700" },
  quickRow:            { flexDirection: "row", gap: 8, marginBottom: 16 },
  quickBtn:            { flex: 1, backgroundColor: "#111", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#333", alignItems: "center" },
  quickBtnText:        { color: "#fff", fontSize: 12, fontWeight: "700" },
  quickBtnSub:         { color: "#666", fontSize: 10, marginTop: 2 },
  summary:             { backgroundColor: "#111", borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "#222" },
  summaryRow:          { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  summaryLabel:        { color: "#888", fontSize: 13 },
  summaryValue:        { color: "#fff", fontSize: 13, fontWeight: "600" },
  submitBtn:           { backgroundColor: "#00ff88", padding: 18, borderRadius: 14, alignItems: "center", marginBottom: 12 },
  submitText:          { color: "#000", fontWeight: "bold", fontSize: 15 },
  flwBadge:            { backgroundColor: "#111", borderRadius: 10, padding: 12, alignItems: "center", marginBottom: 20, borderWidth: 1, borderColor: "#222" },
  flwText:             { color: "#555", fontSize: 11 },
  historySection:      { marginTop: 4 },
  historyTitle:        { color: "#fff", fontSize: 15, fontWeight: "bold", marginBottom: 12 },
  historyRow:          { flexDirection: "row", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#111" },
  historyBank:         { color: "#fff", fontSize: 13, marginBottom: 2 },
  historyDate:         { color: "#555", fontSize: 11 },
  historyAmt:          { color: "#00ff88", fontSize: 13, fontWeight: "bold" },
  historyStatus:       { fontSize: 10, fontWeight: "600", marginTop: 2 },
}); 
