# Neo's own product media, vendored

Everything in `public/neo/videos/` and `public/neo/templates/` is **Neo's own marketing
media**, copied from neo.space rather than hotlinked. Consumed by `src/lib/neoMedia.ts`.

This file lives in `docs/`, not next to the assets: anything under `public/` is copied into
`dist/` and served, and internal notes are not something to publish.

Nothing here was drawn, redrawn, or reinterpreted by us. The rule is the same one that governs
the site generator (`api/_lib/neoSite.ts`): **show Neo's real output, never our impression of
it.** A mock-up of Invoice Builder that we made would be a claim about a product we do not own.

## Why self-hosted rather than hotlinked

The reveal is the screen that has to look finished. Pointing it at a marketing CDN means a
Webflow redeploy or a renamed asset silently empties the right column of the last page. Serving
these ourselves also removes a third-party request from that screen.

## Sources — captured 3 Sep 2026

Video URLs came from the `<video data-src=…>` elements in the "Small business bundle" section
of the neo.space homepage. Template shots are the `template-horizontal-scroll*.webp` reel from
"Beautiful templates, ready for anything".

| Local file | Source |
|---|---|
| `videos/invoice.mp4` | `https://static.flock.co/neo/website/videos/Neo_IB_final.mp4` |
| `videos/bookings.mp4` | `https://static.flock.co/neo/website/videos/Appointment_Booking.mp4` |
| `videos/signature.mp4` | `https://static.flock.co/neo/website/videos/Signature-Builder.mp4` |
| `videos/designer.mp4` | `https://static.flock.co/neo/website/videos/ED.mp4` |
| `videos/apps.mp4` | `https://cdn.prod.website-files.com/6380708edae368c5674306ee/65035c87854b97797c0ad0a7_Fast%20Apps%2002-transcode.mp4` |
| `videos/site.mp4` | `https://static.flock.co/neo/website/videos/Website_Launch.mp4` |
| `templates/studio.webp` | `…/674db18c56a1cbebbcefacb6_template-horizontal-scroll1.webp` |
| `templates/storefront.webp` | `…/674db18b27bed59220306062_template-horizontal-scroll3.webp` |
| `templates/services.webp` | `…/674db18bf9d959ec7aaf732a_template-horizontal-scroll5.webp` |
| `templates/hospitality.webp` | `…/674db18b57c47c10cf39c84a_template-horizontal-scroll6.webp` |

Template shots share the prefix `https://cdn.prod.website-files.com/6380708edae368c5674306ee`.

## Re-encoding

The originals are marketing masters — 1000×800, 1140×720, and 1920×1192, **~58 MB of video in
total**, with `Website_Launch.mp4` at 30 MB and `ED.mp4` at 18 MB. They used to be crushed to
640px / CRF 30 for a ~150 px thumbnail on the mail-only reveal. The wait screen now shows the
same films in an ~880 px hero card, so that encode looked like a stretched GIF.

Re-encoded at the display size: never upscale (`min(1280, iw)`), 30 fps. Mail-reveal
thumbs use CRF 22. The three wait-reel films (`apps`, `site`, `invoice`) use CRF 18 so
inbox and invoice type stay readable in the ~880 px hero card. The folder is about **8.7 MB**.
Audio is stripped because these autoplay muted. `+faststart` moves the index to the front so
playback can begin before the file is complete.

```bash
# Video: up to 1280px wide, no audio, 30fps
ffmpeg -y -i "$SRC" -an \
  -vf "scale='min(1280,iw)':-2:flags=lanczos,fps=30" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p \
  -crf 22 -preset medium -movflags +faststart \
  "public/neo/videos/$NAME.mp4"

# Wait-reel films (apps, site, invoice): same command with -crf 18

# Template shots: 560px wide
ffmpeg -y -i "$SRC" -vf "scale=560:-1:flags=lanczos" -quality 72 \
  "public/neo/templates/$NAME.webp"
```

The wait reel (`WAIT_CLIPS` in `src/lib/neoMedia.ts`) is one flagship per category — Mail
(`apps.mp4`), Site (`site.mp4`), Inbox tools (`invoice.mp4`) — not the full mail catalogue.

## Refreshing

Re-download from the table above and re-run the commands. If a URL 404s, open neo.space and
re-read the markup — these are marketing assets and Neo renames them on redeploy. Check that
the product name in `src/lib/neoMedia.ts` still matches Neo's feature catalogue
(`https://static.flock.co/meta/plan/feature/config/en-US.json`) before shipping a renamed one.
