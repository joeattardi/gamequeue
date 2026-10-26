/** "?" on a 5 x 7 pixel grid, drawn as squares so it matches the pixel texture. */
const QUESTION = ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'];
const PIXELS = QUESTION.flatMap((row, y) =>
    [...row].flatMap((c, x) => (c === '#' ? [{ x, y }] : []))
);

/**
 * A game cartridge hovering above its slot, tilted as if it didn't go in, with a "?" for a label.
 * Art for the 404 page; sized by CSS (`.cartridge`).
 */
export function CartridgeArt() {
    return (
        <svg className="cartridge" viewBox="0 0 120 120" aria-hidden="true">
            <rect className="cartridge__slot" x="26" y="98" width="68" height="12" rx="4" />
            <g className="cartridge__float">
                <g transform="rotate(-11 60 62)">
                    {/* the pins on the bottom edge */}
                    <rect className="cartridge__edge" x="36" y="84" width="48" height="12" rx="2" />
                    {[40, 46, 52, 58, 64, 70, 76].map((x) => (
                        <rect
                            key={x}
                            className="cartridge__pin"
                            x={x}
                            y="88"
                            width="3"
                            height="8"
                        />
                    ))}
                    <path
                        className="cartridge__shell"
                        d="M28 32Q28 20 40 20H80Q92 20 92 32V86H28Z"
                    />
                    {/* grip ridges along the top */}
                    {[27, 32, 37].map((y) => (
                        <rect
                            key={y}
                            className="cartridge__ridge"
                            x="40"
                            y={y}
                            width="40"
                            height="2"
                            rx="1"
                        />
                    ))}
                    <rect
                        className="cartridge__label"
                        x="38"
                        y="44"
                        width="44"
                        height="34"
                        rx="4"
                    />
                    <g transform="translate(47.5 46.5)">
                        {PIXELS.map(({ x, y }) => (
                            <rect
                                key={`${x}-${y}`}
                                className="cartridge__mark"
                                x={x * 5}
                                y={y * 4}
                                width="5"
                                height="4"
                            />
                        ))}
                    </g>
                </g>
            </g>
        </svg>
    );
}
