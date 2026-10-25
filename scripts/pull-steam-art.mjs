// Pulls the official Marvel Rivals store screenshots (Steam app 2767030) into assets/img/stage/steam-NN.jpg
// and prints MANIFEST rows. Run: node scripts/pull-steam-art.mjs   then: python3 scripts/optimize-images.py
import { mkdir, writeFile } from "node:fs/promises";
const APP = 2767030, today = new Date().toISOString().slice(0, 10);
const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${APP}`);
const shots = (await r.json())[APP].data.screenshots;
await mkdir("assets/img/stage", { recursive: true });
const rows = [];
for (const [i, s] of shots.entries()) {
  const n = String(i).padStart(2, "0"), url = s.path_full.split("?")[0] + "?t=" + (s.path_full.split("?t=")[1] || "");
  const b = Buffer.from(await (await fetch(s.path_full)).arrayBuffer());
  await writeFile(`assets/img/stage/steam-${n}.jpg`, b);
  rows.push(`| stage/steam-${n}.jpg | Official Steam store screenshot ${i} | ${s.path_full} | screenshot | ${today} | Stage and match art |`);
}
console.log(rows.join("\n"));
