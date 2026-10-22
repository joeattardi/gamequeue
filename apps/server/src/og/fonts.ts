import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/** The static weights the cards use. satori reads TTF/OTF/WOFF (not WOFF2, not variable fonts), so these are the fontsource static files. */
const FILES = [
    {
        name: 'Bricolage Grotesque',
        weight: 700,
        file: 'bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff'
    },
    {
        name: 'Bricolage Grotesque',
        weight: 800,
        file: 'bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff'
    },
    { name: 'Figtree', weight: 500, file: 'figtree/files/figtree-latin-500-normal.woff' },
    { name: 'Figtree', weight: 600, file: 'figtree/files/figtree-latin-600-normal.woff' },
    { name: 'Figtree', weight: 700, file: 'figtree/files/figtree-latin-700-normal.woff' }
] as const;

export interface CardFont {
    name: string;
    data: Buffer;
    weight: 500 | 600 | 700 | 800;
    style: 'normal';
}

let cached: CardFont[] | undefined;

/** Read once, on the first card. Resolved through node_modules so it works from `tsx`, the tsup bundle and the Docker image alike. */
export function loadFonts(): CardFont[] {
    if (!cached) {
        const require = createRequire(import.meta.url);
        cached = FILES.map((f) => ({
            name: f.name,
            weight: f.weight,
            style: 'normal',
            data: readFileSync(require.resolve(`@fontsource/${f.file}`))
        }));
    }
    return cached;
}
