# Hexhaven

A browser game for 2–8 friends about settling a hex island and trading resources. You roll dice, collect resources, build roads, settlements and cities, trade, and race to 10 points. A second mode, **Crowns & Raiders**, adds city improvements, wardens and raids (see below).

No install step: it needs only Node.js 18+ and has zero dependencies.

## Run it

```bash
npm start
```

Open http://localhost:3000, create a room, and send the invite link to your friends. The host starts the game once everyone has joined.

## Playing with friends

**Same Wi-Fi / same house:** the server prints a `Same Wi-Fi:` address (like `http://192.168.1.20:3000`). Friends open that address. If Windows asks whether to allow Node.js through the firewall, allow it on **private** networks.

**Over the internet (quick):** run a free tunnel next to the server, for example with Cloudflare's `cloudflared`:

```bash
cloudflared tunnel --url http://localhost:3000
```

It prints a public `https://….trycloudflare.com` link. Share the room invite from that address. Your computer has to stay on while you play.

**Over the internet (always-on):** deploy the folder to any Node host (Render, Railway, Fly.io, a VPS). Start command: `npm start`. The server reads `PORT` from the environment. Games are saved to `data/rooms.json`. Set `DATA_DIR` to a persistent disk if your host has one.

## Live deployment

The game runs on Google Cloud Run at https://hexhaven-401668287786.us-central1.run.app.

Every push to `main` triggers [.github/workflows/deploy.yml](.github/workflows/deploy.yml). It runs the bot self-play tests and, if they pass, redeploys to Cloud Run. GitHub signs in to Google with Workload Identity Federation, so no keys are stored. Only this repository's workflows can deploy, using the `github-deployer` service account. A redeploy restarts the server, which ends any game in progress, so push between game nights.

### Which version is running?

- In the game, the small **build** tag in the top bar (also on the home page and in the lobby) shows the commit. Hover it for the Cloud Run revision, build time and server start time.
- The browser console prints `Hexhaven build <commit>` when the page loads.
- `GET /api/version` returns the details, and every API response has an `X-Hexhaven-Build` header.
- Running locally, the server prints the build at startup. `+dirty` means uncommitted changes.

### Getting changes live

- **Server:** every push to `main` deploys automatically, in about a minute. To redeploy without a code change, open the repo's **Actions** tab → *Deploy to Cloud Run* → **Run workflow** on `main`. Don't use **Re-run** on an old run: that deploys that older commit.
- **Players' browsers:** an open page checks the build whenever it reconnects or the tab becomes visible again. If the server is newer, the page reloads itself once (your seat is kept). Script and style links carry the build ID, so browsers never use a stale cached copy.
- A deploy restarts the server, which ends any game in progress.

## Rules summary

| Piece   | Cost                          | Points |
|---------|-------------------------------|--------|
| Road    | Wood + Clay                   | —      |
| Settlement | Wood + Clay + Fleece + Wheat  | 1      |
| City    | 2 Wheat + 3 Iron (upgrades a settlement) | 2 |
| Development card | Fleece + Wheat + Iron  | maybe  |

- **Who goes first:** everyone rolls the dice, and the highest roll starts. Tied players re-roll. Play then goes around the table in lobby order.
- **Setup:** players place a settlement and a road in snake order (1→N, then N→1). Your second settlement pays out one card per neighboring tile.
- **Turn:** roll, collect, then build, trade with players or the bank (4:1, or 3:1 / 2:1 at harbors), and end your turn.
- **Rolling a 7:** anyone holding more than 7 cards discards half. The roller moves the bandit, which blocks that tile, and steals a card from a player who has a building there.
- **Development cards** (each shows its rules text in the game): Guard (move the bandit), Road Crew (2 free roads), Bounty (take any 2), Embargo (collect one resource from everyone), Monument (+1 hidden point). You can play one per turn, but not on the turn you bought it.
- **Awards:** Grand Route (longest road of 5+, +2) and Strongest Watch (3+ Guards, +2).
- **Big games:** with 5+ players the island grows to 37 tiles, with a bigger bank and development-card deck. The optional **builder phase** (off by default; turn it on in the lobby) lets everyone else build between turns.
- **Trading:** the active player makes an offer, which pops up in the top-left corner of everyone's board. Others can accept, decline or send a **counter-offer**, and the offerer picks one.
- **Bank trades** use the same give/want pickers. Each + on the give side adds a full lot at your rate (4, or 3/2 at a harbor ⚓), and every lot buys one card of your choice; several lots can go in one trade.

