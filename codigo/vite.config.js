import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build`       -> build estándar en dist/
// `npm run build:demo`  -> un solo archivo HTML autocontenido en dist-demo/ (se abre con doble clic, sin servidor)
export default defineConfig(({ mode }) => ({
  plugins: mode === 'singlefile' ? [react(), viteSingleFile()] : [react()],
  base: './',
  build: {
    outDir: mode === 'singlefile' ? 'dist-demo' : 'dist',
  },
}));
