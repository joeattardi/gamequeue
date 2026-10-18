import { Gamepad2 } from 'lucide-react';

export function Logo() {
    return (
        <span className="logo" aria-label="GameQueue">
            <span className="logo__mark" aria-hidden="true">
                <Gamepad2 />
            </span>
            <span className="logo__word">GameQueue</span>
        </span>
    );
}
