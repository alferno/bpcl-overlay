export function withBaseUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  if (url.startsWith("/")) {
    return `${import.meta.env.BASE_URL}${url.slice(1)}`;
  }
  return `${import.meta.env.BASE_URL}${url}`;
}
