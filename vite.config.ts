import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin, ResolvedConfig } from 'vite';
import links from './data/links.json' with { type: 'json' };
import { readServerUrl } from './src/backend/server-url.ts';
import { readLinks } from './src/launch/links.ts';
import { buildPage } from './src/launch/page-html.ts';

const ROOT: string = import.meta.dirname;
const BUILD_FALLBACK: string = 'dev';

function buildId(): string {
  try {
    const sha: string = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    return sha === '' ? BUILD_FALLBACK : sha;
  } catch {
    return BUILD_FALLBACK;
  }
}

function pageLinks(): Plugin {
  let hasServer: boolean = false;
  return {
    name: 'lost-storm-page-links',
    configResolved(config: ResolvedConfig): void {
      const raw: unknown = config.env['VITE_SERVER_URL'];
      hasServer = readServerUrl(typeof raw === 'string' ? raw : undefined).kind === 'ok';
    },
    transformIndexHtml(html: string): string {
      return buildPage(html, readLinks(links), hasServer);
    },
  };
}

export default defineConfig({
  server: { port: 5193, open: false },
  define: { 'import.meta.env.VITE_BUILD': JSON.stringify(buildId()) },
  plugins: [pageLinks()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        landing: resolve(ROOT, 'index.html'),
        play: resolve(ROOT, 'play/index.html'),
      },
    },
  },
});
