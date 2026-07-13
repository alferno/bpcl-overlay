
const fs = require("fs");
const path = require("path");

const p = path.join("apps", "overlay-web", "src", "pages", "StandoutPlayerPage.tsx");
let content = fs.readFileSync(p, "utf-8");

content = content.replace(/<img\s+src=\{portraitUrl\}\s+alt=""/g, `<img\n        src={portraitUrl || withBaseUrl("/cards/sample.png")}\n        alt="Fallback"`);

fs.writeFileSync(p, content);
console.log("Fixed StandoutPlayerPage fallback");

