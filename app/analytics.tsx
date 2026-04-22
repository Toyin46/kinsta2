// app/analytics.tsx - ADVANCED ANALYTICS with REAL DATA from database
// ✅ Translations added via useTranslation()

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/config/supabase';
import { useTranslation } from '@/locales/LanguageContext';

interface AnalyticsData {
  totalViews: number; totalLikes: number; totalComments: number; totalShares: number;
  totalPosts: number; followersCount: number; followingCount: number;
  engagementRate: number; avgViewsPerPost: number; avgLikesPerPost: number;
  growthRate: number; topPost: TopPost | null; recentPosts: PostStat[];
  weeklyFollowers: WeeklyPoint[];
}
interface TopPost { id: string; caption: string; media_url: string; likes_count: number; comments_count: number; views_count: number; created_at: string; }
interface PostStat { id: string; caption: string; likes_count: number; comments_count: number; views_count: number; created_at: string; }
interface WeeklyPoint { label: string; followers: number; }

const EMPTY: AnalyticsData = {
  totalViews: 0, totalLikes: 0, totalComments: 0, totalShares: 0,
  totalPosts: 0, followersCount: 0, followingCount: 0,
  engagementRate: 0, avgViewsPerPost: 0, avgLikesPerPost: 0,
  growthRate: 0, topPost: null, recentPosts: [], weeklyFollowers: [],
};

