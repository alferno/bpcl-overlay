import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useFitText } from '../../hooks/useFitText';
import './FitText.css';

interface FitTextProps {
  text: string;
  className?: string;
  /** Font size as % of card width (cqi-equivalent). */
  maxCqi: number;
  minPx?: number;
  style?: CSSProperties;
}

export function FitText({ text, className = '', maxCqi, minPx = 8, style }: FitTextProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cardWidth, setCardWidth] = useState(272);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const card = el.closest('.card') as HTMLElement | null;
    const target = card ?? el;
    const update = () => setCardWidth(target.clientWidth || 272);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(target);
    return () => ro.disconnect();
  }, []);

  const maxPx = (cardWidth * maxCqi) / 100;
  const { ref, fontSize } = useFitText({ maxPx, minPx, text });

  return (
    <div className="fit-text" ref={wrapRef}>
      <p
        ref={ref}
        className={`fit-text__value ${className}`.trim()}
        style={{ ...style, fontSize: `${fontSize}px` }}
      >
        {text}
      </p>
    </div>
  );
}
