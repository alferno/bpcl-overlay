import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import react from '@vitejs/plugin-react';
export default defineConfig({
    base: './',
    plugins: [
        react(),
        electron([
            {
                entry: 'electron/main.ts',
                vite: {
                    build: {
                        rollupOptions: {
                            external: ['bufferutil', 'utf-8-validate']
                        }
                    }
                }
            },
            {
                entry: 'electron/preload.ts',
                onstart(options) {
                    options.reload();
                },
                vite: {
                    build: {
                        rollupOptions: {
                            output: {
                                format: 'cjs'
                            }
                        }
                    }
                }
            },
        ]),
        renderer(),
    ],
});
