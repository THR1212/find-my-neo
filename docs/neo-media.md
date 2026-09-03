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
| `templates/studio.webp` | `…/674db18c56a1cbebbcefacb6_template-horizontal-scroll1.webp` |
| `templates/storefront.webp` | `…/674db18b27bed59220306062_template-horizontal-scroll3.webp` |
| `templates/services.webp` | `…/674db18bf9d959ec7aaf732a_template-horizontal-scroll5.webp` |
| `templates/hospitality.webp` | `…/674db18b57c47c10cf39c84a_template-horizontal-scroll6.webp` |

Template shots share the prefix `https://cdn.prod.website-files.com/6380708edae368c5674306ee`.

## Re-encoding

The originals are marketing masters — 1000×800 and 1600×1020, **29 MB of video in total**, with
`ED.mp4` alone at 18 MB. They render in a card about 150 px wide, so shipping them untouched
would put 29 MB in the repo and on the wire to show a thumbnail. Re-encoded, the whole folder is
**under 900 KB**.

Audio is stripped because these autoplay muted and a silent track is bytes for nothing.
`+faststart` moves the index to the front so playback can begin before the file is complete.

```bash
# Video: 640px wide, no audio, 24fps
ffmpeg -y -i "$SRC" -an \
  -vf "scale=640:-2:flags=lanczos,fps=24" \
  -c:v libx264 -profile:v main -pix_fmt yuv420p \
  -crf 30 -preset slow -movflags +faststart \
  "public/neo/videos/$NAME.mp4"

# Template shots: 560px wide
ffmpeg -y -i "$SRC" -vf "scale=560:-1:flags=lanczos" -quality 72 \
  "public/neo/templates/$NAME.webp"
```

## Refreshing

Re-download from the table above and re-run the commands. If a URL 404s, open neo.space and
re-read the markup — these are marketing assets and Neo renames them on redeploy. Check that
the product name in `src/lib/neoMedia.ts` still matches Neo's feature catalogue
(`https://static.flock.co/meta/plan/feature/config/en-US.json`) before shipping a renamed one.

`Website_Launch.mp4` (30 MB, the AI site builder film) is deliberately **not** vendored: nothing
renders it, and the reveal already shows a real generated site for that half of the product.
