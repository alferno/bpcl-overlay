const fs = require('fs');
let c = fs.readFileSync('apps/overlay-web/src/pages/StandoutPlayerPage.tsx', 'utf8');
c = c.replace(/"rgba\(16,185,129,[0-9.]+\)"/g, 'EMERALD_GLOW');
c = c.replace(/rgba\(16,185,129,[0-9.]+\)/g, '${EMERALD_GLOW}');
fs.writeFileSync('apps/overlay-web/src/pages/StandoutPlayerPage.tsx', c);
