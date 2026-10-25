import { LOGO_PATH, LOGO_VIEWBOX } from '@gamequeue/shared';

export function Logo() {
    return (
        <span className="logo" aria-label="GameQueue">
            <span className="logo__mark" aria-hidden="true">
                <svg viewBox={LOGO_VIEWBOX} fill="currentColor" fillRule="evenodd">
                    <path d={LOGO_PATH} />
                </svg>
            </span>
            <span className="logo__word">GameQueue</span>
        </span>
    );
}
