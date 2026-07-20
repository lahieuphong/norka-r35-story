/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_MODEL_VARIANT?: 'original' | 'desktop' | 'mobile';
  readonly VITE_SCROLL_MARKERS?: 'true' | 'false';
}
interface ImportMeta { readonly env: ImportMetaEnv; }
interface Navigator { readonly deviceMemory?: number; }
