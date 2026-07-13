
const fs = require("fs");
const path = require("path");

const p = path.join("apps", "overlay-web", "src", "pages", "LivePlayerCardPage.tsx");
let content = fs.readFileSync(p, "utf-8");

content = content.replace("if (!useInwardCut) return undefined;", "if (!useInwardCut) return \"polygon(0 0, 100% 0, 100% 43%, 100% 43%, 100% 83%, 100% 84.1%, 100% 87.3%, 100% 91.5%, 100% 95.8%, 100% 98.9%, 100% 100%, 0 100%)\";");

fs.writeFileSync(p, content);
console.log("Fixed clip path transition");

