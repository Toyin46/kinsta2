import * as Localization from 'expo-localization';

// Get user's currency based on locale
export const getUserCurrency = () => {
  const locale = Localization.locale || 'en-US';
  const region = Localization.region || 'US';
  
  const currencyMap: Record<string, string> = {
    US: 'USD',
    GB: 'GBP',
    EU: 'EUR',
    JP: 'JPY',
    CN: 'CNY',
    IN: 'INR',
    CA: 'CAD',
    AU: 'AUD',
    BR: 'BRL',
    MX: 'MXN',
    NG: 'NGN',
    ZA: 'ZAR',
    KE: 'KES',
    GH: 'GHS',
  };

  return currencyMap[region] || 'USD';
};

// Format amount to user's local currency
export const formatCurrency = (amount: number, currency?: string) => {
  const userCurrency = currency || getUserCurrency();
  const locale = Localization.locale || 'en-US';

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: userCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    // Fallback if currency formatting fails
    return `${userCurrency} ${amount.toFixed(2)}`;
  }
};

// Convert coins to cash (example: 1000 coins = $1)
export const coinsToCash = (coins: number): number => {
  return coins / 1000;
};

// Convert cash to coins
export const cashToCoins = (cash: number): number => {
  return Math.floor(cash * 1000);
};

// Get minimum withdrawal amount in user's currency
export const getMinWithdrawal = (currency?: string): number => {
  const userCurrency = currency || getUserCurrency();
  
  const minimums: Record<string, number> = {
    USD: 10,
    GBP: 8,
    EUR: 10,
    JPY: 1000,
    CNY: 70,
    INR: 800,
    CAD: 12,
    AUD: 15,
    BRL: 50,
    MXN: 200,
    NGN: 4000,
    ZAR: 150,
    KES: 1000,
    GHS: 60,
  };

  return minimums[userCurrency] || 10;
};

// Format coins display
export const formatCoins = (coins: number): string => {
  if (coins >= 1000000) {
    return `${(coins / 1000000).toFixed(1)}M`;
  }
  if (coins >= 1000) {
    return `${(coins / 1000).toFixed(1)}K`;
  }
  return coins.toString();
};