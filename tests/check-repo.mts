import { assembleDraft, hasUnpublishedChanges, latestPublished } from "../lib/repo/sites";
const d = await assembleDraft("demo");
console.log("pages", d!.site.pages.length, "hidden", d!.hidden.length);
console.log("unpublished?", await hasUnpublishedChanges("demo"));
const p = await latestPublished("demo");
console.log("live version", p!.id, p!.site.products.length);
process.exit(0);
