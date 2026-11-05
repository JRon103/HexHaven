# Hexhaven

A browser game for 2–8 friends about settling a hex island and trading resources. You roll dice, collect resources, build roads, villages and towns, trade, and race to 10 points.

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

## Rules summary

| Piece   | Cost                          | Points |
|---------|-------------------------------|--------|
| Road    | Wood + Clay                   | —      |
| Village | Wood + Clay + Fleece + Wheat  | 1      |
| Town    | 2 Wheat + 3 Iron (upgrades a village) | 2 |
| Scroll  | Fleece + Wheat + Iron         | maybe  |

- **Who goes first:** everyone rolls the dice, and the highest roll starts. Tied players re-roll. Play then goes around the table in lobby order.
- **Setup:** players place a village and a road in snake order (1→N, then N→1). Your second village pays out one card per neighboring tile.
- **Turn:** roll, collect, then build, trade with players or the bank (4:1, or 3:1 / 2:1 at harbors), and end your turn.
- **Rolling a 7:** anyone holding more than 7 cards discards half. The roller moves the bandit, which blocks that tile, and steals a card from a player who has a building there.
- **Scrolls:** Guard (move the bandit), Road Crew (2 free roads), Bounty (take any 2), Embargo (collect one resource from everyone), Monument (+1 hidden point). You can play one per turn, but not on the turn you bought it.
- **Awards:** Grand Route (longest road of 5+, +2) and Strongest Watch (3+ Guards, +2).
- **Big games:** with 5+ players the island grows to 37 tiles, with a bigger bank and scroll deck. The **builder phase** (on by default) lets everyone else build between turns.
- **Trading:** the active player makes an offer. Others can accept, decline or send a **counter-offer**, and the offerer picks one.

## Quality of life

- **Settings suggestions:** in the lobby anyone can change a setting. For non-hosts that makes a draft they can send to the host as a suggestion. Everyone can vote 👍/👎, and the host applies or dismisses it; votes never change settings by themselves.

- **Turn timer** (optional, 1–3 minutes): when time runs out the game plays for you. It rolls, discards at random, moves the bandit, or ends the turn. Short steps like discarding get at most 1 minute.
- **Friendly bandit** (optional): the bandit can't be placed next to players with 2 or fewer points.
- **Lost your seat?** Join the room with the exact same name and you'll get it back, as long as that seat is offline.
- **Host left?** Anyone can click *become host* while the host is offline. The host can **Skip** an AFK player, and anyone can skip a player who is offline.
- A chime plays when it's your move or a trade offer arrives (🔔 toggles it). A toast shows the cards you just got, and newly built pieces glow briefly.
- **Map zoom:** scroll wheel, pinch, or the + / − / ⤢ buttons. Drag to pan while zoomed.
- **Robbing:** after moving the bandit you pick one of the victim's face-down cards. It flips over to show what you took, and only you and the victim see what it was.
- Every roll appears as big tumbling dice over the board. New pieces drop in, and the bandit slides to its new tile.
- **Shortcuts:** `+` / `-` / `0` zoom · `R` roll · `E` end turn / done building · `T` trade · `1`–`4` road / village / town / scroll · `Esc` cancel.

## Files

- `server.js`: HTTP server. Clients send actions with POST and get live updates over Server-Sent Events.
- `game.js`: rules engine. The server is authoritative, and each player sees only their own hand.
- `public/`: browser client (board drawn as SVG).
- `test/sim.js`: headless bot self-play with invariant checks (`npm test`).
- `test/bots.js`: fills a live room with bots for testing (`node test/bots.js ROOMCODE 5`).
