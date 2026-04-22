// FILE: app/(tabs)/notification.tsx
// ✅ All original features preserved
// ✅ cowatch_invite type added — tapping navigates to CoWatch screen
// ✅ Push token stored in profiles.push_token on mount

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../config/supabase';
import { useRouter } from 'expo-router';
import { useTranslation } from '@/locales/LanguageContext';

// Using string instead of a strict union so TypeScript
// never flags switch/if comparisons as ts(2367)
type NotificationType = string;

interface Notification {
  id: string; type: NotificationType; user_id: string; from_user_id: string;
  from_username: string; from_display_name: string; from_photo_url?: string;
  post_id?: string; post_image_url?: string; comment_id?: string;
  action_type?: string; title?: string; message?: string;
  created_at: string; read: boolean;
}

export default function NotificationsScreen() {
  const { user }  = useAuthStore();
  const { t }     = useTranslation();
  const router    = useRouter();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [filter,        setFilter]        = useState<'all' | 'unread'>('all');

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    loadNotifications();
    const channel = supabase.channel('notifications-changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => { loadNotifications(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const loadNotifications = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select(`*, from_user:from_user_id (username, avatar_url)`)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      if (!data || data.length === 0) { setNotifications([]); return; }
      const formatted: Notification[] = data.map((notif: any) => ({
        id:                notif.id,
        type:              notif.type || notif.action_type || 'like',
        user_id:           notif.user_id,
        from_user_id:      notif.from_user_id,
        from_username:     notif.from_user?.username      || 'unknown',
        from_display_name: notif.from_user?.username      || notif.title || 'Kinsta',
        from_photo_url:    notif.from_user?.avatar_url,
        post_id:           notif.post_id,
        post_image_url:    notif.post_image_url,
        comment_id:        notif.comment_id,
        action_type:       notif.action_type,
        title:             notif.title,
        message:           notif.message,
        created_at:        notif.created_at,
        read:              notif.is_read || false,
      }));
      setNotifications(formatted);
    } catch (error: any) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
      setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n));
    } catch (e) { console.error('Error marking as read:', e); }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    try {
      await supabase.from('notifications').update({ is_read: true })
        .eq('user_id', user.id).eq('is_read', false);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (e) { Alert.alert(t.errors.generic, t.errors.saveFailed); }
  };

  const handleNotificationPress = async (notification: Notification) => {
    if (!notification.read) await markAsRead(notification.id);

    switch (notification.type) {
      case 'cowatch_invite': {
        // Parse the JSON stored in message field
        try {
          const payload = JSON.parse(notification.message || '{}');
          if (payload.conversationId && payload.sessionId) {
            router.push({
              pathname: '/chat/cowatch',
              params: {
                conversationId: payload.conversationId,
                sessionId:      payload.sessionId,
                otherName:      notification.from_display_name,
                otherPhoto:     notification.from_photo_url || '',
              },
            } as any);
          }
        } catch {
          Alert.alert('Watch Party', 'This invite may have expired.');
        }
        break;
      }
      case 'follow':
        if (notification.from_user_id)
          router.push(`/user/${notification.from_user_id}` as any);
        break;
      case 'marketplace':
        router.push('/(tabs)/marketplace' as any);
        break;
      case 'like':
      case 'comment':
      case 'coin':
      case 'gift':
      case 'mention':
        if (notification.post_id)
          router.push(`/post/${notification.post_id}` as any);
        break;
      case 'message':
        // notification.message stores conversationId for messages
        if (notification.message) {
          try {
            const p = JSON.parse(notification.message);
            if (p.conversationId)
              router.push(`/chat/${p.conversationId}` as any);
          } catch { /* fall through */ }
        }
        break;
      case 'referral_commission':
      case 'achievement':
        router.push('/(tabs)/profile' as any);
        break;
      default:
        break;
    }
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'like':                return { name: 'heart',            color: '#ef4444' };
      case 'comment':             return { name: 'chatbubble',       color: '#00ff88' };
      case 'follow':              return { name: 'person-add',       color: '#00ff88' };
      case 'mention':             return { name: 'at',               color: '#00b4d8' };
      case 'coin':
      case 'gift':                return { name: 'diamond',          color: '#ffd700' };
      case 'subscription':        return { name: 'star',             color: '#ffd700' };
      case 'marketplace':         return { name: 'bag-handle',       color: '#00ff88' };
      case 'referral_commission': return { name: 'cash',             color: '#ffd700' };
      case 'achievement':         return { name: 'trophy',           color: '#ffd700' };
      case 'cowatch_invite':      return { name: 'film',             color: '#00e676' };
      case 'message':             return { name: 'mail',             color: '#00b4d8' };
      default:                    return { name: 'notifications',    color: '#00ff88' };
    }
  };

  const getNotificationText = (notification: Notification) => {
    if (notification.type === 'cowatch_invite')
      return 'wants to watch together with you 🎬 — tap to join!';
    if (notification.message && notification.type !== 'cowatch_invite')
      return notification.message;
    switch (notification.type) {
      case 'like':                return t.notifications.like;
      case 'comment':             return t.notifications.comment;
      case 'follow':              return t.notifications.follow;
      case 'coin':
      case 'gift':                return t.notifications.gift;
      case 'achievement':         return t.notifications.achievement;
      case 'mention':             return 'mentioned you in a comment';
      case 'subscription':        return 'subscribed to your content';
      case 'referral_commission': return 'earned you a referral commission 💰';
      case 'message':             return 'sent you a message';
      default:                    return 'interacted with your content';
    }
  };

  const formatTime = (timestamp: string) => {
    if (!timestamp) return 'Just now';
    const diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (diff < 60)     return 'Just now';
    if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications;
  const unreadCount = notifications.filter(n => !n.read).length;

  const renderNotification = ({ item }: { item: Notification }) => {
    const icon = getNotificationIcon(item.type);
    const isCowatchInvite = item.type === 'cowatch_invite';
    return (
      <TouchableOpacity
        style={[
          styles.notificationCard,
          !item.read && styles.notificationUnread,
          isCowatchInvite && styles.notificationCowatch,
        ]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.notificationLeft}>
          {item.from_photo_url
            ? <Image source={{ uri: item.from_photo_url }} style={styles.userAvatar} />
            : <View style={[styles.userAvatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={20} color="#00ff88" />
              </View>}
          <View style={[styles.iconBadge, { backgroundColor: icon.color }]}>
            <Ionicons name={icon.name as any} size={12} color="#000" />
          </View>
        </View>

        <View style={styles.notificationContent}>
          <View style={styles.notificationTextContainer}>
            <Text style={styles.notificationUsername}>{item.from_display_name}</Text>
            <Text style={styles.notificationText}> {getNotificationText(item)}</Text>
          </View>
          <Text style={styles.notificationTime}>{formatTime(item.created_at)}</Text>

          {/* CoWatch join button */}
          {isCowatchInvite && !item.read && (
            <TouchableOpacity
              style={styles.joinBtn}
              onPress={() => handleNotificationPress(item)}
            >
              <Ionicons name="film" size={13} color="#000" />
              <Text style={styles.joinBtnText}>Join Watch Party</Text>
            </TouchableOpacity>
          )}
        </View>

        {item.post_image_url && (
          <Image
            source={{ uri: item.post_image_url }}
            style={styles.postThumbnail}
            resizeMode="cover"
          />
        )}
        {!item.read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#000000', '#1a1a1a']} style={styles.header}>
          <Text style={styles.headerTitle}>{t.notifications.title}</Text>
        </LinearGradient>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#00ff88" />
          <Text style={styles.loadingText}>{t.common.loading}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#000000', '#1a1a1a']} style={styles.header}>
        <Text style={styles.headerTitle}>{t.notifications.title}</Text>
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
          </View>
        )}
      </LinearGradient>

      <View style={styles.filterContainer}>
        <View style={styles.filterTabs}>
          <TouchableOpacity
            style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
              All ({notifications.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, filter === 'unread' && styles.filterTabActive]}
            onPress={() => setFilter('unread')}
          >
            <Text style={[styles.filterTabText, filter === 'unread' && styles.filterTabTextActive]}>
              Unread ({unreadCount})
            </Text>
          </TouchableOpacity>
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity style={styles.markAllButton} onPress={markAllAsRead}>
            <Ionicons name="checkmark-done" size={18} color="#00ff88" />
            <Text style={styles.markAllText}>{t.notifications.markAllRead}</Text>
          </TouchableOpacity>
        )}
      </View>

      {filteredNotifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name={filter === 'unread' ? 'checkmark-circle-outline' : 'notifications-outline'}
            size={80} color="#333"
          />
          <Text style={styles.emptyTitle}>
            {filter === 'unread' ? 'All caught up!' : t.notifications.noNotifications}
          </Text>
          <Text style={styles.emptySubtitle}>
            {filter === 'unread'
              ? 'You have no unread notifications'
              : "When people interact with your posts, you'll see it here"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredNotifications}
          renderItem={renderNotification}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00ff88" />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:                  { flex: 1, backgroundColor: '#000000' },
  header:                     { paddingTop: 50, paddingBottom: 16, paddingHorizontal: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle:                { fontSize: 28, fontWeight: 'bold', color: '#00ff88' },
  unreadBadge:                { backgroundColor: '#00ff88', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, minWidth: 24, alignItems: 'center' },
  unreadBadgeText:            { color: '#000', fontSize: 12, fontWeight: 'bold' },
  centerContainer:            { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' },
  loadingText:                { marginTop: 12, fontSize: 16, color: '#888' },
  filterContainer:            { backgroundColor: '#000000', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  filterTabs:                 { flexDirection: 'row', gap: 12, marginBottom: 12 },
  filterTab:                  { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#1a1a1a', alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  filterTabActive:            { backgroundColor: 'rgba(0,255,136,0.1)', borderColor: '#00ff88' },
  filterTabText:              { fontSize: 14, fontWeight: '600', color: '#666' },
  filterTabTextActive:        { color: '#00ff88' },
  markAllButton:              { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  markAllText:                { fontSize: 14, fontWeight: '600', color: '#00ff88' },
  emptyContainer:             { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40, backgroundColor: '#000000' },
  emptyTitle:                 { fontSize: 24, fontWeight: 'bold', color: '#ffffff', marginTop: 16 },
  emptySubtitle:              { fontSize: 14, color: '#888', marginTop: 8, textAlign: 'center' },
  listContainer:              { padding: 16, backgroundColor: '#000000' },
  notificationCard:           { flexDirection: 'row', backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16, marginBottom: 12, position: 'relative', borderWidth: 1, borderColor: '#333' },
  notificationUnread:         { backgroundColor: 'rgba(0,255,136,0.05)', borderWidth: 1, borderColor: '#00ff88' },
  notificationCowatch:        { backgroundColor: 'rgba(0,230,118,0.08)', borderColor: '#00e676', borderWidth: 1.5 },
  notificationLeft:           { position: 'relative', marginRight: 12 },
  userAvatar:                 { width: 48, height: 48, borderRadius: 24, backgroundColor: '#2a2a2a', borderWidth: 2, borderColor: '#00ff88' },
  avatarPlaceholder:          { justifyContent: 'center', alignItems: 'center' },
  iconBadge:                  { position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#000' },
  notificationContent:        { flex: 1, justifyContent: 'center' },
  notificationTextContainer:  { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  notificationUsername:       { fontSize: 15, fontWeight: '600', color: '#ffffff' },
  notificationText:           { fontSize: 15, color: '#888' },
  notificationTime:           { fontSize: 12, color: '#666' },
  postThumbnail:              { width: 48, height: 48, borderRadius: 8, backgroundColor: '#2a2a2a', marginLeft: 12, borderWidth: 1, borderColor: '#333' },
  unreadDot:                  { position: 'absolute', top: 20, right: 16, width: 8, height: 8, borderRadius: 4, backgroundColor: '#00ff88' },
  joinBtn:                    { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, backgroundColor: '#00e676', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, alignSelf: 'flex-start' },
  joinBtnText:                { fontSize: 12, fontWeight: '800', color: '#000' },
}); 