## Crowns & Raiders

Pick it under **Game mode** in the lobby. It works with 2–8 players, plays to 13 points, and replaces development cards with the rules below. The ℹ️ button in the game lists every rule and edict.

- **Commodities.** A city next to forest, pasture or mountains takes 1 resource + 1 commodity (📃 parchment, 🧵 linen, 🪙 silver) instead of 2 resources.
- **City improvements.** There are three tracks, each with levels 1–5 paid with one commodity: ⚖️ Guild (linen), 📯 Council (silver) and 🔭 Academy (parchment). Level *n* costs *n* cards. Level 3 unlocks a power:
  - Trading Hall: commodities trade 2:1.
  - Citadel: wardens can become Champions.
  - Waterworks: take any resource when a roll gives you nothing.
- **Capitals.** The first to reach level 4 in a track gets that track's capital (+2, safe from raids). The first to reach level 5 takes it over.
- **The event die.** A third die is thrown with every roll, and the second number die is red.
  - ⛵ moves the raiders' ship one step.
  - A gate gives an **edict** from that deck to everyone whose level in the track covers the red die.
- **Raids.** When the ship arrives (7 steps), the raiders fight with one point per city on the island. Your defense is the total rank of all active wardens. If the wardens win, the strongest player becomes Defender of the Isle (+1). If the raiders win, the players with the weakest wardens each lose a city (it turns back into a settlement). The bandit stays in the dunes until the first raid. The lobby setting **First raid** gives everyone more time before the first landing (7 steps by default; 10, 14 or 21). Later raids always take 7 steps. When the raiders land, a raid scene counts up both sides and shows who defended the isle or who loses a city.
- **Wardens** cost 🐑⛏️ and stand on corners along your roads. Activate them with 🌾. Active wardens can move, push a weaker opponent warden away, or chase the bandit off. Promote them with 🐑⛏️ up to rank 3.
- **Walls** cost 🧱🧱 and add +2 to your hand limit.
- **Setup:** your second piece is a city.
- **Edicts:** 3 decks of 18 cards, each with its rules text in the game. Point edicts count at once.

The **raiders' track** in the sidebar shows how close the ship is and whether the island would hold right now. Saves, loading and replays work in this mode too: the save file gains a `crowns` section with improvements, wardens, walls, capitals, the merchant, edicts and the decks. Commodities are written `Pa`, `Li` and `Si`.

## Quality of life

- **Settings suggestions:** in the lobby anyone can change a setting. For non-hosts that makes a draft they can send to the host as a suggestion. Everyone can vote 👍/👎, and the host applies or dismisses it; votes never change settings by themselves.

- **Turn timer** (optional, 1–3 minutes): when time runs out the game plays for you. It rolls, discards at random, moves the bandit, or ends the turn. Short steps like discarding get at most 1 minute.
- **Friendly bandit** (optional): the bandit can't be placed next to players with 2 or fewer points.
- **Lost your seat?** Join the room with the exact same name and you'll get it back, as long as that seat is offline.
- **Host left?** Anyone can click *become host* while the host is offline. The host can **Skip** an AFK player, and anyone can skip a player who is offline.
- A chime plays when it's your move or a trade offer arrives (🔔 toggles it). A toast shows the cards you just got, and newly built pieces glow briefly.
- **Map zoom:** the map opens zoomed in, so drag to pan right away. Scroll wheel, pinch, or the + / − / ⤢ buttons (⤢ shows the whole island).
- **Points breakdown:** click anyone's score, or **Points** in the Players panel, to see where every point comes from (settlements, cities, awards, and in Crowns & Raiders capitals, Defender of the Isle, the merchant and point edicts). The end-of-game window shows the same table.
- **Build costs light up:** each cost icon glows when you hold that card and greys out when you are missing it.
- **Rolling a 7:** the dice turn red, the board flashes, and a red banner stays up until discards, the bandit move and the steal are done. When discarding you can only pick exactly the number of cards you owe.
- **Robbing:** after moving the bandit you pick one of the victim's face-down cards. It flips over to show what you took, and only you and the victim see what it was.
- **Light / dark theme:** the game follows your device; the 🌙 / ☀️ button in the top bar switches it, and that choice is remembered on that device.
- Every roll shows two 3D dice thrown onto the board. Animations are on by default; the ✨ button in the top bar turns them off (or back on) for that device. The log shows each player's color and icons for the cards they got. New pieces drop in, and the bandit slides to its new tile.
- **Shortcuts:** `+` / `-` / `0` zoom · `R` roll · `E` end turn / done building · `T` trade · `B` bank · `1`–`4` road / settlement / city / development card (in Crowns & Raiders `4` wall, `5` warden) · `Esc` cancel.

