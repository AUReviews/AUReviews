// Fails when any tracked file contains an em dash (U+2014). See AGENTS.md, "No em dashes".
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const EM_DASH = "\u2014";
const SKIP = [/^package-lock\.json$/, /\.lock$/, /^scripts\/check-emdash\.mjs$/];

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\0")
  .filter((f) => f && isFile(f) && !SKIP.some((re) => re.test(f)));

let hits = 0;
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.includes(EM_DASH)) {
      hits++;
      console.error(`${file}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (hits > 0) {
  console.error(`\n${hits} em dash(es) found. Rewrite the sentence; see AGENTS.md, "No em dashes".`);
  process.exit(1);
}
