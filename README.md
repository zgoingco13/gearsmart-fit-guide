# Fit Guide v0.1 — Prototype Draft 1

GearSmart Fit Guide. Marker-based AR + Claude-driven coaching, running in the browser.
**Week 13 deliverable for AI in Design Practice.**

## What's in this folder

| File | What it is | What it does |
|---|---|---|
| **`preview.html`** | **Static demo (safe for Zoom)** | Click-through prototype showing the AR overlay UI. Runs on your laptop. No camera, no compile needed. **Use this on screen-share.** |
| `index.html` | The current homepage (v2) | MoveNet pose detection over CDN. Front camera, mirrored. Stance-held torso bucket + per-step gesture-advance for the four gear steps. No marker. |
| `v1-marker.html` | The v1 marker AR scene | MindAR + A-Frame. Scans a printed marker through your phone camera and overlays the AR coach. |
| `marker.png` | Printable AR marker | Print at ~4 in × 4 in (10 cm). Tape to your bag. |
| `marker.mind` | Compiled tracking file | **You generate this** — see "Compile the marker" below. |
| `fit-guide-mock.json` | Stand-in for Claude API | What `/api/fit-guide` will return in production. Powers the coaching text. |

## Recommended demo plan for tomorrow's 1-on-1

You have ~8 minutes. Lead with the deck (4 slides), then screen-share `preview.html` for the visual demo. If there's time and Sunny asks "can you show the actual AR?" — open `v1-marker.html` on your phone (see Run the live AR below). If the live AR fails for any reason, the preview already told the story.

```
 0:00 ─ open deck slide 1
 0:30 ─ slide 2 (the pivot)
 2:00 ─ slide 3 (what's built)
 3:30 ─ screen-share preview.html, click through 3 steps
 5:00 ─ slide 4 (week 14 plan + discussion qs)
 6:30 ─ Q&A / direction conversation
```

---

## Run the preview (laptop, no setup)

```bash
# from this folder
open preview.html
# or just double-click it
```

That's it. It's a single HTML file. Use this for the Zoom demo.

---

## Run the live AR (phone + laptop)

The real AR scene needs three things:
1. A served (not file://) page, over **HTTPS or localhost** — browsers refuse camera access on plain `http://`
2. The compiled `marker.mind` file in this folder
3. A printed `marker.png` taped to your bag

### Step 1 — Compile the marker

MindAR ships a free web compiler. Open this URL on your laptop:

> https://hiukim.github.io/mind-ar-js-doc/tools/compile

- Drop `marker.png` onto the page
- Click **Start**
- Wait ~10 sec
- Click **Download**
- Save the file as `marker.mind` in this folder

(You only do this once. The file is portable.)

### Step 2 — Print the marker

Print `marker.png` at roughly **4 inches square** (≈ 10 cm). Tape it to your bag where you'd want fit guidance — for the Patagonia Black Hole MLC, that's the shoulder strap or sternum strap area.

### Step 3 — Serve the files locally with HTTPS

MindAR needs HTTPS for the camera. The easiest way on macOS:

```bash
# from this folder
npx http-server -S -C cert.pem -K key.pem -p 8080
```

If you don't have a cert, generate one quickly:

```bash
# generate self-signed cert (one-time)
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
```

**Easier alternative — Vercel/Netlify drag-and-drop.** Both will give you an HTTPS URL in 30 seconds:
- https://app.netlify.com/drop — drag this folder onto the page, get a `https://...netlify.app` URL
- Visit that URL on your phone — done.

### Step 4 — Open on your phone

1. Make sure your laptop and phone are on the same WiFi
2. Find your laptop's local IP: `ipconfig getifaddr en0` on macOS
3. On your phone, open Safari (iOS) or Chrome (Android):
   `https://<your-laptop-ip>:8080/v1-marker.html`
   (Plain `:8080` now serves v2 — the front-camera pose mode — which doesn't use the marker.)
   (You'll get a security warning because of the self-signed cert — tap "Advanced" → "Proceed")
4. Tap **Start camera**
5. Grant camera permission
6. Point at the printed marker — overlays should appear

If Netlify-drop: just visit the netlify.app URL on your phone, no IP needed.

---

## How the AI fits in

Right now `fit-guide-mock.json` is static. In production this file is replaced by a `fetch('/api/fit-guide?model=patagonia_black_hole_mlc')` call against the live Vercel function. That function:

1. Receives `{ model_id, user_measurements }` from the browser
2. Pulls the pack's spec sheet from a static catalog (or scrapes it once and caches)
3. Calls Claude with `tool_use`, returning a `fit_steps` tool result
4. Returns the structured JSON to the browser

Same architecture as GearSmart's existing `/api/gear-list` endpoint — that's the point. **The AI workflow is reusing infrastructure I already built, not inventing something new.** Week 14 task is wiring this up live; week 13 ships the mock so the UI can be tested independently.

---

## Known issues / scope notes

- iOS Safari 17+ sometimes needs a hard reload after granting camera permission
- The marker tracking is sensitive to lighting — overhead light is fine, backlit marker isn't
- The AR overlays are placeholders (orange arrow, lime target rectangle) — Week 14 will style them properly per pack
- No body tracking — that's deliberate (week 14 stretch goal with Teachable Machine if marker-only works first; now shipped in v2 via MoveNet (not the originally-floated Teachable Machine) — pose mode, the homepage)

---

*Z Goingco · AI in Design Practice · Spring 2026 · Week 13*
