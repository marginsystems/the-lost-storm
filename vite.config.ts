import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import type { ConfigEnv, Plugin, ResolvedConfig, UserConfig } from 'vite';
import { assetVersionDefine } from './tools/asset-versions.ts';
import links from './data/links.json' with { type: 'json' };
import { readServerUrl } from './src/backend/server-url.ts';
import { readLinks } from './src/launch/links.ts';
import { loadContent } from './sim/content/content.ts';
import { buildPage } from './src/launch/page-html.ts';
import { defaultBar } from './sim/skill-book.ts';
import { defaultKeys, titleKeyRows, titleKeysHtml, titleNames } from './src/title-keys.ts';

const ROOT: string = import.meta.dirname;
function pageLinks(): Plugin {
  let hasServer: boolean = false;
  return {
    name: 'lost-storm-page-links',
    configResolved(config: ResolvedConfig): void {
      const raw: unknown = config.env['VITE_SERVER_URL'];
      hasServer = readServerUrl(typeof raw === 'string' ? raw : undefined).kind === 'ok';
    },
    transformIndexHtml(html: string): string {
      const content = loadContent();
      const keys: string = titleKeysHtml(titleKeyRows(defaultKeys(content, hasServer), titleNames(content, defaultBar(content))));
      return buildPage(html, readLinks(links), hasServer, keys);
    },
  };
}

function assetVersions(): Plugin {
  return {
    name: 'lost-storm-asset-versions',
    config(_config: UserConfig, env: ConfigEnv): UserConfig {
      return { define: assetVersionDefine(resolve(ROOT, 'public'), env.command === 'build') };
    },
  };
}

export default defineConfig({
  server: { port: 5193, open: false },
  plugins: [pageLinks(), assetVersions()],
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
