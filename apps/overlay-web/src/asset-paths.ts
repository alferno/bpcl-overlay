export function withBaseUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  
  const base = import.meta.env.BASE_URL || "/";
  if (url.startsWith(base)) return url;
  
  if (url.startsWith("/")) {
    return `${base}${url.slice(1)}`;
  }
  return `${base}${url}`;
}
