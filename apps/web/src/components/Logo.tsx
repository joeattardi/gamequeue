import { LOGO_PATH, LOGO_VIEWBOX } from '@gamequeue/shared';

/** Just the controller, filled with the current text colour; size it with CSS. */
export function LogoMark() {
    return (
        <svg viewBox={LOGO_VIEWBOX} fill="currentColor" fillRule="evenodd" aria-hidden="true">
            <path d={LOGO_PATH} />
        </svg>
    );
}

export function Logo() {
    return (
        <span className="logo" aria-label="GameQueue, preview">
            <span className="logo__mark" aria-hidden="true">
                <LogoMark />
            </span>
            <span className="logo__word">GameQueue</span>
            <span className="logo__badge" aria-hidden="true">
                Preview
            </span>
        </span>
    );
}
