import { supabase } from "@/config/supabase"; 

// Update user stats when they get views, likes, or coins
export async function updateUserStats(
  userId: string,
  updates: {
    views?: number;
    likes?: number;
    coins?: number;
    posts?: number;
  }
) {
  try {
    const { data: existingStats } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .single();

    const newStats = {
      total_views: (existingStats?.total_views || 0) + (updates.views || 0),
      total_likes: (existingStats?.total_likes || 0) + (updates.likes || 0),
      total_coins_received: (existingStats?.total_coins_received || 0) + (updates.coins || 0),
      total_posts: (existingStats?.total_posts || 0) + (updates.posts || 0),
      weekly_views: (existingStats?.weekly_views || 0) + (updates.views || 0),
      weekly_likes: (existingStats?.weekly_likes || 0) + (updates.likes || 0),
      monthly_views: (existingStats?.monthly_views || 0) + (updates.views || 0),
      monthly_likes: (existingStats?.monthly_likes || 0) + (updates.likes || 0),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('user_stats')
      .upsert({ user_id: userId, ...newStats });

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error updating user stats:', error);
    return { success: false, error };
  }
}

// Get leaderboard data
export async function getLeaderboard(
  period: 'weekly' | 'monthly' | 'alltime' = 'weekly',
  category: string = 'overall',
  limit: number = 100
) {
  try {
    let query = supabase
      .from('user_stats')
      .select(`
        *,
        users!inner (
          id,
          username,
          profile_picture
        )
      `);

    // Sort by period
    if (period === 'weekly') {
      query = query.order('weekly_views', { ascending: false });
    } else if (period === 'monthly') {
      query = query.order('monthly_views', { ascending: false });
    } else {
      query = query.order('total_views', { ascending: false });
    }

    // If category is not overall, filter by category
    if (category !== 'overall') {
      const { data: categoryData } = await supabase
        .from('leaderboard_categories')
        .select('id')
        .eq('name', category)
        .single();

      if (categoryData) {
        const { data: userCategoryData } = await supabase
          .from('user_categories')
          .select('user_id, views')
          .eq('category_id', categoryData.id)
          .order('views', { ascending: false })
          .limit(limit);

        if (userCategoryData) {
          const userIds = userCategoryData.map(uc => uc.user_id);
          query = query.in('user_id', userIds);
        }
      }
    }

    const { data, error } = await query.limit(limit);

    if (error) throw error;

    // Transform data to flatten users
    const transformedData = data?.map(item => ({
      ...item,
      username: item.users?.username || 'Unknown',
      profile_picture: item.users?.profile_picture || null,
    }));

    return { data: transformedData, error: null };
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    return { data: null, error };
  }
}

// Get user's rank
export async function getUserRank(
  userId: string,
  period: 'weekly' | 'monthly' | 'alltime' = 'weekly',
  category: string = 'overall'
) {
  try {
    const { data: allUsers } = await getLeaderboard(period, category, 10000);
    
    if (!allUsers) return { rank: null, totalUsers: 0 };

    const rank = allUsers.findIndex(user => user.user_id === userId) + 1;
    return { rank: rank || null, totalUsers: allUsers.length };
  } catch (error) {
    console.error('Error getting user rank:', error);
    return { rank: null, totalUsers: 0 };
  }
}

// Get all categories
export async function getCategories() {
  try {
    const { data, error } = await supabase
      .from('leaderboard_categories')
      .select('*')
      .order('name');

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error fetching categories:', error);
    return { data: null, error };
  }
}

// Update user category stats
export async function updateUserCategoryStats(
  userId: string,
  categoryName: string,
  views: number = 0,
  posts: number = 0
) {
  try {
    const { data: category } = await supabase
      .from('leaderboard_categories')
      .select('id')
      .eq('name', categoryName)
      .single();

    if (!category) return { success: false, error: 'Category not found' };

    const { data: existing } = await supabase
      .from('user_categories')
      .select('*')
      .eq('user_id', userId)
      .eq('category_id', category.id)
      .single();

    const newData = {
      user_id: userId,
      category_id: category.id,
      views: (existing?.views || 0) + views,
      post_count: (existing?.post_count || 0) + posts,
    };

    const { error } = await supabase
      .from('user_categories')
      .upsert(newData);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error updating category stats:', error);
    return { success: false, error };
  }
}