import { TIER_COLORS, TIER_INK, coverUrl, type TierListDto } from '@gamequeue/shared';
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

const WIDTH = 1500;
const PAD = 56;
const LABEL_W = 200;
const TILE_W = 120;
const TILE_H = 160;
const TILE_GAP = 10;
const ROW_GAP = 8;
const ROW_PAD = 10;
const NAME_SIZE = 40;

/**
 * Renders a tier list as a shareable JPEG: title, the coloured tier rows with their covers, and
 * GameQueue branding. The unranked pool is not drawn. Done on a canvas in the browser, like the grid
 * image, so it handles any script and costs the server nothing.
 */
export async function renderTierImage(
    list: Pick<TierListDto, 'title' | 'description' | 'tiers'>,
    username: string | undefined
): Promise<Blob> {
    await loadFonts();
    const ids = [
        ...new Set(
            list.tiers.flatMap((t) =>
                t.items.flatMap((i) => (i.game.coverImageId ? [i.game.coverImageId] : []))
            )
        )
    ];
    const loaded = new Map(
        await Promise.all(
            ids.map(async (id) => [id, await loadImage(coverUrl(id, 'cover_big'))] as const)
        )
    );

    const contentW = WIDTH - PAD * 2;
    const itemsW = contentW - LABEL_W - ROW_PAD * 2;
    const perLine = Math.max(1, Math.floor((itemsW + TILE_GAP) / (TILE_W + TILE_GAP)));
    const lineCount = (n: number) => Math.max(1, Math.ceil(n / perLine));
    const rowH = (n: number) => lineCount(n) * TILE_H + (lineCount(n) - 1) * TILE_GAP + ROW_PAD * 2;

    const titleLines = wrapLines(textMeasurer(`700 60px ${DISPLAY}`), list.title, contentW, 2);
    const descLines = list.description
        ? wrapLines(textMeasurer(`500 26px ${BODY}`), list.description, contentW, 2)
        : [];
    const TITLE_LH = 68;
    const DESC_LH = 34;
    const headerH =
        PAD +
        titleLines.length * TITLE_LH +
        (username ? 40 : 0) +
        (descLines.length ? 12 + descLines.length * DESC_LH : 0) +
        32;
    const boardH =
        list.tiers.reduce((sum, t) => sum + rowH(t.items.length), 0) +
        Math.max(0, list.tiers.length - 1) * ROW_GAP;
    const footerH = 104;
    const height = Math.ceil(headerH + boardH + footerH);

    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, WIDTH, height);
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

    // Tier rows
    const nameMeasure = textMeasurer(`700 ${NAME_SIZE}px ${DISPLAY}`);
    const tileName = textMeasurer(`600 15px ${DISPLAY}`);
    let top = headerH;
    for (const t of list.tiers) {
        const h = rowH(t.items.length);
        ctx.fillStyle = COLORS.surface;
        ctx.beginPath();
        ctx.roundRect(PAD, top, contentW, h, 10);
        ctx.fill();

        // Coloured label block with the tier name
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(PAD, top, LABEL_W, h, [10, 0, 0, 10]);
        ctx.fillStyle = TIER_COLORS[t.color];
        ctx.fill();
        ctx.restore();
        const name = wrapLines(nameMeasure, t.name, LABEL_W - 32, 3);
        ctx.fillStyle = TIER_INK;
        ctx.font = `700 ${NAME_SIZE}px ${DISPLAY}`;
        const blockH = name.length * NAME_SIZE * 1.15;
        textLines(
            ctx,
            name,
            PAD + LABEL_W / 2,
            top + (h - blockH) / 2 + NAME_SIZE * 0.88,
            NAME_SIZE * 1.15,
            'center'
        );

        // Covers, wrapping to as many lines as needed
        t.items.forEach((it, i) => {
            const x = PAD + LABEL_W + ROW_PAD + (i % perLine) * (TILE_W + TILE_GAP);
            const ty = top + ROW_PAD + Math.floor(i / perLine) * (TILE_H + TILE_GAP);
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(x, ty, TILE_W, TILE_H, 6);
            ctx.clip();
            const img = it.game.coverImageId ? loaded.get(it.game.coverImageId) : null;
            if (img) {
                drawCover(ctx, img, x, ty, TILE_W, TILE_H);
                ctx.restore();
            } else {
                // No cover: the name on a plain tile, as the app does
                ctx.fillStyle = COLORS.surface2;
                ctx.fillRect(x, ty, TILE_W, TILE_H);
                ctx.restore();
                ctx.fillStyle = COLORS.ink;
                ctx.font = `600 15px ${DISPLAY}`;
                const lines = wrapLines(tileName, it.game.name, TILE_W - 16, 5);
                textLines(
                    ctx,
                    lines,
                    x + TILE_W / 2,
                    ty + TILE_H / 2 - ((lines.length - 1) * 19) / 2 + 5,
                    19,
                    'center'
                );
            }
        });
        top += h + ROW_GAP;
    }

    drawBrandFooter(ctx, WIDTH, height, footerH, PAD);
    return canvasToJpeg(canvas);
}
