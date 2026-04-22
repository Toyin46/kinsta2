import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.21.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const cryptoProvider = Stripe.createSubtleCryptoProvider()

console.log('Stripe webhook handler loaded')

serve(async (request) => {
  const signature = request.headers.get('Stripe-Signature')

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not set')
    return new Response('Webhook secret not configured', { status: 500 })
  }

  if (!signature) {
    console.error('No signature found in request')
    return new Response('No signature', { status: 400 })
  }

  const body = await request.text()
  let receivedEvent: Stripe.Event

  try {
    receivedEvent = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  console.log(`Received event: ${receivedEvent.type}`)

  // Initialize Supabase Admin Client
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    switch (receivedEvent.type) {
      case 'checkout.session.completed':
        const session = receivedEvent.data.object;
        const userId = session.metadata.userId;
        const coinsToAdd = parseFloat(session.metadata.coins);

        console.log('Payment successful:', { userId, coinsToAdd });

        // Update user's coin balance in Supabase
        const { data: userData, error: fetchError } = await supabase
          .from('users')
          .select('coins')
          .eq('id', userId)
          .single();

        if (fetchError) {
          console.error('Error fetching user:', fetchError);
          throw fetchError;
        }

        const currentCoins = userData?.coins || 0;
        const newBalance = currentCoins + coinsToAdd;

        const { error: updateError } = await supabase
          .from('users')
          .update({ coins: newBalance })
          .eq('id', userId);

        if (updateError) {
          console.error('Error updating coins:', updateError);
          throw updateError;
        }

        // Record the transaction
        const { error: txError } = await supabase.from('transactions').insert({
          user_id: userId,
          type: 'purchase',
          amount: coinsToAdd,
          description: `Purchased ${coinsToAdd} coins`,
          status: 'completed',
        });

        if (txError) {
          console.error('Error recording transaction:', txError);
        }

        console.log('Coins added successfully:', { userId, newBalance });
        break;

      default:
        console.log(`Unhandled event type: ${receivedEvent.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (err) {
    console.error('Error processing webhook:', err)
    return new Response(
      JSON.stringify({ error: 'Webhook handler failed', details: err.message }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
}) 
	
