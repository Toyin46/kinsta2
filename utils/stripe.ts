import { getFunctions, httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

export const buyCoinsWithStripe = async (coins: number, price: number) => {
  try {
    const createIntent = httpsCallable(functions, 'createPaymentIntent');
    const result = await createIntent({ amount: price, coins });
    return result.data as { clientSecret: string; paymentIntentId: string };
  } catch (error) {
    console.error('Buy coins error:', error);
    throw error;
  }
};

export const confirmStripePayment = async (paymentIntentId: string) => {
  try {
    const confirm = httpsCallable(functions, 'confirmPayment');
    const result = await confirm({ paymentIntentId });
    return result.data as { success: boolean; coins?: number };
  } catch (error) {
    console.error('Confirm payment error:', error);
    throw error;
  }
};

export const setupPayoutAccount = async (email: string) => {
  try {
    const createAccount = httpsCallable(functions, 'createConnectedAccount');
    const result = await createAccount({ email });
    return result.data as { accountId: string; onboardingUrl: string };
  } catch (error) {
    console.error('Setup payout error:', error);
    throw error;
  }
};

export const withdrawEarnings = async (coins: number) => {
  try {
    const withdraw = httpsCallable(functions, 'processWithdrawal');
    const result = await withdraw({ coins });
    return result.data as { success: boolean; amount: number; transferId: string };
  } catch (error) {
    console.error('Withdrawal error:', error);
    throw error;
  }
};
	
