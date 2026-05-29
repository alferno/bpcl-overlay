const ORIGIN_STORAGE = "bpc_admin_api_origin";
const TOKEN_STORAGE = "bpc_broadcast_token";

export function saveConnection(origin: string, token: string) {
  sessionStorage.setItem(ORIGIN_STORAGE, origin);
  sessionStorage.setItem(TOKEN_STORAGE, token);
}

export function loadConnection(): { origin: string; token: string } {
  return {
    origin:
      sessionStorage.getItem(ORIGIN_STORAGE) ??
      import.meta.env.VITE_ADMIN_API_ORIGIN ??
      "http://127.0.0.1:8080",
    token: sessionStorage.getItem(TOKEN_STORAGE) ?? "",
  };
}

export async function apiFetch(
  origin: string,
  token: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(`${origin}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  return res;
}
