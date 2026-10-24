import { coverUrl, type GridDto } from '@gamequeue/shared';
import {
    BODY,
    COLORS,
    DISPLAY,
    canvasToJpeg,
    drawBrandFooter,
    drawCover,
    loadFonts,
    loadImage,
    textLines,
    textMeasurer,
    wrapLines
} from './shareImage';

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

    const titleLines = wrapLines(textMeasurer(`700 60px ${DISPLAY}`), grid.title, contentW, 2);
    const descLines = grid.description
        ? wrapLines(textMeasurer(`500 26px ${BODY}`), grid.description, contentW, 2)
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
    const labelMeasure = textMeasurer(`600 ${LABEL_SIZE}px ${DISPLAY}`);
    const nameMeasure = textMeasurer(`500 ${NAME_SIZE}px ${BODY}`);
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
            const lines = wrapLines(
                textMeasurer(`600 26px ${DISPLAY}`),
                c.game.name,
                COVER_W - 24,
                5
            );
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

    drawBrandFooter(ctx, width, height, footerH, PAD);

    return canvasToJpeg(canvas);
}
