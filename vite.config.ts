import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // WebGL2, not untranspiled ES2022 syntax, should be the browser boundary.
    // This keeps Safari/iOS 15-era WebGL2 browsers able to parse the bundle.
    target: 'es2020',
    sourcemap: false,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600,
  },
  server: { host: true },
  preview: { host: true },
});
