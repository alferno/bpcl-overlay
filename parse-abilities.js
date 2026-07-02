const fs = require('fs');

const GSI_HERO_SLUG_ALIASES = {
  windrunner: "windranger",
  skeleton_king: "wraith_king",
  shredder: "timbersaw",
  obsidian_destroyer: "outworld_destroyer",
  zuus: "zeus",
  rattletrap: "clockwerk",
  furion: "natures_prophet",
  life_stealer: "lifestealer",
  doom_bringer: "doom",
  abyssal_underlord: "underlord",
};

function normalizeHeroSlug(slug) {
  const norm = slug.replace(/^npc_dota_hero_/, "").trim().toLowerCase();
  return GSI_HERO_SLUG_ALIASES[norm] || norm;
}

const content = fs.readFileSync('hero_abilities.json', 'utf8');
const abilities = JSON.parse(content);

const result = {};
for (const [heroName, data] of Object.entries(abilities)) {
  const slug = normalizeHeroSlug(heroName);
  const skills = data.abilities.filter(a => a !== 'generic_hidden' && a !== 'attribute_bonus' && !a.includes('empty'));
  result[slug] = skills;
}

fs.writeFileSync('c:/Users/anian/OneDrive/Documents/BPCL Production/apps/overlay-web/src/ability-constants.ts', 'export const HERO_ABILITIES: Record<string, string[]> = ' + JSON.stringify(result, null, 2) + ';');
console.log('Processed', Object.keys(result).length, 'heroes');
