# GSC verification for bluecollartechy.com

Status (2026-10-13): in tektongrowth@gmail.com's Search Console, `sc-domain:bluecollartechy.com` shows **siteUnverifiedUser**. `index.html` already has a google-site-verification meta tag (`1PGlKAnN...`), but it's probably tied to a different Google account (teleomedia@gmail.com, per GSC-AEO-SETUP.md).

Why this PR is a draft: the Composio Search Console connector has no Site Verification API (getToken), so the token for tektongrowth@gmail.com couldn't be fetched automatically.

## To finish (pick one)
1. **Meta tag (URL-prefix property `https://bluecollartechy.com/`)**: In Search Console, signed in as tektongrowth@gmail.com, go to the property, then Settings > Ownership verification > HTML tag. Copy the content value and replace the placeholder comment in `index.html` with that tag. Merge (Cloudflare Pages auto-deploys main), then click Verify.
2. **HTML file**: download `googleXXXX.html` from the same screen, commit it at the repo root, merge, then Verify.
3. **Domain property (best)**: add the TXT record at the bluecollartechy.com DNS. The zone is not in the Cloudflare accounts we can reach, so its owner/GHL DNS has to add it.
4. Or, as the owner (teleomedia@gmail.com if that account verified it), add tektongrowth@gmail.com as an Owner in Search Console > Settings > Users and permissions. No code change is needed for this.

After verification: submit `https://bluecollartechy.com/sitemap.xml`.
