// Commit City: turns the last year of GitHub contributions into an animated
// pixel skyline. Each week is a building (taller = more commits) and a little
// dev runs across the rooftops, lighting windows and collecting commit coins.
//
// Usage:
//   GITHUB_TOKEN=... node generate.mjs <username> <outDir>
//   node generate.mjs --mock <outDir>      (random data, for local previews)

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 880;
const H = 230;
const GROUND = 205;
const MARGIN = 16;
const BW = 12; // building width
const GAP = 4;
const MIN_H = 5;
const MAX_H = 120;
const RUN = 14; // seconds the runner spends crossing
const TOTAL = 17; // full loop, including the pause at the end

const THEMES = {
  light: {
    skyTop: "#dff1ff", skyBottom: "#ffffff", text: "#24292f", muted: "#57606a",
    levels: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
    windowOff: "#ffffff", windowOn: "#ffd33d", ground: "#d0d7de",
    coin: "#f2b400", coinEdge: "#b58500", orb: "#ffd33d", stars: false,
  },
  dark: {
    skyTop: "#010409", skyBottom: "#161b22", text: "#e6edf3", muted: "#8b949e",
    levels: ["#21262d", "#0e4429", "#006d32", "#26a641", "#39d353"],
    windowOff: "#0d1117", windowOn: "#f9d71c", ground: "#30363d",
    coin: "#f9d71c", coinEdge: "#b58500", orb: "#e6edf3", stars: true,
  },
};

