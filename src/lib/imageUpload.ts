import { supabase, BUCKET_NAME } from './supabaseClient';

function generateFileName(ext: string): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;
}

function getExtension(file: File): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/bmp': 'bmp',
    'image/webp': 'webp',
  };
  return map[file.type] ?? 'jpg';
}

export async function uploadArticleImage(file: File): Promise<string | null> {
  if (!supabase) return null;
  const fileName = generateFileName(getExtension(file));
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, file, { contentType: file.type || 'image/jpeg' });
  if (error) return null;
  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);
  return data?.publicUrl ?? null;
}
