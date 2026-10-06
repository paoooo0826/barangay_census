import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath, URL} from 'node:url';
export default defineConfig({plugins:[react()],base:'/',resolve:{alias:[{find:/^(?:\.\.\/|\.\/)lib\/supabase$/,replacement:fileURLToPath(new URL('./ui-review/api.ts',import.meta.url))},{find:'fs',replacement:fileURLToPath(new URL('./src/shims/fs.ts',import.meta.url))}]},build:{chunkSizeWarningLimit:1800,rollupOptions:{input:{main:fileURLToPath(new URL('./index.html',import.meta.url)),review:fileURLToPath(new URL('./ui-review.html',import.meta.url)),frame:fileURLToPath(new URL('./ui-frame.html',import.meta.url))}}}});
