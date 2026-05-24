import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Si el repo se llama "casamiento" la URL queda en /casamiento/.
// En CI sobreescribimos con BASE_PATH (ej: "/casamiento/") si hace falta.
const base = process.env.BASE_PATH ?? "/casamiento/";

export default defineConfig({
  plugins: [react()],
  base,
});