## Saving, loading and replays

- **Save:** the host can click **💾 Save** in the top bar at any time. Once the game is over, everyone can download it from the end-of-game window.
- **Load:** on the home page, open **Load or replay a saved game**, pick the file, and choose **Continue this game**. Pick your seat and you become host of a new room. Friends open the new room's link and click their seat.
- **Replay:** choose **Watch replay** (home page or end-of-game window). You can step move by move (← →), play/pause (Space), drag the slider, or change the speed. Everyone's hand is shown. **Play from here…** starts a new game from that exact moment.

### The save file

A save is a readable JSON file (about 1 KB per 10 turns). It has two parts: a **snapshot** of the game right now (what you load and edit) and a **history** (the starting position, the starting seed and every move), which replays the game exactly.

```json
{
  "hexhaven": 1,
  "seed": 416218545,
  "players": [
    { "seat": 1, "name": "ron", "color": "red", "hand": "Wo1 Fl1 Ir2", "devCards": ["guard", "vp*"], "guardsPlayed": 0 }
  ],
  "turnOrder": [3, 4, 1, 2],
  "map": { "size": 2, "tiles": ["Wh10 Wo9 Cl6", "Fl5 Fl10 Cl3 De", "…"], "harbors": ["3:1 @ 1.1NW", "2:1 wheat @ 3.5E"], "bandit": "2.4" },
  "pieces": { "1": { "settlements": ["1.2SE"], "cities": [], "roads": ["1.2SE", "1.3SW"] } },
  "turn": { "number": 19, "player": 3, "phase": "main" },
  "history": { "seed": 1189467210, "start": { "…": "the game as it started" }, "moves": ["1 roll", "1 buildVillage 7.4S", "1 buildRoad 7.4SE", "- timeout"] }
}
```

- **Seats** are permanent numbers. `turnOrder` lists who plays first, second, and so on.
- **Tiles** are listed row by row, top to bottom: `Wo` wood, `Cl` clay, `Fl` fleece, `Wh` wheat, `Ir` iron, `De` dunes, followed by the dice number.
- **Positions** are `row.tile` counted from 1, plus a corner (`N NE SE S SW NW`) or a side (`NE E SE SW W NW`), e.g. `3.2SE`.
- **Cards** are written like `Wo1 Cl2`. A development card ending in `*` was bought this turn.
- **`seed`** drives the dice from here on. Leave it empty (`""`) for fresh random dice, or keep it to roll exactly the same dice again.
- **Editing:** renaming players or changing colors keeps the history. Other edits (cards, pieces, the map…) are fine too: the game then continues from your edited snapshot and its replay starts there. Mistakes are reported in plain words, e.g. `Two players use the color red` or `Map row 2 needs 4 tiles`.
- **Fair play:** a save shows everyone's cards and the deck order, which is why only the host can save mid-game. Right after a mid-game save, the live game switches to a fresh seed, so the file can't predict upcoming dice.

## Files

- `server.js`: HTTP server. Clients send actions with POST and get live updates over Server-Sent Events.
- `game.js`: rules engine. The server is authoritative, and each player sees only their own hand.
- `public/`: browser client (board drawn as SVG).
- `notation.js`: readable names for positions, cards and moves (shared with the browser).
- `save.js`: save files: snapshot + history, loading (with friendly errors), and the replayer.
- `crowns.js`: the Crowns & Raiders rules. `game.js` calls into it at its hook points. `public/crowns-ui.js` is its browser side.
- `test/sim.js`: headless bot self-play with invariant checks (`npm test`).
- `test/save-test.js`: save, load, replay and hand-edit checks on bot games.
- `test/crowns-sim.js` / `test/crowns-save-test.js`: the same for Crowns & Raiders, with bots that use every action and edict.
- `test/bots.js`: fills a live room with bots for testing (`node test/bots.js ROOMCODE 5`).
