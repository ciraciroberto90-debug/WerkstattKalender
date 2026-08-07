import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Baut den kompletten Kalender in eine einzige index.html, die ohne
// Webserver per Doppelklick läuft (siehe "build"-Script in package.json).
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  define: {
    // Sichtbarer Versionsstand (⚙ unten). Gemessen am 07.08.: Roberto sass
    // vor einer aelteren Fassung, und niemand konnte es der App ansehen.
    __BUILD_ZEIT__: JSON.stringify(new Date().toISOString()),
  },
});
