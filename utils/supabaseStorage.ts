import { supabase } from '../config/supabase';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

export interface UploadResult {
  url: string;
  path: string;
}

/**
 * Upload image or video to Supabase Storage
 */
export async function uploadToSupabase(
  uri: string,
  type: 'image' | 'video',
  userId: string
): Promise<UploadResult> {
  try {
    // Read file as base64
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Generate unique filename
    const fileExt = uri.split('.').pop() || (type === 'image' ? 'jpg' : 'mp4');
    const fileName = `${userId}/${Date.now()}.${fileExt}`;
    const bucket = 'posts-media';

    // Convert base64 to array buffer
    const arrayBuffer = decode(base64);

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, arrayBuffer, {
        contentType: type === 'image' ? 'image/jpeg' : 'video/mp4',
        upsert: false,
      });

    if (error) throw error;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return {
      url: publicUrl,
      path: fileName,
    };
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
}

/**
 * Upload profile photo to Supabase Storage
 */
export async function uploadProfilePhoto(
  uri: string,
  userId: string
): Promise<UploadResult> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const fileExt = uri.split('.').pop() || 'jpg';
    const fileName = `${userId}/avatar.${fileExt}`;
    const bucket = 'profile-photos';

    const arrayBuffer = decode(base64);

    // Delete old photo if exists
    await supabase.storage
      .from(bucket)
      .remove([fileName]);

    // Upload new photo
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fileName, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(fileName);

    return {
      url: publicUrl,
      path: fileName,
    };
  } catch (error) {
    console.error('Upload profile photo error:', error);
    throw error;
  }
}

/**
 * Delete file from Supabase Storage
 */
export async function deleteFromSupabase(
  path: string,
  bucket: 'posts-media' | 'profile-photos'
): Promise<void> {
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([path]);

    if (error) throw error;
  } catch (error) {
    console.error('Delete error:', error);
    throw error;
  }
}