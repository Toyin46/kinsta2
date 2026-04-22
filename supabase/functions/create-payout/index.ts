// supabase/functions/create-payout/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.21.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get request body
    const { user_id, amount, transaction_id, stripe_account_id } = await req.json()

    // Validate inputs
    if (!user_id || !amount || !transaction_id || !stripe_account_id) {
      throw new Error('Missing required fields')
    }

    // Get user data
    const { data: userData, error: userError } = await supabaseClient
      .from('users')
      .select('email, stripe_account_id')
      .eq('id', user_id)
      .single()

    if (userError || !userData) {
      throw new Error('User not found')
    }

    // Verify stripe account matches
    if (userData.stripe_account_id !== stripe_account_id) {
      throw new Error('Stripe account mismatch')
    }

    // Convert amount to cents (Stripe uses cents)
    const amountInCents = Math.round(amount * 100)

    // Create Stripe Transfer (for Connect accounts)
    const transfer = await stripe.transfers.create({
      amount: amountInCents,
      currency: 'usd',
      destination: stripe_account_id,
      description: `Payout for transaction ${transaction_id}`,
    })

    // Update transaction in database
    const { error: updateError } = await supabaseClient
      .from('transactions')
      .update({
        status: 'completed',
        stripe_payout_id: transfer.id,
        completed_at: new Date().toISOString(),
      })
      .eq('id', transaction_id)

    if (updateError) {
      console.error('Failed to update transaction:', updateError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        payout_id: transfer.id,
        amount: amount,
        message: 'Payout created successfully',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error: any) {
    console.error('Payout error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})