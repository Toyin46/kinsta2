// supabase/functions/create-payment/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14.14.0?target=deno';

const stripe = new Stripe(Deno.env.get('sk_test_51ScyRkPu5ChQEBuHeMbQA08MygvXZXg8AjGAN5lnxKhG2oVzFyyNNl5UV1NMTo3KHr7ctOO9Ci1WyAV9bn7U6HC400UZdsDH5K') || '', {
  apiVersion: '2023-10-16',
});

interface PaymentRequest {
  amount: number;
  coins: number;
  userId: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    console.log('🎯 Payment request received');

    // Parse request body
    const body = await req.json();
    console.log('📦 Request body:', body);

    const { amount, coins, userId }: PaymentRequest = body;

    // Validate inputs
    if (!amount || !coins || !userId) {
      console.error('❌ Missing required fields:', { amount, coins, userId });
      throw new Error('Missing required fields: amount, coins, or userId');
    }

    console.log('✅ Creating payment intent for:', { amount, coins, userId });

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount, // in cents
      currency: 'usd',
      metadata: {
        coins: coins.toString(),
        userId: userId,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    console.log('✅ Payment intent created:', paymentIntent.id);

    // Return response
    const response = {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    };

    console.log('📤 Returning response:', response);

    return new Response(
      JSON.stringify(response),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Payment error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: error
      }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});
	