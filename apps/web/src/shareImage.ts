/** Pieces shared by the downloadable grid and tier list images (drawn on a canvas). */

/** Fixed brand palette (the dark theme), so a shared image looks the same whoever made it. */
export const COLORS = {
    bg: '#0d1320',
    surface: '#151d2e',
    surface2: '#1d283d',
    ink: '#e8eefb',
    muted: '#9fb0cc',
    line: '#2e3b57',
    accent: '#6ea0ff',
    accentInk: '#08122b'
};
export const DISPLAY = '"Bricolage Grotesque Variable", system-ui, sans-serif';
export const BODY = '"Figtree Variable", system-ui, sans-serif';

/** Same path as the app's logo (lucide gamepad-2), on a 24x24 grid. Built on use: Node has no Path2D. */
const gamepad = () =>
    new Path2D(
        'M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z'
    );

/**
 * Splits text into at most `maxLines` lines no wider than `maxWidth` (by `measure`), breaking at
 * spaces, or inside a word that is too long alone; the last line ends in "…" if text was cut.
 */
export function wrapLines(
    measure: (text: string) => number,
    text: string,
    maxWidth: number,
    maxLines: number
): string[] {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    const fit = (s: string) => {
        // Cut a single over-long word to fit, leaving room for the ellipsis
        let out = s;
        while (out.length > 1 && measure(out + '…') > maxWidth) out = out.slice(0, -1);
        return out + '…';
    };
    for (let i = 0; i < words.length; i++) {
        const next = line ? `${line} ${words[i]}` : words[i]!;
        if (measure(next) <= maxWidth) {
            line = next;
            continue;
        }
        if (line) {
            lines.push(line);
            line = '';
            i--;
            if (lines.length === maxLines) break;
            continue;
        }
        // One word wider than the line
        lines.push(measure(words[i]!) <= maxWidth ? words[i]! : fit(words[i]!));
        if (lines.length === maxLines) break;
    }
    if (line && lines.length < maxLines) lines.push(line);
    const used = lines.join(' ').split(/\s+/).length;
    if (lines.length === maxLines && used < words.length && !lines[maxLines - 1]!.endsWith('…')) {
        lines[maxLines - 1] = fit(lines[maxLines - 1]!);
    }
    return lines;
}

export function loadImage(url: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        const img = new Image();
        // IGDB sends `access-control-allow-origin: *`, which is what lets the canvas be exported
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

export async function loadFonts() {
    try {
        await Promise.all([
            document.fonts.load(`700 48px ${DISPLAY}`),
            document.fonts.load(`600 24px ${DISPLAY}`),
            document.fonts.load(`500 24px ${BODY}`)
        ]);
    } catch {
        // fall back to the system fonts in the stacks
    }
}

/** Draws `img` filling the rect like `object-fit: cover`. */
export function drawCover(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    w: number,
    h: number
) {
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const sw = w / scale;
    const sh = h / scale;
    ctx.drawImage(
        img,
        (img.naturalWidth - sw) / 2,
        (img.naturalHeight - sh) / 2,
        sw,
        sh,
        x,
        y,
        w,
        h
    );
}

export function textLines(
    ctx: CanvasRenderingContext2D,
    lines: string[],
    x: number,
    y: number,
    lineHeight: number,
    align: CanvasTextAlign
) {
    ctx.textAlign = align;
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
}

/** A function measuring text in `font`, for `wrapLines`. */
export function textMeasurer(font: string) {
    const probe = document.createElement('canvas').getContext('2d')!;
    return (t: string) => {
        probe.font = font;
        return probe.measureText(t).width;
    };
}

/** The GameQueue logo and name on the left, the IGDB credit on the right, centred in `footerH`. */
export function drawBrandFooter(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    footerH: number,
    pad: number
) {
    const fy = height - footerH / 2;
    const mark = 52;
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.roundRect(pad, fy - mark / 2, mark, mark, 10);
    ctx.fill();
    ctx.save();
    ctx.translate(pad + (mark - 36) / 2, fy - 18);
    ctx.scale(36 / 24, 36 / 24);
    ctx.strokeStyle = COLORS.accentInk;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(gamepad());
    for (const [x1, y1, x2, y2] of [
        [6, 11, 10, 11],
        [8, 9, 8, 13],
        [15, 12, 15.01, 12],
        [18, 10, 18.01, 10]
    ] as const) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = COLORS.ink;
    ctx.font = `700 34px ${DISPLAY}`;
    ctx.textAlign = 'left';
    ctx.fillText('GameQueue', pad + mark + 16, fy + 12);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 20px ${BODY}`;
    ctx.textAlign = 'right';
    ctx.fillText('Game data from IGDB.com', width - pad, fy + 7);
}

export function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) =>
        canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Could not create the image'))),
            'image/jpeg',
            0.92
        )
    );
}

/** A safe filename from the title: "Best of 2026!" -> "best-of-2026.jpg". */
export function imageFilename(title: string, fallback: string): string {
    const slug = title
        .normalize('NFKD')
        .replace(/[^\x20-\x7e]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return `${slug || fallback}.jpg`;
}
