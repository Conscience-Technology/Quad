# Recording the hero GIF (when you're ready)

The current hero in the README is an animated SVG flow diagram. A real
screen-recorded GIF beats it for HN / Twitter / first impressions. Aim
for **45–60 seconds**, **≤ 8 MB**, **1280×720**.

## Script

| Sec | Frame | What's happening |
|---:|---|---|
| 0–3 | host app (acme-web staging) | normal use — a few clicks |
| 3–4 | `⌘⇧B` toggle | tiny toast appears: *"Bug Mode ON"* |
| 4–8 | hover over the broken **Pay** button | violet outline + `PayNowButton · src/.../PayNowButton.tsx` label |
| 8–10 | `⌥+Click` | floating pin form opens, type "blank screen on click" |
| 10–11 | press `⌘⏎` | toast: *"Pin saved"*, form closes |
| 11–13 | `⌘⇧R` | confirm "Screen + voice", grant permission |
| 13–25 | reproduce + narrate | *"so I click here… and it goes blank"* (12s) |
| 25–26 | press ■ Stop on the floating bar | upload |
| 26–28 | jump to the Quad dashboard | the bug appears in **Inbox** column |
| 28–30 | click the card | video player + transcript sidebar visible |
| 30–32 | scrub video; transcript segments highlight in sync | |
| 32–33 | click **Confirm → Task** | navigates to the task page, brief markdown renders |
| 33–36 | switch to terminal / Claude Code in a repo | |
| 36–37 | type: *"pick the next quad task and fix it"* | |
| 37–55 | Claude Code runs `quad_pick_task`, reasons over frames, edits PayNow.tsx, opens a PR | |
| 55–60 | back to Quad task → status flips to **pr_open**, PR URL appears | |

## Tools

- **Cleanshot X** (Mac) or **OBS** (cross-platform) for recording
- **gifski** (`brew install gifski`) — ffmpeg → gif with best quality at
  small size
- **mp4 → gif**:
  ```bash
  ffmpeg -i hero.mp4 -vf "fps=15,scale=1280:-1" -f image2pipe -vcodec ppm - | \
    gifski --fps 15 --width 1280 -o hero.gif -
  ```
- Target: ≤ 8 MB (GitHub README inlining cap is 10 MB)

## Where to save

- `.github/assets/hero.gif` (replace the SVG `src` in README's hero block)
- Keep the SVG around as the fallback — some viewers (RSS readers,
  some IDE previews) handle SVG better than GIF.

## Don't

- Don't show real bug reports from real users.
- Don't include the OPENAI_API_KEY anywhere on screen.
- Don't speed it up beyond 1.5×. The narrative needs to land.
- Don't add background music. HN people watch with sound off.
