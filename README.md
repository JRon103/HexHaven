# Hexhaven

A browser game for 2–8 friends about settling a hex island and trading resources. You roll dice, collect resources, build roads, settlements and cities, trade, and race to 10 points.

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
- **Big games:** with 5+ players the island grows to 37 tiles, with a bigger bank and development-card deck. The **builder phase** (on by default) lets everyone else build between turns.
- **Trading:** the active player makes an offer, which pops up in the top-left corner of everyone's board. Others can accept, decline or send a **counter-offer**, and the offerer picks one.
- **Bank trades** use the same give/want pickers. Each + on the give side adds a full lot at your rate (4, or 3/2 at a harbor ⚓), and every lot buys one card of your choice; several lots can go in one trade.

## Quality of life

- **Settings suggestions:** in the lobby anyone can change a setting. For non-hosts that makes a draft they can send to the host as a suggestion. Everyone can vote 👍/👎, and the host applies or dismisses it; votes never change settings by themselves.

- **Turn timer** (optional, 1–3 minutes): when time runs out the game plays for you. It rolls, discards at random, moves the bandit, or ends the turn. Short steps like discarding get at most 1 minute.
- **Friendly bandit** (optional): the bandit can't be placed next to players with 2 or fewer points.
- **Lost your seat?** Join the room with the exact same name and you'll get it back, as long as that seat is offline.
- **Host left?** Anyone can click *become host* while the host is offline. The host can **Skip** an AFK player, and anyone can skip a player who is offline.
- A chime plays when it's your move or a trade offer arrives (🔔 toggles it). A toast shows the cards you just got, and newly built pieces glow briefly.
- **Map zoom:** the map opens zoomed in, so drag to pan right away. Scroll wheel, pinch, or the + / − / ⤢ buttons (⤢ shows the whole island).
- **Build costs light up:** each cost icon glows when you hold that card and greys out when you are missing it.
- **Rolling a 7:** the dice turn red, the board flashes, and a red banner stays up until discards, the bandit move and the steal are done. When discarding you can only pick exactly the number of cards you owe.
- **Robbing:** after moving the bandit you pick one of the victim's face-down cards. It flips over to show what you took, and only you and the victim see what it was.
- Every roll shows two 3D dice thrown onto the board. Animations follow your device's "reduce motion" setting; the ✨ button in the top bar turns them on or off for that device. The log shows each player's color and icons for the cards they got. New pieces drop in, and the bandit slides to its new tile.
- **Shortcuts:** `+` / `-` / `0` zoom · `R` roll · `E` end turn / done building · `T` trade · `B` bank · `1`–`4` road / settlement / city / development card · `Esc` cancel.

## Files

- `server.js`: HTTP server. Clients send actions with POST and get live updates over Server-Sent Events.
- `game.js`: rules engine. The server is authoritative, and each player sees only their own hand.
- `public/`: browser client (board drawn as SVG).
- `test/sim.js`: headless bot self-play with invariant checks (`npm test`).
- `test/bots.js`: fills a live room with bots for testing (`node test/bots.js ROOMCODE 5`).
