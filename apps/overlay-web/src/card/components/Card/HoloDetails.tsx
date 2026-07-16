import './HoloDetails.css';

/**
 * Frame-edge accents matching holo.mp4:
 * thin recessed iridescent lines (not a neon border), soft sheen, subtle foil.
 */
export function HoloDetails() {
  return (
    <div className="holo-details" aria-hidden>
      {/* Outer chamfer edge — thin spectrum line */}
      <div className="holo-details__edge-line holo-details__edge-line--outer" />
      {/* Inner bevel accent — second recessed strip */}
      <div className="holo-details__edge-line holo-details__edge-line--inner" />
      <div className="holo-details__art-rim" />
      <div className="holo-details__portrait-sheen" />
      <div className="holo-details__status">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="holo-details__dot" style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </div>
      <div className="holo-details__foil-color" />
      <div className="holo-details__foil-white" />
    </div>
  );
}
