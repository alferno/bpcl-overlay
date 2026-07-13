
const fs = require("fs");
const path = require("path");

const p = path.join("apps", "overlay-web", "src", "pages", "StandoutPlayerPage.tsx");
let content = fs.readFileSync(p, "utf-8");

// Remove HeroVideo
content = content.replace(/function HeroVideo[\s\S]*?return null;\r?\n}\r?\n/, "");

// Fix src={itemIconUrl(neutralItem)!}
content = content.replace(/src=\{itemIconUrl\(neutralItem\)\}/g, "src={itemIconUrl(neutralItem) || undefined}");
content = content.replace(/src=\{itemIconUrl\(id\)\}/g, "src={itemIconUrl(id) || undefined}");

fs.writeFileSync(p, content);
console.log("Fixed TS errors");

