import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import federation from '@originjs/vite-plugin-federation'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    federation({
      name: 'shell',
      remotes: {},
      shared: {},
    }),
  ],
  optimizeDeps: {
    exclude: ['lucide-svelte'],
  },
  build: {
    target: 'esnext',
  },
})
