// FILE: features/live/services/liveService.ts
// Kinsta Live — All Supabase API calls

import { supabase } from '@/config/supabase'; 
import { LiveRoom, LiveMessage } from '../store/useLiveStore';
import { getLoyaltyRank, LOYALTY_RANKS } from '../gifts';
import { RealtimeChannel } from '@supabase/supabase-js';

// ─────────────────────────────────────────────
// ROOM MANAGEMENT
// ─────────────────────────────────────────────

export const createLiveRoom = async (params: {
  hostId: string;
  title: string;
  description?: string;
  category?: string;
  mood?: string;
  scheduledAt?: string;
  giftGoalAmount?: number;
  giftGoalLabel?: string;
  allowGuests?: boolean;
  guestFollowerDaysRequired?: number;
}) => {
  const channelName = `live_${params.hostId}_${Date.now()}`;

  const { data, error } = await supabase
    .from('live_rooms')
    .insert({
      host_id: params.hostId,
      title: params.title,
      description: params.description,
      category: params.category ?? 'general',
      mood: params.mood ?? 'chill',
      status: params.scheduledAt ? 'scheduled' : 'live',
      scheduled_at: params.scheduledAt ?? null,
      started_at: params.scheduledAt ? null : new Date().toISOString(),
      sdk_channel_name: channelName,
      gift_goal_amount: params.giftGoalAmount,
      gift_goal_label: params.giftGoalLabel,
      allow_guests: params.allowGuests ?? true,
      guest_follower_days_required: params.guestFollowerDaysRequired ?? 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const goLiveNow = async (roomId: string) => {
  const { error } = await supabase
    .from('live_rooms')
    .update({ status: 'live', started_at: new Date().toISOString() })
    .eq('id', roomId);
  if (error) throw error;
};

export const endLiveRoom = async (roomId: string, replayUrl?: string) => {
  const { error } = await supabase
    .from('live_rooms')
    .update({
      status: 'ended',
      ended_at: new Date().toISOString(),
      replay_url: replayUrl ?? null,
    })
    .eq('id', roomId);
  if (error) throw error;
};

export const getLiveRooms = async (filter?: {
  category?: string;
  mood?: string;
  status?: string;
}) => {
  let query = supabase
    .from('live_rooms')
    .select(`
      *,
      profiles:host_id (
        id,
        display_name,
        avatar_url,
        username
      )
    `)
    .order('viewer_count', { ascending: false });

  if (filter?.category) query = query.eq('category', filter.category);
  if (filter?.mood) query = query.eq('mood', filter.mood);
  if (filter?.status) query = query.eq('status', filter.status);
  else query = query.in('status', ['live', 'scheduled']);

  const { data, error } = await query;
  if (error) throw error;
  return data;
};

export const getLiveRoomById = async (roomId: string) => {
  const { data, error } = await supabase
    .from('live_rooms')
    .select(`
      *,
      profiles:host_id (
        id,
        display_name,
        avatar_url,
        username,
        follower_count
      )
    `)
    .eq('id', roomId)
    .single();
  if (error) throw error;
  return data;
};

export const updateViewerCount = async (roomId: string, delta: 1 | -1) => {
  const { error } = await supabase.rpc('increment_viewer_count', {
    room_id: roomId,
    delta,
  });
  // If RPC doesn't exist yet, use this fallback:
  if (error) {
    const { data: room } = await supabase
      .from('live_rooms')
      .select('viewer_count, peak_viewer_count')
      .eq('id', roomId)
      .single();

    if (room) {
      const newCount = Math.max(0, (room.viewer_count ?? 0) + delta);
      await supabase
        .from('live_rooms')
        .update({
          viewer_count: newCount,
          peak_viewer_count: Math.max(newCount, room.peak_viewer_count ?? 0),
        })
        .eq('id', roomId);
    }
  }
};

// ─────────────────────────────────────────────
// VIEWER TRACKING
// ─────────────────────────────────────────────

export const joinLiveRoom = async (roomId: string, userId: string) => {
  // Upsert viewer row
  await supabase.from('live_viewers').upsert(
    { room_id: roomId, user_id: userId, joined_at: new Date().toISOString(), left_at: null },
    { onConflict: 'room_id,user_id' }
  );
  await updateViewerCount(roomId, 1);

  // Post join system message
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .single();

  if (profile) {
    await sendChatMessage({
      roomId,
      userId,
      content: `${profile.display_name} joined`,
      messageType: 'join',
    });
  }
};

export const leaveLiveRoom = async (roomId: string, userId: string) => {
  await supabase
    .from('live_viewers')
    .update({ left_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('user_id', userId);
  await updateViewerCount(roomId, -1);
};

// ─────────────────────────────────────────────
// CHAT
// ─────────────────────────────────────────────

export const sendChatMessage = async (params: {
  roomId: string;
  userId: string;
  content: string;
  messageType?: 'chat' | 'gift' | 'system' | 'join';
  giftData?: object;
}) => {
  const { error } = await supabase.from('live_messages').insert({
    room_id: params.roomId,
    user_id: params.userId,
    content: params.content,
    message_type: params.messageType ?? 'chat',
  });
  if (error) throw error;
};

export const getRecentMessages = async (roomId: string, limit = 50) => {
  const { data, error } = await supabase
    .from('live_messages')
    .select(`
      *,
      profiles:user_id (
        display_name,
        avatar_url
      )
    `)
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).reverse();
};

// ─────────────────────────────────────────────
// GIFTS
// ─────────────────────────────────────────────

export const sendGift = async (params: {
  roomId: string;
  senderId: string;
  receiverId: string;
  giftId: string;
  giftName: string;
  giftEmoji: string;
  coinCost: number;
  quantity: number;
  animationType: string;
}) => {
  const totalCoins = params.coinCost * params.quantity;

  // 1. Deduct coins from sender wallet (you'll need a `user_coins` column on profiles)
  const { data: senderProfile, error: walletError } = await supabase
    .from('profiles')
    .select('coins_balance')
    .eq('id', params.senderId)
    .single();

  if (walletError) throw walletError;
  if (!senderProfile || (senderProfile.coins_balance ?? 0) < totalCoins) {
    throw new Error('INSUFFICIENT_COINS');
  }

  // 2. Insert gift record
  const { error: giftError } = await supabase.from('live_gifts').insert({
    room_id: params.roomId,
    sender_id: params.senderId,
    receiver_id: params.receiverId,
    gift_id: params.giftId,
    gift_name: params.giftName,
    gift_emoji: params.giftEmoji,
    coin_cost: params.coinCost,
    quantity: params.quantity,
    total_coins: totalCoins,
    animation_type: params.animationType,
  });
  if (giftError) throw giftError;

  // 3. Deduct coins from sender
  await supabase
    .from('profiles')
    .update({ coins_balance: (senderProfile.coins_balance ?? 0) - totalCoins })
    .eq('id', params.senderId);

  // 4. Credit 70% to creator (adjust CREATOR_PAYOUT_RATE in gifts.ts)
  const creatorEarnings = Math.floor(totalCoins * 0.7);
  await supabase.rpc('increment_creator_earnings', {
    user_id: params.receiverId,
    amount: creatorEarnings,
  }).match(() => {
    // Fallback if RPC not set up
    supabase
      .from('profiles')
      .select('pending_earnings')
      .eq('id', params.receiverId)
      .single()
      .then(({ data }) => {
        supabase
          .from('profiles')
          .update({ pending_earnings: (data?.pending_earnings ?? 0) + creatorEarnings })
          .eq('id', params.receiverId);
      });
  });

  // 5. Update room total
  await supabase
    .from('live_rooms')
    .update({
      total_gifts_received: supabase.rpc as any, // will be handled by trigger
    })
    .eq('id', params.roomId);

  // Simple update fallback
  const { data: room } = await supabase
    .from('live_rooms')
    .select('total_gifts_received')
    .eq('id', params.roomId)
    .single();
  if (room) {
    await supabase
      .from('live_rooms')
      .update({ total_gifts_received: (room.total_gifts_received ?? 0) + totalCoins })
      .eq('id', params.roomId);
  }

  // 6. Post gift message in chat
  const { data: senderName } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', params.senderId)
    .single();

  await sendChatMessage({
    roomId: params.roomId,
    userId: params.senderId,
    content: `${senderName?.display_name ?? 'Someone'} sent ${params.quantity}x ${params.giftEmoji} ${params.giftName}`,
    messageType: 'gift',
  });

  // 7. Update loyalty
  await updateViewerLoyalty(params.senderId, params.receiverId, totalCoins);

  return { success: true, totalCoins };
};

export const getTopGifters = async (roomId: string, limit = 5) => {
  const { data, error } = await supabase
    .from('live_gifts')
    .select(`
      sender_id,
      total_coins,
      profiles:sender_id (display_name, avatar_url)
    `)
    .eq('room_id', roomId)
    .order('total_coins', { ascending: false })
    .limit(limit);
  if (error) throw error;

  // Aggregate by sender
  const map: Record<string, { displayName: string; avatarUrl?: string; totalCoins: number }> = {};
  (data ?? []).forEach((row: any) => {
    const id = row.sender_id;
    if (!map[id]) {
      map[id] = {
        displayName: row.profiles?.display_name ?? 'Unknown',
        avatarUrl: row.profiles?.avatar_url,
        totalCoins: 0,
      };
    }
    map[id].totalCoins += row.total_coins;
  });

  return Object.entries(map)
    .sort((a, b) => b[1].totalCoins - a[1].totalCoins)
    .slice(0, limit)
    .map(([id, v]) => ({ userId: id, ...v }));
};

// ─────────────────────────────────────────────
// LOYALTY
// ─────────────────────────────────────────────

export const updateViewerLoyalty = async (
  viewerId: string,
  creatorId: string,
  coinsGifted: number
) => {
  const { data: existing } = await supabase
    .from('live_viewer_loyalty')
    .select('*')
    .eq('viewer_id', viewerId)
    .eq('creator_id', creatorId)
    .single();

  const newTotal = (existing?.total_coins_gifted ?? 0) + coinsGifted;
  const newRank = getLoyaltyRank(newTotal);

  if (existing) {
    await supabase
      .from('live_viewer_loyalty')
      .update({
        total_coins_gifted: newTotal,
        rank: newRank,
        updated_at: new Date().toISOString(),
      })
      .eq('viewer_id', viewerId)
      .eq('creator_id', creatorId);
  } else {
    await supabase.from('live_viewer_loyalty').insert({
      viewer_id: viewerId,
      creator_id: creatorId,
      total_coins_gifted: newTotal,
      rank: newRank,
      total_lives_attended: 1,
      last_attended_at: new Date().toISOString(),
    });
  }
};

export const getMyLoyaltyForCreator = async (viewerId: string, creatorId: string) => {
  const { data } = await supabase
    .from('live_viewer_loyalty')
    .select('*')
    .eq('viewer_id', viewerId)
    .eq('creator_id', creatorId)
    .single();
  return data;
};

// ─────────────────────────────────────────────
// RSVP
// ─────────────────────────────────────────────

export const rsvpToLive = async (roomId: string, userId: string) => {
  const { error } = await supabase
    .from('live_rsvps')
    .upsert({ room_id: roomId, user_id: userId }, { onConflict: 'room_id,user_id' });
  if (error) throw error;

  await supabase
    .from('live_rooms')
    .update({ rsvp_count: supabase.rpc as any })
    .eq('id', roomId);

  // Fallback count update
  const { data: room } = await supabase
    .from('live_rooms')
    .select('rsvp_count')
    .eq('id', roomId)
    .single();
  if (room) {
    await supabase
      .from('live_rooms')
      .update({ rsvp_count: (room.rsvp_count ?? 0) + 1 })
      .eq('id', roomId);
  }
};

export const cancelRsvp = async (roomId: string, userId: string) => {
  await supabase
    .from('live_rsvps')
    .delete()
    .eq('room_id', roomId)
    .eq('user_id', userId);
};

export const checkMyRsvp = async (roomId: string, userId: string) => {
  const { data } = await supabase
    .from('live_rsvps')
    .select('id')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .single();
  return !!data;
};

// ─────────────────────────────────────────────
// BATTLE
// ─────────────────────────────────────────────

export const startBattle = async (roomAId: string, roomBId: string, hostAId: string, hostBId: string) => {
  const { data, error } = await supabase
    .from('live_battles')
    .insert({
      room_a_id: roomAId,
      room_b_id: roomBId,
      host_a_id: hostAId,
      host_b_id: hostBId,
      status: 'active',
      started_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;

  // Mark rooms as battle active
  await supabase
    .from('live_rooms')
    .update({ is_battle_active: true })
    .in('id', [roomAId, roomBId]);

  return data;
};

export const endBattle = async (battleId: string) => {
  const { data: battle } = await supabase
    .from('live_battles')
    .select('*')
    .eq('id', battleId)
    .single();

  if (!battle) return;

  const winnerId = battle.coins_a >= battle.coins_b ? battle.host_a_id : battle.host_b_id;

  await supabase
    .from('live_battles')
    .update({
      status: 'ended',
      ended_at: new Date().toISOString(),
      winner_id: winnerId,
    })
    .eq('id', battleId);

  await supabase
    .from('live_rooms')
    .update({ is_battle_active: false })
    .in('id', [battle.room_a_id, battle.room_b_id]);

  return winnerId;
};

// ─────────────────────────────────────────────
// REALTIME SUBSCRIPTIONS
// ─────────────────────────────────────────────

export const subscribeToLiveChat = (
  roomId: string,
  onMessage: (msg: any) => void
): RealtimeChannel => {
  return supabase
    .channel(`live_chat_${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'live_messages',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => onMessage(payload.new)
    )
    .subscribe();
};

export const subscribeToLiveGifts = (
  roomId: string,
  onGift: (gift: any) => void
): RealtimeChannel => {
  return supabase
    .channel(`live_gifts_${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'live_gifts',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => onGift(payload.new)
    )
    .subscribe();
};

export const subscribeToRoomUpdates = (
  roomId: string,
  onUpdate: (room: any) => void
): RealtimeChannel => {
  return supabase
    .channel(`live_room_${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'live_rooms',
        filter: `id=eq.${roomId}`,
      },
      (payload) => onUpdate(payload.new)
    )
    .subscribe();
};

export const subscribeToBattle = (
  battleId: string,
  onUpdate: (battle: any) => void
): RealtimeChannel => {
  return supabase
    .channel(`live_battle_${battleId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'live_battles',
        filter: `id=eq.${battleId}`,
      },
      (payload) => onUpdate(payload.new)
    )
    .subscribe();
}; 
