// Renders the GitHub contribution calendar as light and dark SVGs.
// Usage: GITHUB_TOKEN=... node contribution-graph.mjs <username> <outDir>
// Set MOCK=1 to render random data without calling the API.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [user, outDir = "dist"] = process.argv.slice(2);
if (!user) throw new Error("username is required");

const THEMES = {
  light: {
    bg: "#FFFFFF", border: "#E5E7EB", title: "#111827", text: "#6B7280",
    levels: ["#EEF2F7", "#BAE6FD", "#7DD3FC", "#38BDF8", "#0284C7"],
  },
  dark: {
    bg: "#0B0F1A", border: "#1F2937", title: "#E5E7EB", text: "#9CA3AF",
    levels: ["#161E2E", "#0C4A6E", "#0369A1", "#0EA5E9", "#38BDF8"],
  },
};
const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function fetchCalendar() {
  if (process.env.MOCK) return mockCalendar();
  const query = `query($login: String!) {
    user(login: $login) { contributionsCollection { contributionCalendar {
      totalContributions
      weeks { contributionDays { date contributionCount contributionLevel } }
    } } }
  }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login: user } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
  return json.data.user.contributionsCollection.contributionCalendar;
}

function mockCalendar() {
  const weeks = [];
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 364 - start.getUTCDay());
  let total = 0;
  for (let w = 0; w < 53; w++) {
    const contributionDays = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getTime() + (w * 7 + d) * 864e5);
      if (date > new Date()) break;
      const count = Math.random() < 0.35 ? 0 : Math.floor(Math.random() ** 2 * 15);
      const level = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"][Math.min(4, Math.ceil(count / 4))];
      total += count;
      contributionDays.push({ date: date.toISOString().slice(0, 10), contributionCount: count, contributionLevel: level });
    }
    weeks.push({ contributionDays });
  }
  return { totalContributions: total, weeks };
}

function render(cal, t) {
  const cell = 11, step = 14, left = 40, top = 62, pad = 24;
  const width = left + cal.weeks.length * step + pad - 3;
  const height = top + 7 * step + 40;
  const font = `font-family="'Segoe UI',Ubuntu,Helvetica,Arial,sans-serif"`;
  const out = [];

  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${cal.totalContributions} contributions in the last year">`);
  out.push(`<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="12" fill="${t.bg}" stroke="${t.border}"/>`);
  out.push(`<text x="${pad}" y="32" ${font} font-size="15" font-weight="600" fill="${t.title}">${cal.totalContributions.toLocaleString("en-US")} contributions in the last year</text>`);

  // Label each month at the week it starts; drop labels too close to the next one.
  const starts = [];
  cal.weeks.forEach((week, w) => {
    const first = week.contributionDays[0];
    if (!first) return;
    const month = new Date(first.date).getUTCMonth();
    if (starts.at(-1)?.month !== month) starts.push({ w, month });
  });
  starts.forEach(({ w, month }, i) => {
    const next = starts[i + 1]?.w ?? cal.weeks.length;
    if (next - w < 3) return;
    out.push(`<text x="${left + w * step}" y="${top - 8}" ${font} font-size="10" fill="${t.text}">${MONTHS[month]}</text>`);
  });
  [["Mon", 1], ["Wed", 3], ["Fri", 5]].forEach(([label, d]) => {
    out.push(`<text x="${pad - 6}" y="${top + d * step + 9}" ${font} font-size="10" fill="${t.text}">${label}</text>`);
  });

  cal.weeks.forEach((week, w) => {
    for (const day of week.contributionDays) {
      const d = new Date(day.date).getUTCDay();
      const fill = t.levels[LEVEL[day.contributionLevel] ?? 0];
      const plural = day.contributionCount === 1 ? "" : "s";
      out.push(`<rect x="${left + w * step}" y="${top + d * step}" width="${cell}" height="${cell}" rx="2" fill="${fill}"><title>${day.contributionCount} contribution${plural} on ${day.date}</title></rect>`);
    }
  });

  const legendY = top + 7 * step + 14;
  const legendX = width - pad - 5 * step - 32;
  out.push(`<text x="${legendX - 30}" y="${legendY + 9}" ${font} font-size="10" fill="${t.text}">Less</text>`);
  t.levels.forEach((c, i) => out.push(`<rect x="${legendX + i * step}" y="${legendY}" width="${cell}" height="${cell}" rx="2" fill="${c}"/>`));
  out.push(`<text x="${legendX + 5 * step + 4}" y="${legendY + 9}" ${font} font-size="10" fill="${t.text}">More</text>`);
  out.push(`</svg>`);
  return out.join("\n");
}

const cal = await fetchCalendar();
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "github-contributions.svg"), render(cal, THEMES.light));
writeFileSync(join(outDir, "github-contributions-dark.svg"), render(cal, THEMES.dark));
console.log(`${cal.totalContributions} contributions rendered to ${outDir}`);
