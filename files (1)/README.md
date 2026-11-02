# Glow A-eye — voice-first skincare assistant (YouCam Skin AI Hackathon)

The screen shows only the live camera. Everything else is spoken.

## Run
```bash
npm install
cp .env.example .env.local   # add YOUCAM_API_KEY
npm run dev                  # http://localhost:3000 (localhost counts as secure for camera/mic)
```
Use **Chrome or Edge** (Web Speech recognition). Safari/Firefox fall back to keyboard controls.
Tap anywhere (or press Enter) once to start: browsers require a gesture before they allow audio and permissions.

## Deploy (Vercel)
1. Push to GitHub, import in Vercel. 2. Add `YOUCAM_API_KEY` in Project Settings > Environment Variables. 3. Deploy. HTTPS is automatic, and the camera needs HTTPS on phones. The API route uses `maxDuration = 60`.

## How it works
- `app/api/analyze/route.ts` + `lib/youcam.ts`: key stays on the server. Flow is `POST /s2s/v2.0/file`, PUT to the returned presigned URL, `POST /s2s/v2.1/task/skin-analysis`, then poll `GET .../{task_id}` until `success` or `error`. Only the `ui_score`/`raw_score` items returned in `results.output` are used. Nothing is invented. Photo bytes stay in memory and are never written to disk.
- `lib/recommend.ts`: a concern counts as flagged when its `raw_score` is under 60 (higher = healthier). Products are ranked by how far below 60 the matching concerns are, then filtered by allergies (key ingredients only) and budget.
- `components/GlowEye.tsx`: voice loop, interruption ("stop"), "repeat", "slower", consent gate, quantity and confirmation flow, keyboard fallback.

## Honest limitations
- **No merchant checkout API is integrated.** Confirming a purchase opens a store *search* page for the product (Amazon search by default). It never claims an order succeeded. For real links, set `buyUrl` per product in `data/products.json`.
- **Prices are `null`** because I can't verify live prices. Fill in `price` yourself and the app will speak it, total it, and filter by budget.
- Ingredient lists are key ingredients only. Allergy filtering is a convenience, not safety advice.
- Skin type is not spoken: its response shape isn't documented in the pages I checked.
- Default scan = 8 SD concerns = 12 YouCam units. Change with `YOUCAM_CONCERNS` (SD names only, never mix with `hd_`).
- Face-framing guidance uses the browser `FaceDetector` (Chrome Android). Elsewhere it falls back to a spoken countdown.
- Continuous speech recognition while the device speaks can pick up its own voice on some phones. Echo is filtered, and headphones help.
