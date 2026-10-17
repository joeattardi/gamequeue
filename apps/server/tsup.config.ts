import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm'],
    target: 'node20',
    clean: true,
    // Inline the workspace package (it ships as TS source); keep native deps external.
    noExternal: ['@gamequeue/shared']
});
