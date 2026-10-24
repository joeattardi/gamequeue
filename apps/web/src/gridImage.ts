import { coverUrl, type GridDto } from '@gamequeue/shared';

/** Fixed brand palette (the dark theme), so a shared image looks the same whoever made it. */
const COLORS = {
    bg: '#0d1320',
    surface: '#151d2e',
    surface2: '#1d283d',
    ink: '#e8eefb',
    muted: '#9fb0cc',
    line: '#2e3b57',
    accent: '#6ea0ff',
    accentInk: '#08122b'
};
const DISPLAY = '"Bricolage Grotesque Variable", system-ui, sans-serif';
const BODY = '"Figtree Variable", system-ui, sans-serif';

const PAD = 56;
const GAP = 20;
const CELL_W = 260;
const INNER = 12;
const COVER_W = CELL_W - INNER * 2;
const COVER_H = (COVER_W * 4) / 3;
const LABEL_SIZE = 24;
const NAME_SIZE = 19;
const LABEL_LINES = 2;
const NAME_LINES = 2;
const MIN_WIDTH = 900;

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

function loadImage(url: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        const img = new Image();
        // IGDB sends `access-control-allow-origin: *`, which is what lets the canvas be exported
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

async function loadFonts() {
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
function drawCover(
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

function textLines(
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

/**
 * Renders a grid as a shareable JPEG: title, the board with labels and game names, and GameQueue
 * branding. Drawn on a canvas in the browser, so it works for any script and costs the server nothing.
 */
export async function renderGridImage(
    grid: Pick<GridDto, 'title' | 'description' | 'cols' | 'rows' | 'cells'>,
    username: string | undefined
): Promise<Blob> {
    await loadFonts();
    const ids = [
        ...new Set(grid.cells.flatMap((c) => (c.game?.coverImageId ? [c.game.coverImageId] : [])))
    ];
    const loaded = new Map(
        await Promise.all(
            ids.map(async (id) => [id, await loadImage(coverUrl(id, 'cover_big_2x'))] as const)
        )
    );

    const boardW = grid.cols * CELL_W + (grid.cols - 1) * GAP;
    const width = Math.max(MIN_WIDTH, boardW + PAD * 2);
    const contentW = width - PAD * 2;
    const boardX = (width - boardW) / 2;

    const probe = document.createElement('canvas').getContext('2d')!;
    const measureAt = (font: string) => (t: string) => {
        probe.font = font;
        return probe.measureText(t).width;
    };
    const titleLines = wrapLines(measureAt(`700 60px ${DISPLAY}`), grid.title, contentW, 2);
    const descLines = grid.description
        ? wrapLines(measureAt(`500 26px ${BODY}`), grid.description, contentW, 2)
        : [];

    const TITLE_LH = 68;
    const DESC_LH = 34;
    const headerH =
        PAD +
        titleLines.length * TITLE_LH +
        (username ? 40 : 0) +
        (descLines.length ? 12 + descLines.length * DESC_LH : 0) +
        32;
    const labelH = LABEL_LINES * LABEL_SIZE * 1.2;
    const nameH = NAME_LINES * NAME_SIZE * 1.25;
    const cellH = INNER + labelH + 10 + COVER_H + 10 + nameH + INNER;
    const boardH = grid.rows * cellH + (grid.rows - 1) * GAP;
    const footerH = 104;
    const height = Math.ceil(headerH + boardH + footerH);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = 'alphabetic';

    // Header
    let y = PAD + 52;
    ctx.fillStyle = COLORS.ink;
    ctx.font = `700 60px ${DISPLAY}`;
    textLines(ctx, titleLines, PAD, y, TITLE_LH, 'left');
    y += (titleLines.length - 1) * TITLE_LH;
    if (username) {
        y += 44;
        ctx.fillStyle = COLORS.accent;
        ctx.font = `600 28px ${DISPLAY}`;
        ctx.fillText(`by ${username}`, PAD, y);
    }
    if (descLines.length) {
        y += 46;
        ctx.fillStyle = COLORS.muted;
        ctx.font = `500 26px ${BODY}`;
        textLines(ctx, descLines, PAD, y, DESC_LH, 'left');
    }

    // Board
    const labelMeasure = measureAt(`600 ${LABEL_SIZE}px ${DISPLAY}`);
    const nameMeasure = measureAt(`500 ${NAME_SIZE}px ${BODY}`);
    for (const c of grid.cells) {
        const col = c.position % grid.cols;
        const row = Math.floor(c.position / grid.cols);
        const x = boardX + col * (CELL_W + GAP);
        const top = headerH + row * (cellH + GAP);

        ctx.fillStyle = COLORS.surface;
        ctx.strokeStyle = COLORS.line;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(x, top, CELL_W, cellH, 12);
        ctx.fill();
        ctx.stroke();

        // Label, centred in its two-line band
        const label = wrapLines(labelMeasure, c.label, COVER_W, LABEL_LINES);
        ctx.fillStyle = COLORS.ink;
        ctx.font = `600 ${LABEL_SIZE}px ${DISPLAY}`;
        const labelTop = top + INNER + (labelH - label.length * LABEL_SIZE * 1.2) / 2;
        textLines(ctx, label, x + CELL_W / 2, labelTop + LABEL_SIZE, LABEL_SIZE * 1.2, 'center');

        // Art
        const ax = x + INNER;
        const ay = top + INNER + labelH + 10;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(ax, ay, COVER_W, COVER_H, 8);
        ctx.clip();
        const img = c.game?.coverImageId ? loaded.get(c.game.coverImageId) : null;
        if (img) {
            drawCover(ctx, img, ax, ay, COVER_W, COVER_H);
            ctx.restore();
        } else if (c.game) {
            // No cover: the name on a plain tile, as the app does
            ctx.fillStyle = COLORS.surface2;
            ctx.fillRect(ax, ay, COVER_W, COVER_H);
            ctx.restore();
            ctx.fillStyle = COLORS.ink;
            ctx.font = `600 26px ${DISPLAY}`;
            const lines = wrapLines(measureAt(`600 26px ${DISPLAY}`), c.game.name, COVER_W - 24, 5);
            textLines(
                ctx,
                lines,
                ax + COVER_W / 2,
                ay + COVER_H / 2 - ((lines.length - 1) * 32) / 2 + 9,
                32,
                'center'
            );
        } else {
            ctx.restore();
            ctx.strokeStyle = COLORS.line;
            ctx.setLineDash([8, 8]);
            ctx.beginPath();
            ctx.roundRect(ax, ay, COVER_W, COVER_H, 8);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Game name
        if (c.game) {
            const name = wrapLines(nameMeasure, c.game.name, COVER_W, NAME_LINES);
            ctx.fillStyle = COLORS.muted;
            ctx.font = `500 ${NAME_SIZE}px ${BODY}`;
            textLines(
                ctx,
                name,
                x + CELL_W / 2,
                ay + COVER_H + 10 + NAME_SIZE,
                NAME_SIZE * 1.25,
                'center'
            );
        }
    }

    // Branding footer
    const fy = height - footerH / 2;
    const mark = 52;
    ctx.fillStyle = COLORS.accent;
    ctx.beginPath();
    ctx.roundRect(PAD, fy - mark / 2, mark, mark, 10);
    ctx.fill();
    ctx.save();
    ctx.translate(PAD + (mark - 36) / 2, fy - 18);
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
    ctx.fillText('GameQueue', PAD + mark + 16, fy + 12);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `500 20px ${BODY}`;
    ctx.textAlign = 'right';
    ctx.fillText('Game data from IGDB.com', width - PAD, fy + 7);

    return new Promise((resolve, reject) =>
        canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Could not create the image'))),
            'image/jpeg',
            0.92
        )
    );
}

/** A safe filename from the title: "Best of 2026!" -> "best-of-2026". */
export function gridFilename(title: string): string {
    const slug = title
        .normalize('NFKD')
        .replace(/[^\x20-\x7e]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return `${slug || 'grid'}.jpg`;
}
