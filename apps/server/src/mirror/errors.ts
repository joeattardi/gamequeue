/**
 * A failure that trying again won't fix: bad credentials, a full disk, a dump IGDB doesn't list, a
 * build rejected as too small. The daily job gives up on these at once instead of retrying.
 */
export class PermanentMirrorError extends Error {}
