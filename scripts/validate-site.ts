import { loadRawSite } from "../lib/site-data";
import { validateSite } from "../schema/validate";

const dir = process.argv[2]; // optional: another data folder
const { issues } = validateSite(loadRawSite(dir));
const errors = issues.filter((i) => i.level === "error");
const warnings = issues.filter((i) => i.level === "warning");
for (const i of issues) console.log(`${i.level.toUpperCase().padEnd(7)} ${i.where}: ${i.message}`);
console.log(`\nSite data: ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
