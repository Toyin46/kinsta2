// utils/chimoneyUtils.ts
// ✅ FIX: passes Authorization header so Edge Function receives the JWT
// ✅ IS_SANDBOX = true while Chimoney reviews your account

import { supabase } from '@/config/supabase';

export const IS_SANDBOX = true;  // ← set false when Chimoney approves live

// ─── Supported countries for global payouts ──────────────────────────────────
export const SUPPORTED_COUNTRIES = [
  { code: 'NG', name: 'Nigeria',       currency: 'NGN', flag: '🇳🇬' },
  { code: 'GH', name: 'Ghana',         currency: 'GHS', flag: '🇬🇭' },
  { code: 'KE', name: 'Kenya',         currency: 'KES', flag: '🇰🇪' },
  { code: 'ZA', name: 'South Africa',  currency: 'ZAR', flag: '🇿🇦' },
  { code: 'US', name: 'United States', currency: 'USD', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom',currency: 'GBP', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada',        currency: 'CAD', flag: '🇨🇦' },
  { code: 'EU', name: 'Europe (SEPA)', currency: 'EUR', flag: '🇪🇺' },
];

// ─── Get banks for a country ──────────────────────────────────────────────────
export async function getGlobalBanks(countryCode: string): Promise<Array<{ code: string; name: string }>> {
  try {
    // ✅ Pass auth header so Edge Function validates the user
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('chimoney-payout', {
      body: { action: 'list_banks', country: countryCode },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) throw error;
    return data?.banks || [];
  } catch (e: any) {
    console.warn('getGlobalBanks error:', e.message);
    return [];
  }
}

// ─── Send payout via Chimoney ─────────────────────────────────────────────────
export async function sendChimoneyPayout(
  userId: string,
  amountUSD: number,
  bankDetails: {
    accountNumber: string;
    bankCode:      string;
    iban?:         string;
    accountName:   string;
    countryCode:   string;
    currency:      string;
  }
): Promise<{ success: boolean; reference?: string; message?: string }> {
  try {
    // ✅ KEY FIX: Get session and pass JWT as Authorization header
    // Without this, the Edge Function returns "Missing authorization header"
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      return { success: false, message: 'Session expired. Please log in again and retry.' };
    }

    const { data, error } = await supabase.functions.invoke('chimoney-payout', {
      body: {
        action:        'send_payout',
        userId,
        amountUSD,
        bankDetails,
        isSandbox:     IS_SANDBOX,
      },
      // ✅ This is the fix — pass the Bearer token in the header
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (error) {
      console.error('Chimoney Edge Function error:', error);
      return {
        success: false,
        message: error.message || 'Payout service error. Your coins have been refunded.',
      };
    }

    if (data?.success) {
      return { success: true, reference: data.reference };
    } else {
      return {
        success: false,
        message: data?.error || data?.message || 'Payout failed. Your coins have been refunded.',
      };
    }
  } catch (e: any) {
    console.error('sendChimoneyPayout exception:', e);
    return {
      success: false,
      message: e.message || 'Unexpected error. Your coins have been refunded.',
    };
  }
}

// ─── Check Chimoney wallet balance (admin/debug use) ─────────────────────────
export async function getChimoneyBalance(): Promise<number> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return 0;

    const { data, error } = await supabase.functions.invoke('chimoney-payout', {
      body: { action: 'get_balance' },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) throw error;
    return data?.balance || 0;
  } catch (e: any) {
    console.warn('getChimoneyBalance error:', e.message);
    return 0;
  }
} 
