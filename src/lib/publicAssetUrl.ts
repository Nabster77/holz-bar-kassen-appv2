// Product image paths such as "/bier.webp" live in Vite's public folder.
// Convert only those local paths to the configured app base. Remote URLs and
// data URLs must stay untouched.
export function publicAssetUrl(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//')) return value;
  return `${import.meta.env.BASE_URL}${value.slice(1)}`;
}
