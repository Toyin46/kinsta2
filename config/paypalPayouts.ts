// config/paypalPayouts.ts
import paypal from '@paypal/payouts-sdk';

// TEST MODE - Use sandbox credentials
const environment = new paypal.core.SandboxEnvironment(
  process.env.EXPO_PUBLIC_PAYPAL_CLIENT_ID || 'your_client_id',
  process.env.EXPO_PUBLIC_PAYPAL_CLIENT_SECRET || 'your_client_secret'
);

// For LIVE mode later, use:
// const environment = new paypal.core.LiveEnvironment(clientId, clientSecret);

const client = new paypal.core.PayPalHttpClient(environment);

export const paypalPayouts = {
  async sendPayout(recipientEmail: string, amount: number, note: string = 'Kinsta Creator Earnings') {
    try {
      const request = new paypal.payouts.PayoutsPostRequest();
      request.requestBody({
        sender_batch_header: {
          sender_batch_id: `batch_${Date.now()}`,
          email_subject: 'You have received a payment from Kinsta!',
          email_message: 'You have received a payout! Thanks for using Kinsta!',
        },
        items: [
          {
            recipient_type: 'EMAIL',
            amount: {
              value: amount.toFixed(2),
              currency: 'USD',
            },
            receiver: recipientEmail,
            note: note,
            sender_item_id: `item_${Date.now()}`,
          },
        ],
      });

      const response = await client.execute(request);
      
      return {
        success: true,
        batchId: response.result.batch_header.payout_batch_id,
        status: response.result.batch_header.batch_status,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },

  async checkPayoutStatus(batchId: string) {
    try {
      const request = new paypal.payouts.PayoutsGetRequest(batchId);
      const response = await client.execute(request);
      
      return {
        success: true,
        status: response.result.batch_header.batch_status,
        items: response.result.items,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};