export default function AnalyticsScreen() {
  const { user } = useAuthStore();
  const { t }    = useTranslation();
  const [data,       setData]       = useState<AnalyticsData>(EMPTY);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadAnalytics(); }, []);

  const loadAnalytics = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data: userData } = await supabase.from('users')
        .select('followers_count, following_count, created_at').eq('id', user.id).single();

      const { data: posts } = await supabase.from('posts')
        .select('id, caption, media_url, media_type, likes_count, comments_count, views_count, shares_count, created_at')
        .eq('user_id', user.id).order('created_at', { ascending: false });

      const postList = posts || [];

      let realLikes = 0;
      if (postList.length > 0) {
        const postIds = postList.map(p => p.id);
        const { count: likesCount } = await supabase.from('likes').select('id', { count: 'exact', head: true }).in('post_id', postIds);
        realLikes = likesCount || 0;
      }

      let realComments = 0;
      if (postList.length > 0) {
        const postIds = postList.map(p => p.id);
        const { count: commentsCount } = await supabase.from('comments').select('id', { count: 'exact', head: true }).in('post_id', postIds);
        realComments = commentsCount || 0;
      }

      const totalViews   = postList.reduce((sum, p) => sum + (p.views_count || 0), 0);
      const totalShares  = postList.reduce((sum, p) => sum + (p.shares_count || 0), 0);
      const totalPosts   = postList.length;
      const followersCount = userData?.followers_count || 0;
      const followingCount = userData?.following_count || 0;

      const totalEngagements = realLikes + realComments + totalShares;
      const engagementRate   = totalViews > 0 ? parseFloat(((totalEngagements / totalViews) * 100).toFixed(1)) : 0;
      const avgViewsPerPost  = totalPosts > 0 ? parseFloat((totalViews / totalPosts).toFixed(1)) : 0;
      const avgLikesPerPost  = totalPosts > 0 ? parseFloat((realLikes / totalPosts).toFixed(1)) : 0;

      let growthRate = 0;
      if (userData?.created_at) {
        const created = new Date(userData.created_at);
        const weeks   = Math.max(1, (new Date().getTime() - created.getTime()) / (1000 * 60 * 60 * 24 * 7));
        growthRate    = parseFloat((followersCount / weeks).toFixed(1));
      }

      let topPost: TopPost | null = null;
      if (postList.length > 0) {
        const sorted = [...postList].sort((a, b) => {
          const scoreA = (a.likes_count || 0) + (a.comments_count || 0) + (a.views_count || 0);
          const scoreB = (b.likes_count || 0) + (b.comments_count || 0) + (b.views_count || 0);
          return scoreB - scoreA;
        });
        topPost = sorted[0];
      }

      const recentPosts: PostStat[] = postList.slice(0, 5).map(p => ({
        id: p.id, caption: p.caption || '',
        likes_count: p.likes_count || 0, comments_count: p.comments_count || 0,
        views_count: p.views_count || 0, created_at: p.created_at,
      }));

      const weeklyFollowers: WeeklyPoint[] = [];
      for (let i = 5; i >= 0; i--) {
        const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
        const weekEnd   = new Date(); weekEnd.setDate(weekEnd.getDate() - i * 7);
        const { count } = await supabase.from('follows').select('id', { count: 'exact', head: true })
          .eq('following_id', user.id).gte('created_at', weekStart.toISOString()).lte('created_at', weekEnd.toISOString());
        weeklyFollowers.push({ label: `W${6 - i}`, followers: count || 0 });
      }

      setData({ totalViews, totalLikes: realLikes, totalComments: realComments, totalShares, totalPosts, followersCount, followingCount, engagementRate, avgViewsPerPost, avgLikesPerPost, growthRate, topPost, recentPosts, weeklyFollowers });
    } catch (error) {
      console.error('Error loading analytics:', error);
      Alert.alert(t.errors.generic, t.errors.loadFailed);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => { setRefreshing(true); await loadAnalytics(); };
  const maxFollowers = Math.max(...data.weeklyFollowers.map(w => w.followers), 1);

  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color="#00ff88" />
        <Text style={s.loadingText}>{t.common.loading}</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Advanced Analytics</Text>
        <TouchableOpacity onPress={onRefresh}>
          <Feather name="refresh-cw" size={22} color="#00ff88" />
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00ff88" />}>

        <Text style={s.sectionHeader}>📊 Performance Overview</Text>
        <View style={s.statsGrid}>
          <View style={s.statCard}>
            <Feather name="eye" size={24} color="#00b4d8" />
            <Text style={s.statValue}>{data.totalViews.toLocaleString()}</Text>
            <Text style={s.statLabel}>{t.common.views}</Text>
          </View>
          <View style={s.statCard}>
            <Feather name="heart" size={24} color="#ff4d8f" />
            <Text style={s.statValue}>{data.totalLikes.toLocaleString()}</Text>
            <Text style={s.statLabel}>{t.common.likes}</Text>
          </View>
          <View style={s.statCard}>
            <Feather name="message-circle" size={24} color="#00b4d8" />
            <Text style={s.statValue}>{data.totalComments.toLocaleString()}</Text>
            <Text style={s.statLabel}>{t.common.comments}</Text>
          </View>
          <View style={s.statCard}>
            <Feather name="share-2" size={24} color="#ffa500" />
            <Text style={s.statValue}>{data.totalShares.toLocaleString()}</Text>
            <Text style={s.statLabel}>{t.common.share}</Text>
          </View>
          <View style={s.statCard}>
            <Feather name="users" size={24} color="#00ff88" />
            <Text style={s.statValue}>{data.followersCount.toLocaleString()}</Text>
            <Text style={s.statLabel}>{t.common.followers}</Text>
          </View>
          <View style={s.statCard}>
            <Feather name="image" size={24} color="#9d4edd" />
            <Text style={s.statValue}>{data.totalPosts}</Text>
            <Text style={s.statLabel}>{t.common.posts}</Text>
          </View>
        </View>

        <Text style={s.sectionHeader}>📈 Insights</Text>

        <View style={s.insightCard}>
          <View style={s.insightRow}><Feather name="trending-up" size={20} color="#00ff88" /><Text style={s.insightTitle}>Engagement Rate</Text></View>
          <Text style={s.insightBigValue}>{data.engagementRate}%</Text>
          <Text style={s.insightDesc}>Percentage of viewers who liked, commented, or shared</Text>
          <View style={s.progressBar}><View style={[s.progressFill, { width: `${Math.min(data.engagementRate * 5, 100)}%` as any }]} /></View>
        </View>

        <View style={s.insightCard}>
          <View style={s.insightRow}><Feather name="bar-chart" size={20} color="#00ff88" /><Text style={s.insightTitle}>Avg Views Per Post</Text></View>
          <Text style={s.insightBigValue}>{data.avgViewsPerPost}</Text>
          <Text style={s.insightDesc}>Average views across all your posts</Text>
        </View>

        <View style={s.insightCard}>
          <View style={s.insightRow}><Feather name="heart" size={20} color="#ff4d8f" /><Text style={s.insightTitle}>Avg Likes Per Post</Text></View>
          <Text style={[s.insightBigValue, { color: '#ff4d8f' }]}>{data.avgLikesPerPost}</Text>
          <Text style={s.insightDesc}>Average likes across all your posts</Text>
        </View>

        <View style={s.insightCard}>
          <View style={s.insightRow}><Feather name="user-plus" size={20} color="#00ff88" /><Text style={s.insightTitle}>Growth Rate</Text></View>
          <Text style={s.insightBigValue}>+{data.growthRate} / week</Text>
          <Text style={s.insightDesc}>Average new followers per week since joining</Text>
        </View>

        {data.weeklyFollowers.length > 0 && (
          <>
            <Text style={s.sectionHeader}>📅 Weekly Follower Growth</Text>
            <View style={s.chartCard}>
              <View style={s.barChart}>
                {data.weeklyFollowers.map((week, idx) => {
                  const heightPct = maxFollowers > 0 ? (week.followers / maxFollowers) * 100 : 0;
                  return (
                    <View key={idx} style={s.barCol}>
                      <Text style={s.barValue}>{week.followers}</Text>
                      <View style={s.barTrack}><View style={[s.barFill, { height: `${Math.max(heightPct, 2)}%` as any }]} /></View>
                      <Text style={s.barLabel}>{week.label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </>
        )}

        {data.topPost && (
          <>
            <Text style={s.sectionHeader}>🏆 Top Performing Post</Text>
            <TouchableOpacity style={s.topPostCard} onPress={() => router.push(`/post/${data.topPost!.id}`)}>
              <Text style={s.topPostCaption} numberOfLines={2}>{data.topPost.caption || '(No caption)'}</Text>
              <Text style={s.topPostDate}>{new Date(data.topPost.created_at).toLocaleDateString()}</Text>
              <View style={s.topPostStats}>
                <View style={s.topPostStat}><Feather name="eye" size={14} color="#00b4d8" /><Text style={s.topPostStatText}>{data.topPost.views_count || 0} {t.common.views.toLowerCase()}</Text></View>
                <View style={s.topPostStat}><Feather name="heart" size={14} color="#ff4d8f" /><Text style={s.topPostStatText}>{data.topPost.likes_count || 0} {t.common.likes.toLowerCase()}</Text></View>
                <View style={s.topPostStat}><Feather name="message-circle" size={14} color="#00ff88" /><Text style={s.topPostStatText}>{data.topPost.comments_count || 0} {t.common.comments.toLowerCase()}</Text></View>
              </View>
              <View style={s.viewPostBtn}><Text style={s.viewPostBtnText}>View Post →</Text></View>
            </TouchableOpacity>
          </>
        )}

        {data.recentPosts.length > 0 && (
          <>
            <Text style={s.sectionHeader}>📝 Recent Posts Breakdown</Text>
            {data.recentPosts.map((post, idx) => (
              <TouchableOpacity key={post.id} style={s.postBreakdownCard} onPress={() => router.push(`/post/${post.id}`)}>
                <View style={s.postBreakdownHeader}>
                  <Text style={s.postBreakdownNum}>#{idx + 1}</Text>
                  <Text style={s.postBreakdownCaption} numberOfLines={1}>{post.caption || '(No caption)'}</Text>
                  <Text style={s.postBreakdownDate}>{new Date(post.created_at).toLocaleDateString()}</Text>
                </View>
                <View style={s.postBreakdownStats}>
                  <View style={s.postMiniStat}><Feather name="eye" size={12} color="#00b4d8" /><Text style={s.postMiniStatText}>{post.views_count}</Text></View>
                  <View style={s.postMiniStat}><Feather name="heart" size={12} color="#ff4d8f" /><Text style={s.postMiniStatText}>{post.likes_count}</Text></View>
                  <View style={s.postMiniStat}><Feather name="message-circle" size={12} color="#00ff88" /><Text style={s.postMiniStatText}>{post.comments_count}</Text></View>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        <Text style={s.sectionHeader}>👤 Account Summary</Text>
        <View style={s.summaryCard}>
          <View style={s.summaryRow}><Text style={s.summaryLabel}>{t.common.posts}</Text><Text style={s.summaryValue}>{data.totalPosts}</Text></View>
          <View style={s.dividerLine} />
          <View style={s.summaryRow}><Text style={s.summaryLabel}>{t.common.followers}</Text><Text style={s.summaryValue}>{data.followersCount.toLocaleString()}</Text></View>
          <View style={s.dividerLine} />
          <View style={s.summaryRow}><Text style={s.summaryLabel}>{t.common.following}</Text><Text style={s.summaryValue}>{data.followingCount.toLocaleString()}</Text></View>
          <View style={s.dividerLine} />
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Follower Ratio</Text>
            <Text style={s.summaryValue}>{data.followingCount > 0 ? (data.followersCount / data.followingCount).toFixed(2) : data.followersCount > 0 ? '∞' : '0'}</Text>
          </View>
          <View style={s.dividerLine} />
          <View style={s.summaryRow}><Text style={s.summaryLabel}>Total Engagement</Text><Text style={s.summaryValue}>{(data.totalLikes + data.totalComments + data.totalShares).toLocaleString()}</Text></View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:            { flex: 1, backgroundColor: '#000' },
  loadingContainer:     { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  loadingText:          { color: '#999', marginTop: 12, fontSize: 14 },
  header:               { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 15, backgroundColor: '#000', borderBottomWidth: 1, borderBottomColor: '#222' },
  headerTitle:          { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  scroll:               { flex: 1, padding: 16 },
  sectionHeader:        { color: '#fff', fontSize: 16, fontWeight: 'bold', marginTop: 20, marginBottom: 12 },
  statsGrid:            { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard:             { width: '47%', backgroundColor: '#111', borderRadius: 12, padding: 16, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#222' },
  statValue:            { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  statLabel:            { color: '#999', fontSize: 12, textAlign: 'center' },
  insightCard:          { backgroundColor: '#111', borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#222' },
  insightRow:           { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  insightTitle:         { color: '#fff', fontSize: 14, fontWeight: '600' },
  insightBigValue:      { color: '#00ff88', fontSize: 28, fontWeight: 'bold', marginBottom: 4 },
  insightDesc:          { color: '#666', fontSize: 12, lineHeight: 18 },
  progressBar:          { height: 6, backgroundColor: '#222', borderRadius: 3, marginTop: 12, overflow: 'hidden' },
  progressFill:         { height: '100%', backgroundColor: '#00ff88', borderRadius: 3 },
  chartCard:            { backgroundColor: '#111', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#222' },
  barChart:             { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120 },
  barCol:               { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  barValue:             { color: '#999', fontSize: 9, textAlign: 'center' },
  barTrack:             { width: 28, height: 90, backgroundColor: '#222', borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill:              { width: '100%', backgroundColor: '#00ff88', borderRadius: 4 },
  barLabel:             { color: '#666', fontSize: 10, textAlign: 'center' },
  topPostCard:          { backgroundColor: '#111', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#00ff88' + '44' },
  topPostCaption:       { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  topPostDate:          { color: '#666', fontSize: 11, marginBottom: 12 },
  topPostStats:         { flexDirection: 'row', gap: 16 },
  topPostStat:          { flexDirection: 'row', alignItems: 'center', gap: 5 },
  topPostStatText:      { color: '#ccc', fontSize: 13 },
  viewPostBtn:          { marginTop: 12, backgroundColor: '#00ff88' + '22', padding: 8, borderRadius: 8, alignItems: 'center' },
  viewPostBtnText:      { color: '#00ff88', fontSize: 13, fontWeight: '600' },
  postBreakdownCard:    { backgroundColor: '#111', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#222' },
  postBreakdownHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  postBreakdownNum:     { color: '#00ff88', fontSize: 13, fontWeight: 'bold', width: 24 },
  postBreakdownCaption: { flex: 1, color: '#fff', fontSize: 13 },
  postBreakdownDate:    { color: '#555', fontSize: 11 },
  postBreakdownStats:   { flexDirection: 'row', gap: 16 },
  postMiniStat:         { flexDirection: 'row', alignItems: 'center', gap: 4 },
  postMiniStatText:     { color: '#999', fontSize: 12 },
  summaryCard:          { backgroundColor: '#111', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#222' },
  summaryRow:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  summaryLabel:         { color: '#999', fontSize: 14 },
  summaryValue:         { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  dividerLine:          { height: 1, backgroundColor: '#222' },
}); 
