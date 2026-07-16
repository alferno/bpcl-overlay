import { useEffect, useRef } from "react";

export function CachedIframe({ 
  bpcId, 
  className, 
  style,
  iframeOpacity = 1,
  iframeTransition,
}: { 
  bpcId: string; 
  className?: string; 
  style?: React.CSSProperties; 
  iframeOpacity?: number;
  iframeTransition?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const opacityRef = useRef(iframeOpacity);
  const transitionRef = useRef(iframeTransition);

  useEffect(() => {
    opacityRef.current = iframeOpacity;
  }, [iframeOpacity]);

  useEffect(() => {
    transitionRef.current = iframeTransition;
  }, [iframeTransition]);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const iframeId = `bpc-iframe-${bpcId}`;
    let iframe = document.getElementById(iframeId) as HTMLIFrameElement;
    
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = iframeId;
      iframe.src = `https://bpcleague.in/overlay/card/${bpcId}`;
      iframe.title = `BPC Player Card`;
      document.getElementById("bpc-preloader-container")?.appendChild(iframe);
    }
    
    let frameId: number;
    const sync = () => {
      if (!containerRef.current || !iframe) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        iframe.style.visibility = "hidden";
      } else {
        const nativeWidth = 240;
        const nativeHeight = 360;
        
        const scaleX = rect.width / nativeWidth;
        const scaleY = rect.height / nativeHeight;
        
        iframe.style.position = "fixed";
        iframe.style.left = `${rect.left}px`;
        iframe.style.top = `${rect.top}px`;
        iframe.style.width = `${nativeWidth}px`;
        iframe.style.height = `${nativeHeight}px`;
        iframe.style.transform = `scale(${scaleX}, ${scaleY})`;
        iframe.style.transformOrigin = "top left";
        iframe.style.border = "none";
        iframe.style.visibility = "visible";
        iframe.style.pointerEvents = "none";
        iframe.style.zIndex = "9999";
        // The overlay cards generally have rounded corners.
        iframe.style.borderRadius = "18px";
        iframe.style.opacity = opacityRef.current.toString();
        if (transitionRef.current) {
          iframe.style.transition = transitionRef.current;
        }
      }
      
      frameId = requestAnimationFrame(sync);
    };
    
    frameId = requestAnimationFrame(sync);

    return () => {
      cancelAnimationFrame(frameId);
      if (iframe) {
        iframe.style.visibility = "hidden";
        iframe.style.transform = "none";
        iframe.style.left = "-9999px";
      }
    };
  }, [bpcId]);

  return (
    <div 
      ref={containerRef} 
      className={`flex items-center justify-center overflow-hidden ${className || "w-full h-full"}`}
      style={style}
    />
  );
}

