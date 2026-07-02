const fs = require('fs');
const content = fs.readFileSync('C:/Users/anian/.gemini/antigravity/brain/daedad6b-f4e6-466c-a681-d3045f79e9d4/.system_generated/steps/257/content.md', 'utf8');

const result = {};
const heroRegex = /"npc_dota_hero_([a-zA-Z0-9_]+)":\s*\{[\s\S]*?"abilities":\s*\[([\s\S]*?)\]/g;
let match;
while ((match = heroRegex.exec(content)) !== null) {
  const slug = match[1];
  const abilitiesStr = match[2];
  const abilityRegex = /"([a-zA-Z0-9_]+)"/g;
  let abMatch;
  const skills = [];
  while ((abMatch = abilityRegex.exec(abilitiesStr)) !== null) {
    const ab = abMatch[1];
    if (ab !== 'generic_hidden' && ab !== 'attribute_bonus' && !ab.includes('empty')) {
      skills.push(ab);
    }
  }
  result[slug] = skills;
}

fs.writeFileSync('c:/Users/anian/OneDrive/Documents/BPCL Production/apps/overlay-web/src/ability-constants.ts', 'export const HERO_ABILITIES: Record<string, string[]> = ' + JSON.stringify(result, null, 2) + ';');
