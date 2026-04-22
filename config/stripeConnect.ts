// config/stripeConnect.ts
import Stripe from 'stripe';

// TEST MODE - Switch to live keys later
const stripe = new Stripe(
  process.env.EXPO_PUBLIC_STRIPE_SECRET_KEY || 
  'sk_test_51ScyQmLg4nqum0sOcoqsdN8Sdlc7KNl7a67wMESwY2pmodC0WZhsCaG1WPybB7fZjwrw2ttiWVWdSU6WwOku1cGi008YHyAfKu',
  {
    apiVersion: '2024-11-20.acacia' as any, // Type assertion for compatibility
  }
);

export const stripeConnect = {
  // Create connected account for creator
  async createConnectedAccount(email: string, country: string = 'US') {
    try {
      const account = await stripe.accounts.create({
        type: 'express',
        country: country,
        email: email,
        capabilities: {
          transfers: { requested: true },
        },
      });
      
      return { success: true, accountId: account.id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // Create account link for user to complete onboarding
  async createAccountLink(accountId: string, returnUrl: string, refreshUrl: string) {
    try {
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });
      
      return { success: true, url: accountLink.url };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // Check if account is fully onboarded
  async checkAccountStatus(accountId: string) {
    try {
      const account = await stripe.accounts.retrieve(accountId);
      return {
        success: true,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // Send payout to connected account
  async sendPayout(accountId: string, amount: number, currency: string = 'usd') {
    try {
      // Create transfer to connected account
      const transfer = await stripe.transfers.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency,
        destination: accountId,
        description: 'Creator earnings withdrawal',
      });
      
      return { success: true, transferId: transfer.id };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },

  // Create payment intent (for testing payments)
  async createPaymentIntent(amount: number, currency: string = 'usd') {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency,
        payment_method_types: ['card'],
      });
      
      return { 
        success: true, 
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id 
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};