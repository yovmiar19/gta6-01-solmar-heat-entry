# SOLMAR HEAT

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/yovmiar19/gta6-01-solmar-heat-entry/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/yovmiar19/gta6-01-solmar-heat-entry/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

SOLMAR HEAT — a 3D open-world crime game in the spirit of GTA 6, set in the sun-soaked city of Solmar Bay. Rebuilt step by step, like the top entry: step 1 is the protagonist Raka on foot, a smooth third-person chase camera, WASD movement and a living city (streets, buildings, lamps, palms, golden-hour sun and haze). Cars, police, combat and missions come in the next steps.

## Step 14 — Sun Idols + Stunt Jumps

- **Sun Idols:** 30 gold idols hidden across the seven districts (Lantern Mile 5, Old Pasaru 4, Lantawa Centre 4, Banyan Green 4, Market Row 4, Wanaru Terraces 4, Kumala Strand 5) — on the streets, up a jump's height over crates, seawalls and the beach arch, and over the two boats' decks. Each one bobs, spins and glows; walking into one pays $25 and warms its district by 2 standing. The radar shows a gold blip for every idol within ~150 m, and the HUD counts the haul (☀ SUN IDOLS n / 30). Every 10 unlock a reward: 10 repaints the Sunset GT gold, 20 gives Raka a gold jacket (+$500), all 30 turn the phone gold (+$1,000). Progress saves to the save slots.
- **Stunt Jumps:** 10 hot-pink ramps with yellow chevrons and STUNT signs — 3 on the main coastal highway, 2 on the boardwalk, 2 on the hill cross streets, 1 off the harbour dock toward the Speedboat, 1 by the car park, 1 bonus by the airfield fence. Hit one at 60 km/h or more to launch: the camera pulls back and wobbles, air time runs ~0.8–2 s, and the landing is scored by air time + 150 per full 90° spun in the air + 100 for a clean landing (wheels down within ~15° of a square spin, no wall clipped, still rolling). Clean landings pay cash and chain for +25% each; rough landings pay half the score and no cash; clipping a building mid-air crashes the run. Each ramp rests 20 s after a launch, and the best score per ramp (and overall) is saved.

## Run it

```sh
python3 -m http.server 8080 --directory game
# then open http://localhost:8080
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=fxhpcc3x&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
