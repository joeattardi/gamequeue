/**
 * Whether satori can draw `text` with the bundled fonts. They are the fontsource *latin* subsets, so
 * anything outside Basic Latin, Latin-1 and a handful of punctuation marks would come out as blanks or
 * boxes. User-written text (a grid title, a tier name) is only printed on a card when it passes.
 */
export const isDrawable = (text: string) => /^[ -~ -ÿıŒœ‐-―‘-„•…€™]*$/.test(text);

/** The text if the cards can draw it, else null. */
export const drawable = (text: string) => (text.trim() !== '' && isDrawable(text) ? text : null);
