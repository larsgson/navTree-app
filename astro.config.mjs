import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [react()],
  trailingSlash: 'never',
  build: {
    format: 'file',
  },
  vite: {
    build: {
      target: 'es2015',
    },
  },
  server: {
    port: 3000
  }
});
