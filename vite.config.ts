import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Repo name decides the base path. Override with BASE_PATH in CI if needed.
const base = process.env.BASE_PATH ?? "/casamiento/";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base,
});
