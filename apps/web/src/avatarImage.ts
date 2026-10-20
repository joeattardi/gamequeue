import { AVATAR_MAX_BYTES, AVATAR_UPLOAD_SIZE, type AvatarUploadInput } from '@gamequeue/shared';

/**
 * Centre-crops an image file to a square and re-encodes it, so the server only ever stores a small
 * image (and EXIF data such as GPS location never leaves the browser). WebP where the browser can
 * encode it, JPEG otherwise.
 */
export async function prepareAvatar(file: File): Promise<AvatarUploadInput> {
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
        throw new Error("That file isn't an image this browser can read.");
    }
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = AVATAR_UPLOAD_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("This browser can't process images.");
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        AVATAR_UPLOAD_SIZE,
        AVATAR_UPLOAD_SIZE
    );
    bitmap.close();

    for (const quality of [0.9, 0.8, 0.7, 0.55]) {
        const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/webp', quality)
        );
        // Browsers that can't encode WebP silently hand back PNG; use JPEG for those instead.
        const out =
            blob?.type === 'image/webp'
                ? blob
                : await new Promise<Blob | null>((resolve) =>
                      canvas.toBlob(resolve, 'image/jpeg', quality)
                  );
        if (out && out.size <= AVATAR_MAX_BYTES) {
            return {
                contentType: out.type === 'image/webp' ? 'image/webp' : 'image/jpeg',
                data: await toBase64(out)
            };
        }
    }
    throw new Error('That image is too detailed to shrink enough. Try a different one.');
}

async function toBase64(blob: Blob): Promise<string> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
}
