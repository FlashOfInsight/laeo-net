# laeo.net

Personal site for Laeo Crnkovic-Rubsamen, hosted at [laeo.net](https://laeo.net).

Built as a static site on Cloudflare Pages. No build step — everything in `public/` is served directly.

---

## Structure

```
laeo-net/
├── public/                        # Static assets (Cloudflare Pages output dir)
│   ├── index.html                 # Homepage
│   ├── styles.css                 # Homepage styles
│   ├── _headers                   # Cloudflare security headers
│   ├── favicon.ico                # Favicon (Statue of Liberty)
│   ├── favicon.svg
│   ├── favicon-96x96.png
│   ├── apple-touch-icon.png
│   ├── web-app-manifest-192x192.png
│   ├── web-app-manifest-512x512.png
│   ├── site.webmanifest
│   └── amendments/                # Constitutional Amendment Tracker (subpath app)
│       ├── index.html             # Tracker frontend
│       └── styles.css             # Tracker styles
└── functions/                     # Cloudflare Pages Functions (serverless)
    └── amendments/
        └── api/
            └── amendments.js      # API: fetches from Congress.gov, caches in KV
```

---

## Pages

### Homepage — `laeo.net`
Sections (top to bottom):
- **Projects** — NYC Civic Calendar, Constitutional Amendment Tracker
- **Writing** — links to Substack
- **Appearances** — press, interviews, podcast appearances
- **About**

### Amendment Tracker — `laeo.net/amendments`
Fetches all proposed constitutional amendments from the 119th Congress via the Congress.gov API. Filters HJRes and SJRes bills by title. Shows sponsor, cosponsors, status, and a link to Congress.gov.

Has a "← laeo.net" back-link in the nav.

---

## Cloudflare Setup

### Pages Project
- **Repo:** `github.com/FlashOfInsight/laeo-net`
- **Build command:** *(none)*
- **Build output directory:** `public`
- **Production branch:** `main`

### Environment Variables
| Variable | Used by | Notes |
|----------|---------|-------|
| `CONGRESS_API_KEY` | `functions/amendments/api/amendments.js` | From api.congress.gov |

### KV Namespace Binding
| Variable name | KV Namespace | Used by |
|---------------|-------------|---------|
| `AMENDMENTS_KV` | `AMENDMENTS_CACHE` | Amendment tracker API — caches Congress.gov responses for 6 hours |

### Custom Domain
- `laeo.net` → Cloudflare Pages (CNAME to `laeo-net.pages.dev`, proxied)
- Registered via Cloudflare Registrar
- DNS managed in Cloudflare dashboard

---

## Amendment Tracker API

**Endpoint:** `GET /amendments/api/amendments`

**Caching:** Results are cached in Cloudflare KV for 6 hours (`CACHE_KEY = "amendments_v1"`). First request after cache expiry fetches fresh data from Congress.gov; all subsequent requests within the window are served from KV instantly with zero subrequests.

**Why KV?** Cloudflare Pages Functions on the free plan allow 50 subrequests per invocation. Fetching ~30 amendments with 1 detail call each = ~32 subrequests, which approaches the limit. KV caching reduces production requests to 1 KV read (free tier: 100k reads/day, 1 GB storage — not a concern at this scale).

**To bust the cache manually:** Go to Cloudflare dashboard → Storage & Databases → KV → `AMENDMENTS_CACHE` → delete the `amendments_v1` key. Next request will repopulate it.

**Congress.gov API key:** Get or renew at [api.congress.gov](https://api.congress.gov). Free, just requires registration.

---

## Deploying Changes

Any push to `main` triggers an automatic Cloudflare Pages deployment. Preview URLs are generated for every push at `*.laeo-net.pages.dev` before the custom domain updates.

```bash
git add -A
git commit -m "your message"
git push
```

---

## Adding Content

### New project card
In `public/index.html`, copy an existing `.project-card` block inside `.project-grid` and update the href, tags, title, description, and link text.

### New appearance
In `public/index.html`, copy an existing `.featured-item` block inside `.featured-list` and update the href, publication, title, and role.

### About section
In `public/index.html`, edit the `<p class="about-text">` paragraph inside `<section class="about">`.

---

## Related Projects

| Project | Repo | URL |
|---------|------|-----|
| NYC Civic Calendar | `github.com/FlashOfInsight/nyc-civic-calendar` | nycciviccalendar.com |
| Constitutional Amendment Tracker | `github.com/FlashOfInsight/constitutional-amendments` | laeo.net/amendments ← now here |

Note: The amendment tracker was migrated off Vercel (`constitutional-amendments-topaz.vercel.app`) and now lives as a subpath of this project. The original Vercel project can be deleted.
