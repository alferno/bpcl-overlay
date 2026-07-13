
const fs = require("fs");
const path = require("path");

const p = path.join("apps", "overlay-web", "src", "pages", "StandoutPlayerPage.tsx");
let content = fs.readFileSync(p, "utf-8");

content = content.replace("import { useEffect, useState, useRef } from \"react\";", "import { useEffect, useState } from \"react\";");
content = content.replace(/import \{\s*resolveOverlayHeroAnimatedUrl,\s*loadHeroRenderManifest,\s*\} from "\.\.\/hero-render-manifest";\r?\n/, "");

fs.writeFileSync(p, content);
console.log("Fixed unused imports");

