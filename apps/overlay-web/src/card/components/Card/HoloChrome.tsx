import './HoloChrome.css';

/**
 * Top chrome labels originally drawn on the holo canvas (not in the frame PNG):
 * centered HOLO badge + flanking BPCL marks.
 * Positions match 1086×1448 canvas layout.
 */
export function HoloChrome({ badge = 'HOLO' }: { badge?: string }) {
  return (
    <div className="holo-chrome" aria-hidden>
      <span className="holo-chrome__bpcl holo-chrome__bpcl--left">BPCL</span>
      <span className="holo-chrome__bpcl holo-chrome__bpcl--right">BPCL</span>
      <span className="holo-chrome__badge">{badge}</span>
    </div>
  );
}