async function fetchWeeks(user, token) {
  const query = `query($login:String!){user(login:$login){contributionsCollection{
    contributionCalendar{totalContributions weeks{contributionDays{contributionCount date}}}}}}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: user } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
  const cal = json.data.user.contributionsCollection.contributionCalendar;
  return cal.weeks.map((w) => ({
    date: w.contributionDays[0].date,
    count: w.contributionDays.reduce((s, d) => s + d.contributionCount, 0),
  }));
}

function mockWeeks() {
  const start = new Date(Date.now() - 52 * 7 * 864e5);
  return Array.from({ length: 53 }, (_, i) => ({
    date: new Date(start.getTime() + i * 7 * 864e5).toISOString().slice(0, 10),
    count: Math.random() < 0.2 ? 0 : Math.floor(Math.random() ** 2 * 40),
  }));
}

// Deterministic pseudo-random so stars don't jump around between daily runs.
function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

const pct = (t) => ((t / TOTAL) * 100).toFixed(2);

function layout(weeks) {
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const nonZero = weeks.map((w) => w.count).filter(Boolean).sort((a, b) => a - b);
  const q = (f) => nonZero[Math.floor(f * (nonZero.length - 1))] ?? 0;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const x0 = (W - weeks.length * (BW + GAP) + GAP) / 2;
  return weeks.map((w, i) => ({
    ...w,
    x: x0 + i * (BW + GAP),
    h: Math.round(MIN_H + Math.sqrt(w.count / max) * (MAX_H - MIN_H)),
    level: w.count === 0 ? 0 : 1 + cuts.filter((c) => w.count > c).length,
  }));
}

// Height of the runner's feet at horizontal position x.
function feetY(bs, x) {
  const roof = (b) => GROUND - b.h;
  for (let i = 0; i < bs.length; i++) {
    const b = bs[i];
    const next = bs[i + 1];
    const takeoff = b.x + BW * 0.6;
    if (x < b.x && i === 0) return GROUND;
    if (x >= b.x && x <= takeoff) return roof(b);
    if (!next) return x <= b.x + BW ? roof(b) : GROUND;
    const land = next.x + BW * 0.4;
    if (x > takeoff && x < land) {
      const s = (x - takeoff) / (land - takeoff);
      const y0 = roof(b);
      const y1 = roof(next);
      const lift = 10 + Math.abs(y0 - y1) * 0.6;
      return y0 + (y1 - y0) * s - 4 * lift * s * (1 - s);
    }
  }
  return GROUND;
}

function render(weeks, t) {
  const bs = layout(weeks);
  const total = weeks.reduce((s, w) => s + w.count, 0);
  const best = bs.reduce((a, b) => (b.count > a.count ? b : a), bs[0]);
  const startX = MARGIN - 20;
  const endX = W + 20;
  const timeAt = (x) => ((x - startX) / (endX - startX)) * RUN;

  const css = [];
  const out = [];

  // Runner motion: sample every 2px so the jumps stay smooth.
  const frames = [];
  for (let x = startX; x <= endX; x += 2) {
    frames.push(`${pct(timeAt(x))}%{transform:translate(${x}px,${feetY(bs, x).toFixed(1)}px)}`);
  }
  frames.push(`100%{transform:translate(${endX}px,${GROUND}px)}`);
  css.push(`@keyframes run{${frames.join("")}}`);
  css.push(`.runner{animation:run ${TOTAL}s linear infinite}`);
  css.push(`@keyframes legA{0%,49%{opacity:1}50%,100%{opacity:0}}`);
  css.push(`@keyframes legB{0%,49%{opacity:0}50%,100%{opacity:1}}`);
  css.push(`.legA{animation:legA .24s steps(1) infinite}.legB{animation:legB .24s steps(1) infinite}`);
  css.push(`@keyframes twinkle{0%,100%{opacity:.25}50%{opacity:1}}`);
  css.push(`@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}`);
  css.push(`.bob{animation:bob 1.2s ease-in-out infinite}`);
  css.push(`text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}`);

  out.push(`<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${t.skyTop}"/><stop offset="1" stop-color="${t.skyBottom}"/></linearGradient></defs>`);
  out.push(`<rect width="${W}" height="${H}" rx="8" fill="url(#sky)"/>`);

  if (t.stars) {
    const r = rng(42);
    for (let i = 0; i < 45; i++) {
      const d = (r() * 3).toFixed(2);
      out.push(`<rect x="${(r() * W) | 0}" y="${(r() * 110 + 30) | 0}" width="1.5" height="1.5" fill="#e6edf3" style="animation:twinkle 3s ${d}s infinite"/>`);
    }
  }
  out.push(`<circle cx="${W - 60}" cy="52" r="14" fill="${t.orb}" opacity=".9"/>`);
  if (t.stars) out.push(`<circle cx="${W - 54}" cy="47" r="12" fill="${t.skyTop}"/>`);

  out.push(`<text x="${MARGIN}" y="26" font-size="13" font-weight="700" fill="${t.text}">COMMIT CITY</text>`);
  out.push(`<text x="${MARGIN}" y="43" font-size="11" fill="${t.muted}">${total.toLocaleString("en-US")} contributions · tallest tower: ${best.count} (week of ${best.date})</text>`);

  out.push(`<rect x="0" y="${GROUND}" width="${W}" height="2" fill="${t.ground}"/>`);

  bs.forEach((b, i) => {
    const top = GROUND - b.h;
    const arrive = pct(timeAt(b.x + BW / 2));
    const lit = (+arrive + 0.6).toFixed(2);
    out.push(`<rect x="${b.x}" y="${top}" width="${BW}" height="${b.h}" fill="${t.levels[b.level]}"/>`);

    const off = [];
    for (let y = top + 4; y + 3 <= GROUND - 3; y += 6) {
      off.push(`<rect x="${b.x + 2}" y="${y}" width="3" height="3"/><rect x="${b.x + 7}" y="${y}" width="3" height="3"/>`);
    }
    if (off.length) {
      out.push(`<g fill="${t.windowOff}" opacity=".55">${off.join("")}</g>`);
      css.push(`@keyframes l${i}{0%,${arrive}%{opacity:0}${lit}%,97%{opacity:1}100%{opacity:0}}`);
      out.push(`<g fill="${t.windowOn}" style="animation:l${i} ${TOTAL}s linear infinite">${off.join("")}</g>`);
    }

    if (b.count > 0) {
      const cy = top - 9;
      css.push(`@keyframes c${i}{0%,${arrive}%{opacity:1;transform:translateY(0)}${lit}%{opacity:0;transform:translateY(-10px)}97%{opacity:0;transform:translateY(0)}100%{opacity:1}}`);
      out.push(`<g style="animation:c${i} ${TOTAL}s linear infinite"><g class="bob"><circle cx="${b.x + BW / 2}" cy="${cy}" r="3.2" fill="${t.coin}" stroke="${t.coinEdge}" stroke-width=".8"/></g></g>`);
    }
  });

  // Pixel dev in a hoodie, feet at the group origin. 1 unit = 1.5px.
  const px = (x, y, w, h, fill, cls = "") =>
    `<rect ${cls && `class="${cls}"`} x="${x * 1.5}" y="${y * 1.5}" width="${w * 1.5}" height="${h * 1.5}" fill="${fill}"/>`;
  out.push(`<g class="runner"><g transform="translate(-6,0)">
${px(1, -11, 5, 2, "#3b2a20")}${px(1, -9, 5, 3, "#f1c27d")}${px(4, -8, 1, 1, "#24292f")}
${px(0, -6, 7, 4, "#1f6feb")}${px(6, -5, 2, 1, "#f1c27d")}
${px(1, -2, 2, 2, "#24292f", "legA")}${px(4, -2, 2, 2, "#24292f", "legA")}
${px(0, -2, 2, 2, "#24292f", "legB")}${px(5, -2, 2, 2, "#24292f", "legB")}
</g></g>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>${css.join("\n")}</style>
${out.join("\n")}
</svg>
`;
}

const args = process.argv.slice(2);
const mock = args[0] === "--mock";
const outDir = args[1] ?? "dist";
const weeks = mock ? mockWeeks() : await fetchWeeks(args[0], process.env.GITHUB_TOKEN);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "commit-city.svg"), render(weeks, THEMES.light));
writeFileSync(join(outDir, "commit-city-dark.svg"), render(weeks, THEMES.dark));
console.log(`Wrote Commit City for ${weeks.length} weeks to ${outDir}`);
