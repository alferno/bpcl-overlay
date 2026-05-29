/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BROADCAST_API_ORIGIN?: string;
  readonly VITE_SOCKET_TOKEN?: string;
  readonly VITE_DRAFT_HERO_ANIMATED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
