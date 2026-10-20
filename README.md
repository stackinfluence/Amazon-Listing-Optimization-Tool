# Free Amazon Listing Optimization Tool (Stack Influence)

Type B1 tool. Checks an Amazon listing against Amazon's current rules and scores it
0-100. An optional AI button rewrites the title to the limit and moves overflow
details into Item Highlights.

- Rule checks run 100% client-side in `index.html` (no API cost).
- The "Rewrite my title" button calls `/.netlify/functions/listing-rewrite`, which
  holds `ANTHROPIC_API_KEY` server-side. Model: `claude-sonnet-4-6`.
- Height key for the Webflow embed: `siListOptHeight`.

## Files

```
index.html                              the tool
netlify.toml                            publish + functions config, iframe headers
netlify/functions/listing-rewrite.js    AI title rewrite (POST only)
```

Keep `netlify/functions/` exactly as is, or the function returns 404.

## Deploy

1. Create a new GitHub repo and upload the files from the GitHub zip.
2. In Netlify: Add new site > Import an existing project > pick the repo.
   Build command: leave empty. Publish directory: `.`
3. Site configuration > Environment variables > add `ANTHROPIC_API_KEY`.
4. Deploys > Trigger deploy > Clear cache and deploy site. Env vars only apply
   on a fresh deploy.
5. Open the site, click "Load an example listing", then "Rewrite my title" to
   confirm the function works.
6. Send the Netlify URL back so the embed snippet can be finalized.

## Debugging the AI button

If the rewrite fails, open devtools > Console. The tool logs the function's
response, including `detail` with the real upstream error:

- `invalid x-api-key` / "API key is invalid": key is wrong or was mangled when pasted.
- Status 402 or a credit message: the Anthropic account has no credit.
- "model not found": the model string needs updating in `listing-rewrite.js`.
- "ANTHROPIC_API_KEY is missing": add the env var and redeploy.

## What gets checked (sources checked October 20, 2026)

| Field | Rules |
|---|---|
| Title | 75 chars for non-media since July 27, 2026 (200 with the media toggle); banned ! $ ? _ { } ^ and two more symbols unless in the brand name; no word more than twice (plurals count); promotional words; emojis; all caps; brand first; ASINs or links |
| Item Highlights | 125 chars; hidden while the title is over 75; repeats of title words; promo words |
| Bullets | At least 3; over 255 (warning) or 500 (fail); restricted symbols and emojis (Aug 15, 2024 rules); prohibited claims (eco-friendly, antibacterial, made from bamboo or soy and similar); refund or guarantee language; links |
| Description | 2,000 chars; links or ASINs; promo words |
| Backend terms | 249 bytes (counted as UTF-8 bytes); commas; words already in the title; repeats |

## Tuning

All limits are in the `LIM` object near the top of the script. Word lists are
`TITLE_BANNED`, `BULLET_SPECIAL`, `PROMO`, `BANNED_PHRASES` and `GUARANTEE_RE`.
Deduction points sit on each check (`pts`). Verdicts: 90+ Ready to publish,
75-89 A few fixes, 50-74 Needs work, under 50 At risk.

When Amazon changes a rule, update `LIM` or the lists, update the source line at
the bottom of the results, and redeploy.

## Iframe headers

`netlify.toml` only allows framing from stackinfluence.com and Webflow domains.
If the tool needs to be embedded anywhere else, add that domain to
`frame-ancestors`.

## Rules for edits

All source files must stay 100% ASCII. Check with:

```
python3 -c "d=open('index.html','rb').read(); print(len([x for x in d if x>127]))"
node --check netlify/functions/listing-rewrite.js
```
