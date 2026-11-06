# @divine-creative-ministries/bible-core

Shared, dependency-free Bible primitives used by the `bible` CLI, the Bible CLI
mobile app, and the `my.biblecli.org` gateway.

- `canon`: the 66-book canon, aliases, and BBCCCVVV verse-id helpers
  (verse 0 is a Psalm superscription).
- `refparse`: a forgiving reference parser (`"jn 3 16"`, `"Gen 1:1-2:3"`) and scope parser.
- `format`: canonical display of verse ids and ranges (`John 15:4–5`).
- `units`: reading-plan units (chapters, or character-budgeted chunks).
- `parsing`: plain-English labels for decoded Hebrew/Greek morphology.

Constraints: ESM, zero runtime dependencies, no Node APIs (runs in Node,
Cloudflare Workers, and React Native/Hermes).
