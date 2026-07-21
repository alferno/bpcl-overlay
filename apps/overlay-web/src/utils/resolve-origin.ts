export function resolveApiOrigin(): string {
  // If the overlay is loaded with a tunnel parameter (e.g. from the streamer desktop app), use it.
  const urlParams = new URLSearchParams(window.location.search);
  const tunnel = urlParams.get('tunnel');
  if (tunnel) {
    return tunnel.replace(/\/$/, "");
  }

  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (isLocal) {
    const configured = import.meta.env.VITE_BROADCAST_API_ORIGIN;
    if (configured) {
      return configured.replace(/\/$/, "");
    }
  }
  return window.location.origin.replace(/\/$/, "");
}
