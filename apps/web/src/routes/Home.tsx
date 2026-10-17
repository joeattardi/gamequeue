import { DEFAULT_SLOT_NAMES } from "@gamequeue/shared";

export function Home() {
  return (
    <section>
      <h1>Now playing</h1>
      <p className="muted">Your slots will live here. The collection arrives in the next milestone.</p>
      <ul className="slots-preview" aria-label="Slots">
        {DEFAULT_SLOT_NAMES.map((name) => (
          <li key={name} className="slot-bay">
            <span className="slot-bay__name">{name}</span>
            <span className="slot-bay__empty">Empty</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
