import cloudflare from '@astrojs/cloudflare';
import node from '@astrojs/node';
import { defineConfig } from 'astro/config';

const isSandbox = process.env.ASTRO_SANDBOX === 'true';

export default defineConfig({
  output: 'server',
  adapter: isSandbox
    ? node({
        mode: 'standalone',
      })
    : cloudflare({
        inspectorPort: false,
        remoteBindings: true,
      }),
});
