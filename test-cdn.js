const urls = [
  'https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/dawnbreaker.png',
  'https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/marci.png',
  'https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/muerta.png',
  'https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/primal_beast.png',
  'https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/kez.png',
  'https://cdn.cloudflare.steamstatic.com/apps/dota2/videos/dota_react/heroes/renders/ringmaster.png'
];

Promise.all(urls.map(async (url) => {
  const res = await fetch(url);
  console.log(url, res.status);
}));
