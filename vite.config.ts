import { defineConfig } from "vite";
import { wgslVitePlugin } from "@vgpu/wgsl/loader-vite";
export default defineConfig({
  base: "./",
  plugins: [wgslVitePlugin()],
  server: { host: "0.0.0.0", allowedHosts: true },
});
