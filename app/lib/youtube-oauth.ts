import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';
import { supabase } from '@/config/supabase';
import * as SecureStore from 'expo-secure-store';

// YouTube OAuth Configuration
const YOUTUBE_CLIENT_ID = process.env.EXPO_PUBLIC_YOUTUBE_CLIENT_ID || '';
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET || '';
const REDIRECT_URI = 'https://your-app.com/auth/youtube/callback'; // Update this

// YouTube OAuth URLs
const YOUTUBE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const YOUTUBE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Scopes needed for YouTube video upload
const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
].join(' ');

// Initialize WebBrowser
WebBrowser.maybeCompleteAuthSession();

export async function connectYouTube(userId: string) {
  try {
    // Generate state for CSRF protection
    const state = Math.random().toString(36).substring(7);
    await SecureStore.setItemAsync('youtube_oauth_state', state);

    // Build authorization URL
    const authUrl = `${YOUTUBE_AUTH_URL}?${new URLSearchParams({
      client_id: YOUTUBE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: YOUTUBE_SCOPES,
      state,
      access_type: 'offline',
      prompt: 'consent',
    })}`;

    // Open OAuth flow
    const result = await WebBrowser.openAuthSessionAsync(
      authUrl,
      REDIRECT_URI
    );

    if (result.type === 'success') {
      const url = new URL(result.url);
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');

      // Verify state
      const savedState = await SecureStore.getItemAsync('youtube_oauth_state');
      if (returnedState !== savedState) {
        throw new Error('State mismatch - possible CSRF attack');
      }

      if (code) {
        // Exchange code for tokens
        const tokens = await exchangeCodeForTokens(code);
        
        // Get channel info
        const channelInfo = await getChannelInfo(tokens.access_token);

        // Save to database
        const { error } = await supabase
          .from('users')
          .update({
            youtube_connected: true,
            youtube_channel: channelInfo.title,
            youtube_access_token: tokens.access_token,
            youtube_refresh_token: tokens.refresh_token,
            youtube_token_expires: new Date(
              Date.now() + tokens.expires_in * 1000
            ).toISOString(),
          })
          .eq('id', userId);

        if (error) throw error;

        Alert.alert('Success', 'YouTube account connected successfully!');
        return { success: true };
      }
    }

    return { success: false, error: 'OAuth flow cancelled' };
  } catch (error) {
    console.error('YouTube OAuth error:', error);
    Alert.alert('Error', 'Failed to connect YouTube account');
    return { success: false, error };
  }
}

async function exchangeCodeForTokens(code: string) {
  const response = await fetch(YOUTUBE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: YOUTUBE_CLIENT_ID,
      client_secret: YOUTUBE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }).toString(),
  });

  if (!response.ok) {
    throw new Error('Failed to exchange code for tokens');
  }

  return response.json();
}

async function getChannelInfo(accessToken: string) {
  const response = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to get channel info');
  }

  const data = await response.json();
  return {
    title: data.items[0]?.snippet?.title || 'Unknown Channel',
    id: data.items[0]?.id || '',
  };
}

export async function disconnectYouTube(userId: string) {
  try {
    const { error } = await supabase
      .from('users')
      .update({
        youtube_connected: false,
        youtube_channel: null,
        youtube_access_token: null,
        youtube_refresh_token: null,
        youtube_token_expires: null,
      })
      .eq('id', userId);

    if (error) throw error;

    Alert.alert('Success', 'YouTube account disconnected');
    return { success: true };
  } catch (error) {
    console.error('YouTube disconnect error:', error);
    Alert.alert('Error', 'Failed to disconnect YouTube account');
    return { success: false, error };
  }
}

export async function refreshYouTubeToken(refreshToken: string) {
  try {
    const response = await fetch(YOUTUBE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: YOUTUBE_CLIENT_ID,
        client_secret: YOUTUBE_CLIENT_SECRET,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    const data = await response.json();
    return {
      access_token: data.access_token,
      expires_in: data.expires_in,
    };
  } catch (error) {
    console.error('Token refresh error:', error);
    throw error;
  }
}

export async function uploadToYouTube(
  accessToken: string,
  videoUri: string,
  title: string,
  description: string
) {
  try {
    // Step 1: Initialize upload
    const metadata = {
      snippet: {
        title,
        description,
        categoryId: '22', // People & Blogs
      },
      status: {
        privacyStatus: 'public',
      },
    };

    const initResponse = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metadata),
      }
    );

    const uploadUrl = initResponse.headers.get('Location');
    if (!uploadUrl) {
      throw new Error('Failed to get upload URL');
    }

    // Step 2: Upload video file
    const videoBlob = await fetch(videoUri).then((r) => r.blob());

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/*',
      },
      body: videoBlob,
    });

    const uploadData = await uploadResponse.json();

    return {
      success: true,
      videoId: uploadData.id,
      videoUrl: `https://youtube.com/watch?v=${uploadData.id}`,
    };
  } catch (error) {
    console.error('YouTube upload error:', error);
    return { success: false, error };
  }
}