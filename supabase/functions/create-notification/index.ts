import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
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

    const { 
      userId, 
      fromUserId, 
      type, 
      postId, 
      postImageUrl, 
      commentText, 
      coinAmount 
    } = await req.json()

    // Don't notify yourself
    if (userId === fromUserId) {
      return new Response(
        JSON.stringify({ success: true, message: 'Self-notification skipped' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create notification
    const { data, error } = await supabaseClient
      .from('notifications')
      .insert({
        user_id: userId,
        from_user_id: fromUserId,
        type: type,
        post_id: postId || null,
        post_image_url: postImageUrl || null,
        comment_text: commentText || null,
        coin_amount: coinAmount || null,
      })
      .select()
      .single()

    if (error) throw error

    return new Response(
      JSON.stringify({ success: true, data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})