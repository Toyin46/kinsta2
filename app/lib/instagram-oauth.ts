//lib/instagram-oauth.ts (COMPLETE FILE)
import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';
import { supabase } from '@/config/supabase';

const INSTAGRAM_APP_ID = '1628784628257720';
const REDIRECT_URI = 'kinsta://oauth/instagram';

export async function connectInstagram(userId: string) {
  try {
    const authUrl = `https://api.instagram.com/oauth/authorize?` +
      `client_id=${INSTAGRAM_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&scope=user_profile,user_media` +
      `&response_type=code`;

    const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);

    if (result.type === 'success') {
      const code = new URL(result.url).searchParams.get('code');

      if (code) {
        const success = await exchangeInstagramToken(code, userId);
        if (success) {
          Alert.alert('Success!', 'Instagram connected! 📸');
          return { success: true };
        }
      }
    }

    return { success: false };
  } catch (error) {
    console.error('Instagram OAuth error:', error);
    return { success: false, error };
  }
}

export async function exchangeInstagramToken(code: string, userId: string) {
  try {
    const response = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: INSTAGRAM_APP_ID,
        client_secret: '522910043a510ba2d0389a8c05b41dbd',
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
        code: code,
      }),
    });

    const data = await response.json();

    if (data.access_token) {
      const longLivedResponse = await fetch(
        `https://graph.instagram.com/access_token?` +
        `grant_type=ig_exchange_token` +
        `&client_secret=522910043a510ba2d0389a8c05b41dbd` +
        `&access_token=${data.access_token}`
      );

      const longLivedData = await longLivedResponse.json();

      const userResponse = await fetch(
        `https://graph.instagram.com/me?fields=id,username&access_token=${longLivedData.access_token}`
      );

      const userInfo = await userResponse.json();

      await supabase
        .from('users')
        .update({
          instagram_connected: true,
          instagram_username: userInfo.username,
          instagram_access_token: longLivedData.access_token,
          instagram_token_expires: new Date(Date.now() + longLivedData.expires_in * 1000).toISOString(),
        })
        .eq('id', userId);

      return true;
    }

    return false;
  } catch (error) {
    console.error('Instagram token exchange error:', error);
    return false;
  }
}

export async function uploadToInstagram(
  userId: string,
  mediaUri: string,
  caption: string,
  isVideo: boolean
) {
  try {
    const { data: userData } = await supabase
      .from('users')
      .select('instagram_access_token, instagram_user_id')
      .eq('id', userId)
      .single();

    if (!userData?.instagram_access_token) {
      return { success: false, error: 'Instagram not connected' };
    }

    // Note: Instagram requires a publicly accessible URL
    // You'll need to upload to Supabase storage first
    const publicUrl = await uploadMediaToPublicStorage(mediaUri);

    const containerResponse = await fetch(
      `https://graph.facebook.com/v18.0/${userData.instagram_user_id}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [isVideo ? 'video_url' : 'image_url']: publicUrl,
          caption: caption,
          access_token: userData.instagram_access_token,
        }),
      }
    );

    const containerData = await containerResponse.json();

    const publishResponse = await fetch(
      `https://graph.facebook.com/v18.0/${userData.instagram_user_id}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creation_id: containerData.id,
          access_token: userData.instagram_access_token,
        }),
      }
    );

    const publishData = await publishResponse.json();

    return { 
      success: true, 
      mediaId: publishData.id 
    };
  } catch (error) {
    console.error('Instagram upload error:', error);
    return { success: false, error };
  }
}

async function uploadMediaToPublicStorage(mediaUri: string): Promise<string> {
  // Upload to Supabase storage and return public URL
  const response = await fetch(mediaUri);
  const blob = await response.blob();
  const fileName = `temp/${Date.now()}.${blob.type.split('/')[1]}`;
  
  const { data, error } = await supabase.storage
    .from('posts')
    .upload(fileName, blob, { contentType: blob.type });

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from('posts')
    .getPublicUrl(fileName);

  return publicUrl;
}