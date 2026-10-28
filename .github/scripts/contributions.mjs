// Saves the GitHub contribution calendar as JSON for the portfolio site.
// Usage: GITHUB_TOKEN=... node contributions.mjs <username> <outDir>
// Set MOCK=1 to write random data without calling the API.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [user, outDir = "dist"] = process.argv.slice(2);
if (!user) throw new Error("username is required");

const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

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
      const level = Object.keys(LEVEL)[Math.min(4, Math.ceil(count / 4))];
      total += count;
      contributionDays.push({ date: date.toISOString().slice(0, 10), contributionCount: count, contributionLevel: level });
    }
    weeks.push({ contributionDays });
  }
  return { totalContributions: total, weeks };
}

const cal = await fetchCalendar();
// Days as [date, count, level 0-4], oldest first; the first day is always a Sunday.
const days = cal.weeks.flatMap((w) =>
  w.contributionDays.map((d) => [d.date, d.contributionCount, LEVEL[d.contributionLevel] ?? 0]));
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "github-contributions.json"),
  JSON.stringify({ user, total: cal.totalContributions, updated: new Date().toISOString(), days }));
console.log(`${cal.totalContributions} contributions saved to ${outDir}`);
