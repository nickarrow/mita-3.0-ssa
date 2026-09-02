import { copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
const pdfHtmlStub = fileURLToPath(
  new URL('./src/services/export/unsupportedPdfHtmlRenderer.ts', import.meta.url)
)

/**
 * Emit `404.html` as a copy of `index.html`.
 *
 * GitHub Pages serves static files only: it has no rewrite rule to hand deep
 * paths to a client-side router. Without this, every route except the root
 * returned a hard 404 — `/dashboard`, `/guide`, `/processes/:code` — so shared
 * links and page refreshes landed on GitHub's error page instead of the app.
 *
 * That was masked in a browser by the service worker, whose navigation fallback
 * serves the cached shell. It only affected first visits, refreshes before the
 * worker activated, and anyone with a cleared cache — which is exactly the person
 * following a shared link.
 *
 * GitHub Pages serves `404.html` for unmatched paths, so copying the shell there
 * boots the app and lets the router resolve the URL. The response still carries a
 * 404 status, which is the accepted trade-off for SPAs on Pages.
 */
function githubPagesSpaFallback(): Plugin {
  return {
    name: 'github-pages-spa-fallback',
    apply: 'build',
    async closeBundle() {
      const outDir = resolve(import.meta.dirname, 'dist')
      await copyFile(resolve(outDir, 'index.html'), resolve(outDir, '404.html'))
    },
  }
}

export default defineConfig({
  base: '/mita-3.0-ssa/',
  resolve: {
    alias: {
      /**
       * jsPDF dynamically imports these for its .html() renderer, which this app
       * never uses (all PDFs are built via the programmatic text/table API).
       * Bundling them costs ~220 KB of dead code.
       *
       * Aliased to a stub rather than marked external: `external` would leave
       * unresolvable bare specifiers in a browser bundle. See the stub for detail.
       */
      html2canvas: pdfHtmlStub,
      dompurify: pdfHtmlStub,
      // canvg is the third of jsPDF's optional dynamic imports (SVG rendering),
      // worth ~53 KB gzipped on its own.
      canvg: pdfHtmlStub,
    },
  },
  plugins: [
    react(),
    githubPagesSpaFallback(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'MITA Self-Assessment Tool',
        short_name: 'MITA SS-A',
        description: 'Self-assess your Medicaid IT maturity against MITA 3.0 framework',
        theme_color: '#6B4E71',
        background_color: '#FAF9F7',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            // Separate asset: a maskable icon must keep its content inside the
            // inner 80% safe zone, so it cannot be the same file as the standard
            // rounded icon without risking clipped edges.
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB limit for large bundles
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
})
