import { useEffect, useRef } from "react";

export function CachedIframe({ 
  bpcId, 
  className, 
  style 
}: { 
  bpcId: string; 
  className?: string; 
  style?: React.CSSProperties; 
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const iframeId = `bpc-iframe-${bpcId}`;
    let iframe = document.getElementById(iframeId) as HTMLIFrameElement;
    
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = iframeId;
      iframe.src = `https://bpcleague.in/overlay/card/${bpcId}`;
      iframe.title = `BPC Player Card`;
    }
    
    // Reparent into this component
    containerRef.current.appendChild(iframe);
    
    // Always make the iframe fill its React container
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
    iframe.style.visibility = "visible";
    iframe.style.transform = "none";

    return () => {
      // Reparent back to preloader container when unmounting
      const preloader = document.getElementById("bpc-preloader-container");
      if (preloader && iframe) {
        preloader.appendChild(iframe);
        iframe.style.visibility = "hidden";
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
