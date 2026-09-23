import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        // Dummy secret so modules that read it don't choke in tests.
        bindings: {
          SLACK_BOT_TOKEN: "xoxb-test-token",
        },
      },
    }),
  ],
});
