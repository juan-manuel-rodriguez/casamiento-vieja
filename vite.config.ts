import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Custom domain serves from the root. Override with BASE_PATH in CI if a
// future deploy needs to live under a subpath.
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base,
});
