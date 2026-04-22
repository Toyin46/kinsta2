// utils/youtubeUtils.ts - COMPLETE WITH UPLOAD FUNCTION
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../config/supabase';

WebBrowser.maybeCompleteAuthSession();

const YOUTUBE_CLIENT_ID = '676153682725-5ld28add92e7uesmt229e0k43umb4vh5';
const YOUTUBE_CLIENT_SECRET = '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';
const REDIRECT_URI = 'https://auth.expo.io/@toyin/kinsta';

/**
* Authenticate user with YouTube
*/
export const authenticateYouTube = async (userId: string): Promise<{ success: boolean; message?: string }> => {
  try {
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${YOUTUBE_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=https://www.googleapis.com/auth/youtube.upload&access_type=offline&prompt=consent`;

    const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);

    if (result.type === 'success' && result.url) {
      const code = new URL(result.url).searchParams.get('code');
    
      if (!code) {
        throw new Error('No authorization code received');
      }

      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          client_id: YOUTUBE_CLIENT_ID,
          client_secret: YOUTUBE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenResponse.json();

      if (!tokens.access_token) {
        throw new Error('Failed to get access token');
      }

      // Get YouTube channel info
      const channelResponse = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }
      );

      const channelData = await channelResponse.json();
      const channelTitle = channelData.items?.[0]?.snippet?.title || 'Unknown';

      // Save tokens to database
      await supabase.from('users').update({
        youtube_connected: true,
        youtube_access_token: tokens.access_token,
        youtube_refresh_token: tokens.refresh_token,
        youtube_channel_name: channelTitle,
      }).eq('id', userId);

      return { success: true };
    }

    return { success: false, message: 'Authentication cancelled' };
  } catch (error: any) {
    console.error('YouTube auth error:', error);
    return { success: false, message: error.message || 'Authentication failed' };
  }
};

/**
* Disconnect YouTube account
*/
export const disconnectYouTube = async (userId: string): Promise<boolean> => {
  try {
    await supabase.from('users').update({
      youtube_connected: false,
      youtube_access_token: null,
      youtube_refresh_token: null,
      youtube_channel_name: null,
    }).eq('id', userId);

    return true;
  } catch (error) {
    console.error('YouTube disconnect error:', error);
    return false;
  }
};

/**
* Refresh YouTube access token using refresh token
*/
const refreshYouTubeToken = async (userId: string, refreshToken: string): Promise<string | null> => {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: YOUTUBE_CLIENT_ID,
        client_secret: YOUTUBE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const data = await response.json();

    if (data.access_token) {
      // Update the new access token in database
      await supabase.from('users').update({
        youtube_access_token: data.access_token,
      }).eq('id', userId);

      return data.access_token;
    }

    return null;
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
};

/**
* Upload video to YouTube
* @param userId - User ID from Supabase
* @param videoUrl - Public URL of the video
* @param title - Video title
* @param description - Video description
* @returns Success status and message
*/
export const uploadToYouTube = async (
  userId: string,
  videoUrl: string,
  title: string,
  description?: string
): Promise<{ success: boolean; message: string; videoId?: string }> => {
  try {
    console.log('📹 Starting YouTube upload:', { userId, title });

    // Get user's YouTube tokens from database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('youtube_access_token, youtube_refresh_token, youtube_connected')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      throw new Error('Failed to get user data');
    }

    if (!userData.youtube_connected) {
      return {
        success: false,
        message: 'YouTube not connected. Please connect in settings.',
      };
    }

    let accessToken = userData.youtube_access_token;

    // If no access token, try to refresh
    if (!accessToken && userData.youtube_refresh_token) {
      accessToken = await refreshYouTubeToken(userId, userData.youtube_refresh_token);
      if (!accessToken) {
        return {
          success: false,
          message: 'Failed to refresh YouTube token. Please reconnect.',
        };
      }
    }

    if (!accessToken) {
      return {
        success: false,
        message: 'No valid YouTube token. Please reconnect.',
      };
    }

    // Download the video from Supabase Storage
    console.log('📥 Downloading video from:', videoUrl);
    const videoResponse = await fetch(videoUrl);
   
    if (!videoResponse.ok) {
      throw new Error('Failed to download video');
    }

    const videoBlob = await videoResponse.blob();
    console.log('✅ Video downloaded, size:', (videoBlob.size / 1024 / 1024).toFixed(2), 'MB');

    // Step 1: Initialize the upload session
    const metadata = {
      snippet: {
        title: title || 'Kinsta Video',
        description: description || 'Posted from Kinsta app',
        categoryId: '22', // People & Blogs
        tags: ['kinsta', 'social', 'video'],
      },
      status: {
        privacyStatus: 'public', // Options: 'public', 'private', 'unlisted'
        selfDeclaredMadeForKids: false,
      },
    };

    console.log('🚀 Initializing YouTube upload session...');
    const initResponse = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'video/*',
          'X-Upload-Content-Length': videoBlob.size.toString(),
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!initResponse.ok) {
      const errorText = await initResponse.text();
      console.error('YouTube init error:', errorText);
     
      // If token expired, try to refresh and retry
      if (initResponse.status === 401 && userData.youtube_refresh_token) {
        console.log('🔄 Token expired, refreshing...');
        const newToken = await refreshYouTubeToken(userId, userData.youtube_refresh_token);
        if (newToken) {
          // Retry with new token
          return uploadToYouTube(userId, videoUrl, title, description);
        }
      }
     
      throw new Error(`Failed to initialize upload: ${errorText}`);
    }

    const uploadUrl = initResponse.headers.get('Location');
    if (!uploadUrl) {
      throw new Error('No upload URL received from YouTube');
    }

    console.log('📤 Uploading video to YouTube...');

    // Step 2: Upload the video file
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'video/*',
      },
      body: videoBlob,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Video upload failed: ${errorText}`);
    }

    const result = await uploadResponse.json();
    const videoId = result.id;

    console.log('✅ YouTube upload successful! Video ID:', videoId);

    return {
      success: true,
      message: 'Uploaded to YouTube successfully!',
      videoId: videoId,
    };

  } catch (error: any) {
    console.error('❌ YouTube upload error:', error);
    return {
      success: false,
      message: error.message || 'YouTube upload failed',
    };
  }
};

/**
* Check if user has connected YouTube account
* @param userId - User ID from Supabase
* @returns Boolean indicating if YouTube is connected
*/
export const isYouTubeConnected = async (userId: string): Promise<boolean> => {
  try {
    const { data } = await supabase
      .from('users')
      .select('youtube_connected')
      .eq('id', userId)
      .single();

    return data?.youtube_connected || false;
  } catch (error) {
    console.error('Check YouTube connection error:', error);
    return false;
  }
};

/**
* Get YouTube channel info
* @param userId - User ID from Supabase
* @returns Channel name if connected
*/
export const getYouTubeChannelInfo = async (userId: string): Promise<{ connected: boolean; channelName?: string }> => {
  try {
    const { data } = await supabase
      .from('users')
      .select('youtube_connected, youtube_channel_name')
      .eq('id', userId)
      .single();

    return {
      connected: data?.youtube_connected || false,
      channelName: data?.youtube_channel_name,
    };
  } catch (error) {
    console.error('Get YouTube info error:', error);
    return { connected: false };
  }
}; 
