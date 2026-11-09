'use strict';
/* Hexhaven translations. The game is written in English; this file shows it in the player's language.
   - Screen text is translated as it appears (a watcher on the page), so app.js stays plain English.
   - Game log lines and server messages are English sentences; they're matched against templates below
     ("{*}" = a name, number or list), so each player sees their own language even in mixed groups.
   - Saves, replays and the server never change: only what's shown is translated.
   Loaded before app.js. Switching language reloads the page (your seat is kept). */

const LANGS = { en: 'English', es: 'Español' };
const LANG = (() => {
  try { const l = localStorage.getItem('hexhaven:lang'); if (LANGS[l]) return l; } catch {}
  return /^es\b/i.test(navigator.language || '') ? 'es' : 'en';
})();
document.documentElement.lang = LANG;

function setLang(l) {
  if (!LANGS[l] || l === LANG) return;
  try { localStorage.setItem('hexhaven:lang', l); } catch {}
  location.reload();
}

// English → Spanish. Keys with {*} are templates: each {*} matches some text, and {1}, {2}… in the Spanish
// put those pieces back (translated too when they're known words, like resource names).
const ES = {
  // ---------- cards, pieces, places ----------
  'Wood': 'Madera', 'Clay': 'Arcilla', 'Fleece': 'Lana', 'Wheat': 'Trigo', 'Iron': 'Hierro', 'Dunes': 'Dunas',
  'Parchment': 'Pergamino', 'Linen': 'Lino', 'Silver': 'Plata',
  'wood': 'madera', 'clay': 'arcilla', 'fleece': 'lana', 'wheat': 'trigo', 'iron': 'hierro', 'parchment': 'pergamino', 'linen': 'lino', 'silver': 'plata',
  'Road': 'Camino', 'Settlement': 'Poblado', 'City': 'Ciudad', 'Dev card': 'Desarrollo', 'Wall': 'Muralla', 'Warden': 'Guardián',
  'Veteran': 'Veterano', 'Champion': 'Campeón', 'Guard': 'Guardia', 'Road Crew': 'Cuadrilla de caminos', 'Bounty': 'Botín',
  'Embargo': 'Embargo', 'Monument': 'Monumento', 'Guild': 'Gremio', 'Council': 'Consejo', 'Academy': 'Academia',
  'Guild gate': 'puerta del Gremio', 'Council gate': 'puerta del Consejo', 'Academy gate': 'puerta de la Academia',
  'settlement': 'poblado', 'city': 'ciudad', 'road': 'camino', 'nothing': 'nada',
  'Settlements': 'Poblados', 'Cities': 'Ciudades', 'Monuments': 'Monumentos', 'Capitals': 'Capitales',
  'Defender of the Isle': 'Defensor de la Isla', 'Merchant': 'Mercader', 'Point edicts': 'Edictos de punto',
  'Grand Route': 'Gran Ruta', 'Strongest Watch': 'Guardia Suprema', 'Grand Route +2': 'Gran Ruta +2', 'Strongest Watch +2': 'Guardia Suprema +2',
  'Grand Route (longest road)': 'Gran Ruta (camino más largo)', 'Strongest Watch (3+ Guards)': 'Guardia Suprema (3+ Guardias)',
  'Monuments (hidden)': 'Monumentos (ocultos)', 'Capital{*} ({*})': 'Capital{1} ({2})',
  // ---------- edicts and powers ----------
  'Weighted Dice': 'Dados cargados', 'Surveyor': 'Agrimensor', 'Master Mason': 'Maestro albañil', 'Irrigation': 'Irrigación',
  'Deep Mining': 'Minería profunda', 'Engineer': 'Ingeniero', 'Healer': 'Sanador', 'Paving Crew': 'Cuadrilla de pavimento', 'Smith': 'Herrero',
  'Printing Press': 'Imprenta', 'Harbor Tax': 'Impuesto portuario', 'Master Merchant': 'Gran mercader', 'Merchant Fleet': 'Flota mercante',
  'Resource Embargo': 'Embargo de recursos', 'Commodity Embargo': 'Embargo de mercancías', 'Inquisitor': 'Inquisidor', 'Charter': 'Fuero',
  'Deserter': 'Desertor', 'Diplomat': 'Diplomático', 'Intrigue': 'Intriga', 'Saboteur': 'Saboteador', 'Spy': 'Espía', 'Warlord': 'Caudillo', 'Wedding': 'Boda',
  'Play before rolling: choose what the two number dice show. The event die still rolls.': 'Juégalo antes de tirar: elige qué muestran los dos dados de número. El dado de evento se tira igual.',
  'Swap the numbers of two tiles. Neither may be a 2, 6, 8 or 12.': 'Intercambia los números de dos casillas. Ninguno puede ser 2, 6, 8 ni 12.',
  'Your next city improvement this turn costs one commodity less.': 'Tu próxima mejora de ciudad este turno cuesta una mercancía menos.',
  'Take 2 wheat for every wheat tile next to your settlements and cities.': 'Toma 2 de trigo por cada casilla de trigo junto a tus poblados y ciudades.',
  'Take 2 iron for every mountain tile next to your settlements and cities.': 'Toma 2 de hierro por cada casilla de montaña junto a tus poblados y ciudades.',
  'Build a city wall for free.': 'Construye una muralla gratis.',
  'Upgrade a settlement to a city for just 2 iron and 1 wheat.': 'Mejora un poblado a ciudad por solo 2 de hierro y 1 de trigo.',
  'Build 2 roads for free.': 'Construye 2 caminos gratis.',
  'Promote up to 2 of your wardens for free.': 'Asciende gratis hasta 2 de tus guardianes.',
  '+1 victory point, shown as soon as you draw it.': '+1 punto de victoria, que se muestra en cuanto lo robas.',
  'Each opponent holding a commodity gives you one; you give each of them one resource back, if you have any.': 'Cada rival con una mercancía te da una; tú le devuelves un recurso a cada uno, si tienes.',
  'Take 2 random cards from a player with more points than you.': 'Toma 2 cartas al azar de un jugador con más puntos que tú.',
  'Put the merchant on a tile next to your settlement or city: trade its resource 2:1, and hold +1 point while it stays with you.': 'Pon al mercader en una casilla junto a tu poblado o ciudad: cambia su recurso 2:1 y suma +1 punto mientras siga contigo.',
  'For the rest of this turn, trade one resource or commodity of your choice 2:1 with the bank.': 'Durante el resto del turno, cambia con el banco 2:1 un recurso o mercancía a tu elección.',
  'Name a resource: every other player gives you up to 2 of it.': 'Nombra un recurso: cada otro jugador te da hasta 2 de él.',
  'Name a commodity: every other player gives you 1 of it, if they can.': 'Nombra una mercancía: cada otro jugador te da 1, si puede.',
  'Move the bandit and take 1 random card from every player with a building on its new tile.': 'Mueve al bandido y toma 1 carta al azar de cada jugador con un edificio en su nueva casilla.',
  "Remove an opponent's warden, and place one of your own of the same rank (if you have one) where you could build a warden.": 'Retira un guardián rival y coloca uno tuyo del mismo rango (si tienes) donde podrías construir un guardián.',
  'Remove a road with a loose end. If it is yours, build it again somewhere for free.': 'Retira un camino con un extremo suelto. Si es tuyo, vuelve a construirlo gratis en otro lugar.',
  "Push away an opponent's warden that stands on one of your roads.": 'Expulsa a un guardián rival que esté sobre uno de tus caminos.',
  'Every player with at least as many points as you discards half their cards, at random.': 'Cada jugador con al menos tantos puntos como tú descarta la mitad de sus cartas, al azar.',
  'Take a random edict from another player (not a point card).': 'Toma un edicto al azar de otro jugador (no una carta de punto).',
  'Activate all of your wardens for free.': 'Activa gratis a todos tus guardianes.',
  'Every player with more points than you gives you 2 random cards.': 'Cada jugador con más puntos que tú te da 2 cartas al azar.',
  'Trading Hall — trade commodities 2:1 with the bank': 'Lonja — cambia mercancías 2:1 con el banco',
  'Citadel — wardens can be promoted to Champions (rank 3)': 'Ciudadela — los guardianes pueden ascender a Campeones (rango 3)',
  'Waterworks — when a roll gives you nothing, take any one resource': 'Acueducto — cuando una tirada no te da nada, toma un recurso a elección',
  'Trading Hall': 'Lonja', 'Citadel': 'Ciudadela', 'Waterworks': 'Acueducto',
  // ---------- development cards ----------
  'Move the bandit to any tile and steal 1 card from a player with a building there. Played Guards stay in front of you: the first to play 3 earns the Strongest Watch (+2 points).': 'Mueve al bandido a cualquier casilla y roba 1 carta a un jugador con un edificio ahí. Las Guardias jugadas quedan frente a ti: el primero en jugar 3 gana la Guardia Suprema (+2 puntos).',
  'Place 2 roads for free. They follow the normal road rules (connected to your roads or buildings).': 'Coloca 2 caminos gratis. Siguen las reglas normales (conectados a tus caminos o edificios).',
  'Take any 2 resource cards from the bank. They can be the same resource.': 'Toma 2 cartas de recurso cualesquiera del banco. Pueden ser del mismo recurso.',
  'Name a resource. Every other player must give you all of their cards of that resource.': 'Nombra un recurso. Cada otro jugador debe darte todas sus cartas de ese recurso.',
  'Worth 1 victory point. Keep it hidden — it counts automatically and is revealed at the end.': 'Vale 1 punto de victoria. Mantenlo oculto: cuenta solo y se revela al final.',
  // ---------- home ----------
  'Settle a hex island, trade with your friends, race to 10 points.': 'Coloniza una isla de hexágonos, comercia con tus amigos y llega primero a 10 puntos.',
  '👥 2–8 players': '👥 2–8 jugadores', '✨ No sign-up': '✨ Sin registro', '🌐 Play in the browser': '🌐 Juega en el navegador',
  'Start a game': 'Crear partida', 'Your name': 'Tu nombre', 'Create room': 'Crear sala',
  "You'll get a room code and a link to send your friends.": 'Recibirás un código de sala y un enlace para tus amigos.',
  'Join a game': 'Unirse a una partida', 'Room code': 'Código de sala', 'Join room': 'Entrar a la sala',
  'Lost your seat (new device, cleared browser)? Join with the exact same name to take it back.': '¿Perdiste tu asiento (otro dispositivo, navegador borrado)? Entra con el mismo nombre exacto para recuperarlo.',
  'Load or replay a saved game': 'Cargar o ver una partida guardada',
  "Hosts can save a game any time with 💾; everyone can once it's over. Open the file here to watch the replay or keep playing from where it stopped.": 'El anfitrión puede guardar en cualquier momento con 💾; todos pueden al terminar. Abre el archivo aquí para ver la repetición o seguir jugando desde donde quedó.',
  '📂 Choose a save file': '📂 Elegir archivo', 'How to play': 'Cómo se juega',
  'Everyone rolls to decide who goes first, then places two settlements and two roads. Your second settlement pays out its neighboring tiles.': 'Todos tiran para ver quién empieza; luego cada uno coloca dos poblados y dos caminos. Tu segundo poblado cobra sus casillas vecinas.',
  'Each turn, roll two dice. Every tile showing that number pays its resource to adjacent settlements (1) and cities (2).': 'Cada turno se tiran dos dados. Cada casilla con ese número paga su recurso a los poblados (1) y ciudades (2) vecinos.',
  'Spend resources to build, trade with other players or the bank (4:1, or better at a harbor ⚓), and buy development cards.': 'Gasta recursos para construir, comercia con otros jugadores o con el banco (4:1, o mejor en un puerto ⚓) y compra cartas de desarrollo.',
  'Rolling a 7 summons the bandit: anyone holding more than 7 cards discards half, then the roller blocks a tile and steals a card.': 'Un 7 llama al bandido: quien tenga más de 7 cartas descarta la mitad, y quien tiró bloquea una casilla y roba una carta.',
  'Settlement = 1 point, City = 2. The longest road (5+) is the': 'Poblado = 1 punto, Ciudad = 2. El camino más largo (5+) es la',
  '(+2), and 3+ Guards played earns the': '(+2), y jugar 3+ Guardias da la',
  '(+2). First to 10 points on their own turn wins.': '(+2). Gana el primero en llegar a 10 puntos en su propio turno.',
  'With 3+ players, a': 'Con 3+ jugadores, una', 'builder phase': 'fase de construcción',
  'after each turn lets everyone else build too, so big games keep moving.': 'tras cada turno deja construir a los demás, para que las partidas grandes no se estanquen.',
  '🛤️ Road': '🛤️ Camino', '🏠 Settlement': '🏠 Poblado', '🏰 City': '🏰 Ciudad', '📜 Development card': '📜 Carta de desarrollo',
  'Your recent rooms': 'Tus salas recientes', 'Rejoin': 'Volver', 'Forget': 'Olvidar',
  'That room is gone': 'Esa sala ya no existe', 'That game no longer exists': 'Esa partida ya no existe', 'Request failed': 'La solicitud falló',
  'Reconnecting…': 'Reconectando…',
  // ---------- version / theme / sound ----------
  'Updating to the new version ({*})…': 'Actualizando a la nueva versión ({1})…', '⟳ New version ({*}) — reload': '⟳ Nueva versión ({1}) — recargar',
  'Switch to the light theme': 'Cambiar al tema claro', 'Switch to the dark theme': 'Cambiar al tema oscuro',
  'Animations {*} — click to turn {*}': 'Animaciones {1} — clic para {2}', 'on': 'activadas', 'off': 'desactivadas',
  '✨ Animations on': '✨ Animaciones activadas', 'Animations off': 'Animaciones desactivadas', 'Animations': 'Animaciones',
  'Sound on/off': 'Sonido sí/no', 'Download this game as a save file': 'Descargar esta partida como archivo', '💾 Save': '💾 Guardar',
  'Language': 'Idioma', 'Copy invite link': 'Copiar enlace de invitación', 'Watching a replay': 'Viendo una repetición', '▶ Replay': '▶ Repetición',
  // ---------- lobby ----------
  'Room': 'Sala', 'Room {*}': 'Sala {1}', 'Room chat': 'Chat de la sala', 'Send': 'Enviar', 'Say something…': 'Escribe algo…', 'Chat…': 'Chat…',
  'Chat message': 'Mensaje de chat', 'Invite link copied': 'Enlace copiado', 'Copy this link:': 'Copia este enlace:',
  'Players': 'Jugadores', '(you)': '(tú)', 'host': 'anfitrión', 'Remove': 'Quitar', 'online': 'en línea', 'offline': 'desconectado',
  'Your color': 'Tu color', 'Game settings': 'Ajustes de la partida', 'Game settings {*}': 'Ajustes de la partida {1}',
  'change any of these to suggest it to the host': 'cambia cualquiera para sugerírselo al anfitrión',
  'Game mode': 'Modo de juego', 'Classic — settle, trade and build to 10 points': 'Clásico — coloniza, comercia y construye hasta 10 puntos',
  '👑 Crowns & Raiders — cities, wardens and raids, to 13 points': '👑 Coronas e Invasores — ciudades, guardianes e invasiones, hasta 13 puntos',
  "Cities also make commodities (📃 parchment, 🧵 linen, 🪙 silver) that buy city improvements. Raise wardens to fight off the raiders' ship, or lose a city. A third die opens the Guild, Council and Academy gates and deals edicts. No development cards. Your second setup piece is a city. 2–8 players.": 'Las ciudades también producen mercancías (📃 pergamino, 🧵 lino, 🪙 plata) para mejorarlas. Recluta guardianes para rechazar el barco de los invasores o perderás una ciudad. Un tercer dado abre las puertas del Gremio, el Consejo y la Academia y reparte edictos. Sin cartas de desarrollo. Tu segunda pieza inicial es una ciudad. 2–8 jugadores.',
  'The standard game: roads, settlements, cities and development cards. 2–8 players.': 'El juego estándar: caminos, poblados, ciudades y cartas de desarrollo. 2–8 jugadores.',
  'First raid': 'Primera invasión', 'After 7 ship steps — standard': 'Tras 7 pasos del barco — estándar', 'After 10 steps — a little more time': 'Tras 10 pasos — un poco más de tiempo',
  'After 14 steps — about twice as long': 'Tras 14 pasos — casi el doble', 'After 21 steps — a slow start': 'Tras 21 pasos — un inicio tranquilo',
  "How far the raiders' ship sails before it first lands, so everyone has time to raise wardens. Later raids always come after 7 steps.": 'Cuánto navega el barco invasor antes de su primer desembarco, para que todos tengan tiempo de reclutar guardianes. Las siguientes invasiones siempre llegan tras 7 pasos.',
  'Points to win': 'Puntos para ganar', 'Island size': 'Tamaño de la isla', 'Auto — {*} for {*} players': 'Automático — {1} para {2} jugadores',
  'small (19 tiles)': 'pequeña (19 casillas)', 'large (37 tiles)': 'grande (37 casillas)',
  'Small — 19 tiles (best for 2–4)': 'Pequeña — 19 casillas (ideal para 2–4)', 'Large — 37 tiles (best for 5–8)': 'Grande — 37 casillas (ideal para 5–8)',
  'Hand limit when a 7 is rolled': 'Límite de mano al sacar un 7', 'Builder phase': 'Fase de construcción',
  'After each turn, the other players may build (no trading). Recommended for 5+ players.': 'Tras cada turno, los demás pueden construir (sin comerciar). Recomendado para 5+ jugadores.',
  'Turn timer': 'Reloj de turno', 'Off — wait as long as it takes': 'Desactivado — esperar lo necesario', '1 minute': '1 minuto', '1½ minutes': '1½ minutos', '2 minutes': '2 minutos', '3 minutes': '3 minutos',
  'When time runs out the game plays for you (rolls, discards at random, ends the turn). Short steps like discarding get at most 1 minute.': 'Si se acaba el tiempo, el juego actúa por ti (tira, descarta al azar, termina el turno). Los pasos cortos como descartar tienen como mucho 1 minuto.',
  'Friendly bandit': 'Bandido amistoso', "The bandit can't be placed next to players with 2 or fewer points. Nice for newer players.": 'El bandido no puede ir junto a jugadores con 2 puntos o menos. Ideal para principiantes.',
  'Start game': 'Empezar partida', 'Waiting for at least one more player…': 'Esperando al menos a otro jugador…', 'Ready with {*} players.': 'Listos con {1} jugadores.',
  'Waiting for the host to start the game…': 'Esperando a que el anfitrión empiece la partida…', 'Host is offline — become host': 'El anfitrión está desconectado — ser anfitrión',
  'Leave room': 'Salir de la sala', 'Leave this room?': '¿Salir de esta sala?', 'Your suggestion:': 'Tu sugerencia:', 'Reset': 'Restablecer',
  'Suggest to host': 'Sugerir al anfitrión', 'Suggestion sent to the host': 'Sugerencia enviada al anfitrión',
  'Mode': 'Modo', 'Crowns & Raiders': 'Coronas e Invasores', 'Classic': 'Clásico', 'First raid after': 'Primera invasión tras', '{*} steps': '{1} pasos',
  'Island': 'Isla', 'Hand limit': 'Límite de mano', '{*} min': '{1} min', 'auto': 'automático', 'small': 'pequeña', 'large': 'grande',
  'Suggestions': 'Sugerencias', 'votes are advice — you decide': 'los votos son un consejo — tú decides', 'the host decides': 'decide el anfitrión',
  'suggests': 'sugiere', 'No votes yet': 'Aún sin votos', '{*} of {*} in favor': '{1} de {2} a favor', 'majority': 'mayoría',
  'Dismiss': 'Descartar', 'Apply': 'Aplicar', 'Withdraw': 'Retirar', '💡 {*} suggested a settings change': '💡 {1} sugirió un cambio de ajustes',
  // ---------- top bar, status ----------
  '● Your move — Hexhaven': '● Te toca — Hexhaven', 'Time left before the game auto-plays': 'Tiempo antes de que el juego actúe por ti',
  'your time': 'tu tiempo', '{*} players': '{1} jugadores', 'first to {*}': 'el primero a {1}',
  '🏆 {*} wins!': '🏆 ¡{1} gana!', 'Tie! Roll again to break it': '¡Empate! Tira otra vez para desempatar', 'Roll the dice — highest roll goes first': 'Tira los dados — el más alto empieza',
  'Rolling for turn order… waiting for {*}': 'Tirando por el orden de turno… esperando a {1}',
  'first settlement': 'primer poblado', 'road next to it': 'camino junto a él',
  'second piece: a {*} (it pays out right away)': 'segunda pieza: una {1} (cobra al instante)', 'Place your {*} — click a glowing spot': 'Coloca tu {1} — haz clic en un punto brillante',
  '{*} is placing their {*}…': '{1} está colocando su {2}…', 'Your turn — roll the dice': 'Tu turno — tira los dados', '{*} is about to roll…': '{1} está por tirar…',
  'Bandits! Discard {*} cards': '¡Bandidos! Descarta {1} cartas', 'Waiting for {*} to discard…': 'Esperando a que {1} descarte…',
  'Move the bandit — click any tile': 'Mueve al bandido — haz clic en una casilla', '{*} is moving the bandit…': '{1} está moviendo al bandido…',
  'Choose who to rob': 'Elige a quién robar', '{*} is choosing who to rob…': '{1} está eligiendo a quién robar…',
  'Place {*} free road{*}': 'Coloca {1} camino{2} gratis', '{*} is building free roads…': '{1} está construyendo caminos gratis…',
  'Build, trade, or end your turn': 'Construye, comercia o termina tu turno', "{*}'s turn": 'Turno de {1}',
  'Builder phase — build something or pass': 'Fase de construcción — construye algo o pasa', 'Builder phase: {*} may build…': 'Fase de construcción: {1} puede construir…',
  '🥷 7 rolled — Bandits!': '🥷 Salió 7 — ¡Bandidos!', 'you must discard {*} cards': 'debes descartar {1} cartas', 'waiting for {*} to discard': 'esperando a que {1} descarte',
  'click a tile to move the bandit': 'haz clic en una casilla para mover al bandido', '{*} is moving the bandit': '{1} está moviendo al bandido',
  'pick a card to steal': 'elige una carta para robar', '{*} is choosing a card to steal': '{1} está eligiendo una carta para robar',
  '⚔️ The raiders won!': '⚔️ ¡Ganaron los invasores!', 'click one of your cities to lose — it becomes a settlement': 'haz clic en la ciudad que pierdes — pasa a ser un poblado',
  'waiting for {*} to choose a city': 'esperando a que {1} elija una ciudad',
  // dice and turn effects
  '{*} rolled': '{1} sacó', 'for turn order': 'para el orden de turno', '— 🥷 Bandits!': '— 🥷 ¡Bandidos!',
  'Builder phase — your chance to build': 'Fase de construcción — tu oportunidad de construir', 'Builder phase: {*}': 'Fase de construcción: {1}',
  'Your turn to place': 'Te toca colocar', '{*} is placing': '{1} está colocando', 'a settlement': 'un poblado', 'a road': 'un camino', 'a city': 'una ciudad',
  'Your turn!': '¡Tu turno!', 'Roll the dice to start': 'Tira los dados para empezar', 'Turn {*}': 'Turno {1}',
  'You stole': 'Robaste', 'from {*}': 'a {1}', '{*} stole your': '{1} te robó', 'the raiders’ ship sails closer': 'el barco invasor se acerca', 'the {*} opens': 'se abre la {1}',
  // ---------- board ----------
  '⚓ 3:1 any · 2:1 shown': '⚓ 3:1 cualquiera · 2:1 el indicado', 'Map zoom': 'Zoom del mapa', 'Zoom in (+ / mouse wheel / pinch)': 'Acercar (+ / rueda / pellizco)',
  'Zoom out (−)': 'Alejar (−)', 'Fit whole island (0)': 'Ver toda la isla (0)', 'Zoom in': 'Acercar', 'Zoom out': 'Alejar', 'Reset zoom': 'Restablecer zoom',
  'Trade offer': 'Oferta de intercambio', 'bandit': 'bandido',
  // ---------- dock ----------
  'Settlement (1 point)': 'Poblado (1 punto)', 'City — upgrades a settlement (2 points)': 'Ciudad — mejora un poblado (2 puntos)',
  'Development card — draw a random card from the deck': 'Carta de desarrollo — roba una carta al azar del mazo',
  '{*} — {*} left · shortcut {*}': '{1} — quedan {2} · atajo {3}', '{*} — missing': '{1} — te falta',
  'What do development cards do?': '¿Qué hacen las cartas de desarrollo?', 'Development card reference': 'Guía de cartas de desarrollo',
  '🎲 Roll for turn order': '🎲 Tirar por el orden de turno', '🎲 Roll dice': '🎲 Tirar dados', 'Shortcut: R': 'Atajo: R', 'Shortcut: E': 'Atajo: E',
  '🤝 Trade': '🤝 Comerciar', '🏦 Bank': '🏦 Banco', 'End turn ➜': 'Terminar turno ➜', 'Done building': 'Terminé de construir', 'Skip free roads': 'Saltar caminos gratis',
  'Trade with players (shortcut: T)': 'Comerciar con jugadores (atajo: T)', 'Trade with the bank (shortcut: B)': 'Comerciar con el banco (atajo: B)',
  '🏆 Show results': '🏆 Ver resultados', 'Counts automatically · never played': 'Cuenta solo · nunca se juega', 'New — playable next turn': 'Nueva — se puede jugar el próximo turno',
  'You already played a development card this turn': 'Ya jugaste una carta de desarrollo este turno', 'Play it on your own turn': 'Juégala en tu turno', 'Play': 'Jugar',
  'Your development cards': 'Tus cartas de desarrollo', "· one per turn, not the turn you bought it": '· una por turno, no el turno en que la compraste',
  '{*} · trades {*}:1': '{1} · se cambia {2}:1',
  // ---------- players, points, stats ----------
  'Points': 'Puntos', "Where everyone's points come from": 'De dónde salen los puntos de cada uno', 'victory points': 'puntos de victoria',
  '{*} — click for the breakdown': '{1} — clic para ver el detalle', 'No points yet': 'Aún sin puntos',
  'cards in hand': 'cartas en la mano', 'resource cards': 'cartas de recurso', 'scrolls': 'cartas de desarrollo', 'guards played': 'guardias jugadas', 'longest road': 'camino más largo',
  '({*} shown)': '({1} visibles)', 'includes hidden Monuments': 'incluye Monumentos ocultos', '⏳ acting': '⏳ jugando', 'Skip': 'Saltar', 'no cards': 'sin cartas', 'Cards in hand': 'Cartas en la mano',
  'Skip ahead for the player(s) holding up the game? (Random discards / auto-roll / end their turn)': '¿Avanzar por quien está frenando la partida? (Descartes al azar / tirar solo / terminar su turno)',
  'bank: {*}{*}': 'banco: {1}{2}', 'Dice stats': 'Estadísticas de dados', 'Details': 'Detalles', 'Log & chat': 'Registro y chat',
  '{*} roll{*} · 7s: {*}': '{1} tirada{2} · 7s: {3}', 'No rolls yet': 'Aún sin tiradas', 'expected': 'esperado', 'You have a building on this number': 'Tienes un edificio en este número',
  '🏆 How the points add up': '🏆 Cómo se suman los puntos', 'First to': 'El primero en llegar a', 'points wins, on their own turn.{*}': 'puntos gana, en su propio turno.{1}',
  "Other players' hidden Monuments only show at the end.": 'Los Monumentos ocultos de los demás solo se ven al final.', 'plus any hidden Monuments': 'más los Monumentos ocultos',
  'What scores': 'Qué da puntos', 'Player': 'Jugador', 'Total': 'Total',
  '🏠 Settlement: 1 point': '🏠 Poblado: 1 punto', '🏰 City: 2 points': '🏰 Ciudad: 2 puntos',
  '🛤️ Grand Route: 2 points for the longest road (5 or more), until someone builds a longer one': '🛤️ Gran Ruta: 2 puntos por el camino más largo (5 o más), hasta que alguien construya uno más largo',
  "👑 Capital: 2 points each — the first to level 4 of a city track founds it; the first to level 5 takes it over. Capitals can't be sacked": '👑 Capital: 2 puntos cada una — el primero en llegar al nivel 4 de una rama la funda; el primero en llegar al nivel 5 se la queda. Las capitales no se pueden saquear',
  '⚔️ Defender of the Isle: 1 point each time you alone have the strongest wardens when the island holds': '⚔️ Defensor de la Isla: 1 punto cada vez que tú solo tienes los guardianes más fuertes cuando la isla resiste',
  '💰 Merchant: 1 point while the merchant is yours (until someone plays another Merchant)': '💰 Mercader: 1 punto mientras el mercader sea tuyo (hasta que alguien juegue otro Mercader)',
  "📜 Point edicts (Printing Press, Charter): 1 point each, counted as soon as they're drawn": '📜 Edictos de punto (Imprenta, Fuero): 1 punto cada uno, cuentan en cuanto se roban',
  '🛡️ Strongest Watch: 2 points for the first to play 3 Guards, until someone plays more': '🛡️ Guardia Suprema: 2 puntos para el primero en jugar 3 Guardias, hasta que alguien juegue más',
  '🗿 Monument card: 1 point, hidden until the end (it counts for you right away)': '🗿 Carta de Monumento: 1 punto, oculta hasta el final (cuenta para ti desde ya)',
  'Settlements: {*}': 'Poblados: {1}', 'Cities: {*}': 'Ciudades: {1}',
  '🎲 Dice statistics': '🎲 Estadísticas de dados',
  '{*} rolls so far. "Expected" is how often each number should come up with fair dice. ★ marks numbers your buildings sit on.': '{1} tiradas hasta ahora. "Esperado" es cuántas veces debería salir cada número con dados justos. ★ marca los números donde tienes edificios.',
  'Roll': 'Tirada', 'Times': 'Veces', 'Expected': 'Esperado', 'Share / odds': 'Porcentaje / probabilidad', 'Last seen': 'Última vez', 'By player': 'Por jugador',
  'Rolls': 'Tiradas', 'Avg': 'Prom.', 'Harvested': 'Cosechado', 'Cards collected from dice rolls': 'Cartas obtenidas con los dados',
  'never': 'nunca', 'last roll': 'última tirada', '{*} roll{*} ago': 'hace {1} tirada{2}', 'Close': 'Cerrar',
  // ---------- dialogs ----------
  'The bandits strike!': '¡Atacan los bandidos!', 'You hold more than {*} cards{*}. Choose': 'Tienes más de {1} cartas{2}. Elige', 'to discard.': 'para descartar.',
  '({*} + 2 for each city wall)': '({1} + 2 por cada muralla)', '{*} / {*} selected — ready': '{1} / {2} elegidas — listo', '{*} / {*} selected': '{1} / {2} elegidas', 'Discard': 'Descartar',
  '📜 Development cards': '📜 Cartas de desarrollo',
  'Cost 🐑🌾🪨. You draw a random card. You may play one per turn, before or after rolling, but not on the turn you bought it.': 'Cuesta 🐑🌾🪨. Robas una carta al azar. Puedes jugar una por turno, antes o después de tirar, pero no el turno en que la compraste.',
  '🥷 Pick a card to steal': '🥷 Elige una carta para robar', 'any player next to the bandit': 'cualquier jugador junto al bandido', 'their hand': 'su mano',
  'Cards are face down and shuffled. Choose one from {*}.': 'Las cartas están boca abajo y mezcladas. Elige una de {1}.', '{*} cards': '{1} cartas', '{*} card': '{1} carta',
  'Take any 2 resources from the bank. Picked: {*}': 'Toma 2 recursos cualesquiera del banco. Elegidos: {1}', 'Cancel': 'Cancelar', 'Take them': 'Tomarlos',
  'Name a resource. Every other player hands you all of theirs.': 'Nombra un recurso. Cada otro jugador te entrega todo lo que tenga.', 'Seize it': 'Confiscar',
  'bank {*}': 'banco {1}', 'Trade': 'Comerciar', '🤝 Players': '🤝 Jugadores', 'Same resource on both sides': 'El mismo recurso en ambos lados',
  'Everyone sees your offer and can accept or counter; you choose who to trade with.': 'Todos ven tu oferta y pueden aceptar o contraofertar; tú eliges con quién cambiar.',
  'You give': 'Das', 'You want': 'Quieres', 'Offer to everyone': 'Ofrecer a todos', 'of {*}': 'de {1}', 'have {*}': 'tienes {1}', '{*}:1 · have {*}': '{1}:1 · tienes {2}',
  'Add what you give — each + adds one full lot at your rate.': 'Añade lo que das — cada + suma un lote completo a tu tasa.', 'You can take': 'Puedes tomar', 'more card{*}.': 'carta{1} más.',
  'Too many — remove {*}.': 'Demasiadas — quita {1}.', 'Ready.': 'Listo.', '— build on a harbor ⚓ for better rates': '— construye en un puerto ⚓ para mejores tasas',
  'harbor rate': 'tasa de puerto', 'Trade with the bank': 'Comerciar con el banco', 'Your rates: {*}{*}': 'Tus tasas: {1}{2}', 'Trade with the bank: {*} → {*}': 'Comerciar con el banco: {1} → {2}',
  'Traded with the bank': 'Cambiaste con el banco', 'Counter-offer to {*}': 'Contraoferta a {1}',
  'They see your terms and can accept them instead of their original offer.': 'Verá tus condiciones y podrá aceptarlas en lugar de su oferta original.', 'Send counter': 'Enviar contraoferta',
  'you give {*} · you get {*}': 'das {1} · recibes {2}', 'counters': 'contraoferta', 'Accept counter': 'Aceptar contraoferta', 'Trade with {*}': 'Cambiar con {1}',
  'declined': 'rechazó', 'thinking…': 'pensando…', 'Your offer': 'Tu oferta', 'You give: {*}': 'Das: {1}', 'You get: {*}': 'Recibes: {1}', 'Cancel offer': 'Cancelar oferta',
  '{*} wants to trade': '{1} quiere comerciar', '✓ Accepted': '✓ Aceptada', 'Accept': 'Aceptar', '✗ Declined': '✗ Rechazada', 'Decline': 'Rechazar',
  'Edit counter': 'Editar contraoferta', 'Counter…': 'Contraofertar…', "You don't have those cards": 'No tienes esas cartas', 'Your counter: you give {*} · you get {*}': 'Tu contraoferta: das {1} · recibes {2}',
  'Back to lobby for a rematch': 'Volver a la sala para la revancha', 'The host can start a rematch.': 'El anfitrión puede iniciar la revancha.',
  '▶ Watch replay': '▶ Ver repetición', '🎲 Dice stats': '🎲 Estadísticas de dados', '💾 Download game': '💾 Descargar partida', 'View board': 'Ver tablero',
  // ---------- saves and replays ----------
  'Could not load the replay engine': 'No se pudo cargar el motor de repeticiones', 'Could not save the game': 'No se pudo guardar la partida', '💾 Saved {*}': '💾 Guardado {1}',
  'finished — {*} won': 'terminada — ganó {1}', 'in progress': 'en curso', 'That file is not valid JSON': 'Ese archivo no es JSON válido',
  'That file is not a Hexhaven save': 'Ese archivo no es una partida de Hexhaven', 'This save has no history': 'Este archivo no tiene historial',
  'Continue this game…': 'Continuar esta partida…', 'Watch replay': 'Ver repetición',
  "Which seat are you? You'll be the host; friends join with the new room code and click their seat.": '¿Qué asiento eres? Serás el anfitrión; tus amigos entran con el nuevo código y eligen su asiento.',
  'Host': 'Anfitrión', 'Every seat is taken right now.': 'Todos los asientos están ocupados ahora.', 'This game is already running — pick your seat:': 'Esta partida ya está en curso — elige tu asiento:',
  'rolled the dice': 'tiró los dados', 'discarded': 'descartó', 'moved the bandit': 'movió al bandido', 'stole a card': 'robó una carta', 'built a settlement': 'construyó un poblado',
  'built a city': 'construyó una ciudad', 'built a road': 'construyó un camino', 'skipped free roads': 'saltó los caminos gratis', 'bought a development card': 'compró una carta de desarrollo',
  'played a development card': 'jugó una carta de desarrollo', 'traded with the bank': 'cambió con el banco', 'offered a trade': 'ofreció un intercambio', 'answered a trade': 'respondió a un intercambio',
  'completed a trade': 'completó un intercambio', 'withdrew a trade': 'retiró un intercambio', 'ended their turn': 'terminó su turno', 'finished building': 'terminó de construir',
  'skipped a stalled player': 'saltó a un jugador detenido', 'built a city wall': 'construyó una muralla', 'raised a warden': 'reclutó un guardián', 'activated a warden': 'activó un guardián',
  'promoted a warden': 'ascendió un guardián', 'moved a warden': 'movió un guardián', 'pushed a warden away': 'expulsó a un guardián', 'chased the bandit': 'ahuyentó al bandido',
  'improved a city track': 'mejoró una rama de la ciudad', 'lost a city to the raiders': 'perdió una ciudad ante los invasores', 'took a free resource': 'tomó un recurso gratis',
  'drew an edict': 'robó un edicto', 'played an edict': 'jugó un edicto',
  'The history stops making sense at move {*} ("{*}")': 'El historial deja de tener sentido en la jugada {1} ("{2}")', 'Start of the game': 'Inicio de la partida',
  '⏱️ The turn timer ran out': '⏱️ Se acabó el tiempo del turno', '🎲 New dice seed (a save was downloaded)': '🎲 Nueva semilla de dados (se descargó un archivo)', 'Seat {*}': 'Asiento {1}',
  '⏸ Pause': '⏸ Pausa', '▶ Play': '▶ Reproducir', 'Speed': 'Velocidad', 'Move {*} / {*} · Turn {*}': 'Jugada {1} / {2} · Turno {3}', 'Play from here…': 'Jugar desde aquí…', 'Exit replay': 'Salir de la repetición',
  'Start a new room from move {*}. Which seat are you? Friends join with the new code and click their seat.': 'Abre una sala nueva desde la jugada {1}. ¿Qué asiento eres? Tus amigos entran con el nuevo código y eligen su asiento.',
  'Download this replay': 'Descargar esta repetición', 'Step back (←)': 'Atrás (←)', 'Step forward (→)': 'Adelante (→)', 'Start (Home)': 'Inicio (Home)', 'End (End)': 'Final (End)',
  // ---------- Crowns & Raiders: screens ----------
  '⛵ Raiders': '⛵ Invasores', 'ship {*}/{*} · {*} raids so far': 'barco {1}/{2} · {3} invasiones hasta ahora', 'ship {*}/{*} · {*} raid so far': 'barco {1}/{2} · {3} invasión hasta ahora', 'ship {*}/{*}': 'barco {1}/{2}', '· {*} raids so far': '· {1} invasiones hasta ahora', '· {*} raid so far': '· {1} invasión hasta ahora', 'nothing to plunder yet': 'aún no hay nada que saquear',
  'the island would hold': 'la isla resistiría', 'the island would fall': 'la isla caería', '🏜️ The bandit stays in the dunes until the first raid': '🏜️ El bandido se queda en las dunas hasta la primera invasión',
  'raiders vs 🛡️': 'invasores vs 🛡️', 'wardens · {*}': 'guardianes · {1}', 'Event die: {*}': 'Dado de evento: {1}',
  'Raiders: one per city on the island. Wardens: the ranks of all active wardens added up. If the raiders are stronger, the players with the weakest wardens each lose a city.': 'Invasores: uno por cada ciudad de la isla. Guardianes: la suma de los rangos de todos los guardianes activos. Si los invasores son más fuertes, los jugadores con los guardianes más débiles pierden una ciudad cada uno.',
  '⚔️ The raiders won — click the city you lose (it becomes a settlement)': '⚔️ Ganaron los invasores — haz clic en la ciudad que pierdes (pasa a ser un poblado)',
  '⚔️ The raiders won — waiting for {*} to choose a city…': '⚔️ Ganaron los invasores — esperando a que {1} elija una ciudad…',
  'Click one of your cities to wall it (2 🧱 · hand limit +2)': 'Haz clic en una de tus ciudades para amurallarla (2 🧱 · límite de mano +2)',
  'Click a glowing corner along your roads to raise a warden': 'Haz clic en una esquina brillante junto a tus caminos para reclutar un guardián',
  'Click where your warden moves (along your roads) — Esc cancels': 'Haz clic adonde se mueve tu guardián (por tus caminos) — Esc cancela',
  'Click the weaker opponent warden to push away — Esc cancels': 'Haz clic en el guardián rival más débil para expulsarlo — Esc cancela',
  'Choose which city becomes your {*} capital': 'Elige qué ciudad será tu capital del {1}', '📜 {*}: {*} — Esc cancels': '📜 {1}: {2} — Esc cancela', 'ready': 'listo',
  "{*}'s city wall": 'Muralla de {1}', "{*}'s {*} (rank {*}) — {*}": '{2} de {1} (rango {3}) — {4}', 'active': 'activo', 'inactive': 'inactivo', '· click for actions': '· clic para acciones',
  "{*} capital of {*} (+2 points, can't be sacked)": 'Capital del {1} de {2} (+2 puntos, no se puede saquear)', 'The merchant ({*}: trades {*} 2:1, +1 point)': 'El mercader ({1}: cambia {2} 2:1, +1 punto)',
  'click the first tile to swap (not 2, 6, 8 or 12)': 'haz clic en la primera casilla a intercambiar (no 2, 6, 8 ni 12)', 'click the second tile': 'haz clic en la segunda casilla',
  'click one of your cities without a wall': 'haz clic en una de tus ciudades sin muralla', 'click the settlement to upgrade': 'haz clic en el poblado a mejorar',
  'click a warden to promote': 'haz clic en un guardián para ascenderlo', 'click a second warden, or press “Play now”': 'haz clic en un segundo guardián, o pulsa “Jugar ya”',
  'click a land tile next to your settlement or city': 'haz clic en una casilla de tierra junto a tu poblado o ciudad', 'click the tile the bandit moves to': 'haz clic en la casilla adonde va el bandido',
  "click the opponent's warden that deserts": 'haz clic en el guardián rival que deserta', 'click where your own warden joins (or press “Play now”)': 'haz clic donde se une tu guardián (o pulsa “Jugar ya”)',
  'click a road with a loose end': 'haz clic en un camino con un extremo suelto', "click an opponent's warden standing on your road": 'haz clic en un guardián rival sobre tu camino',
  'City wall — around one of your cities: +2 to your hand limit when a 7 is rolled. Lost if the city is sacked': 'Muralla — alrededor de una de tus ciudades: +2 a tu límite de mano al salir un 7. Se pierde si saquean la ciudad',
  'Warden — on an empty corner along your roads. Activate it with 🌾 to defend against the raiders, move, push weaker wardens or chase the bandit': 'Guardián — en una esquina libre junto a tus caminos. Actívalo con 🌾 para defender contra los invasores, moverse, expulsar guardianes más débiles o ahuyentar al bandido',
  'City — upgrades a settlement (2 points). Cities next to forest, pasture and mountains also make 📃 parchment, 🧵 linen and 🪙 silver': 'Ciudad — mejora un poblado (2 puntos). Las ciudades junto a bosque, pasto y montaña también producen 📃 pergamino, 🧵 lino y 🪙 plata',
  'How Crowns & Raiders works, and every edict': 'Cómo funciona Coronas e Invasores, y todos los edictos', 'Crowns and Raiders rules': 'Reglas de Coronas e Invasores',
  'Play now': 'Jugar ya', 'Cancel edict': 'Cancelar edicto', 'Top level reached': 'Nivel máximo alcanzado', 'You need a city to improve': 'Necesitas una ciudad para mejorar',
  'Improve on your turn (or in the builder phase)': 'Mejora en tu turno (o en la fase de construcción)', 'Needs {*} {*}': 'Necesita {1} {2}',
  'Level {*}: unlocks the power': 'Nivel {1}: desbloquea el poder', 'Level {*}: founds the capital if nobody has it': 'Nivel {1}: funda la capital si nadie la tiene',
  'Level {*}: takes the capital from someone below 5': 'Nivel {1}: quita la capital a quien esté por debajo de 5', 'Level {*}': 'Nivel {1}',
  'draws an edict when the {*} opens and the red die shows 1–{*}': 'roba un edicto cuando se abre la {1} y el dado rojo muestra 1–{2}', 'level 1 lets you draw edicts': 'el nivel 1 te permite robar edictos',
  'Lv 3:': 'Nv 3:', 'Lv {*}': 'Nv {1}', 'Maxed': 'Al máximo', 'Improve': 'Mejorar', 'free': 'gratis', 'yours': 'tuya',
  'Play it on your turn, before rolling': 'Juégalo en tu turno, antes de tirar', 'Play it on your turn, after rolling': 'Juégalo en tu turno, después de tirar',
  'Your edicts': 'Tus edictos', '🛡️ {*} wardens · strength': '🛡️ {1} guardianes · fuerza', '🛡️ {*} warden · strength': '🛡️ {1} guardián · fuerza', 'active —': 'activa —',
  'click one on the board to activate (🌾), promote, move, push or chase the bandit': 'haz clic en uno del tablero para activar (🌾), ascender, mover, expulsar o ahuyentar al bandido',
  '🛡️ No wardens yet. Raise one (🐑🪨) and activate it (🌾) to defend against the raiders.': '🛡️ Aún sin guardianes. Recluta uno (🐑🪨) y actívalo (🌾) para defender contra los invasores.',
  '👑 Level {*} makes a {*} capital — click the city it goes to': '👑 El nivel {1} crea una capital del {2} — haz clic en la ciudad donde va',
  'City improvements: {*}': 'Mejoras de ciudad: {1}', 'Strength of active wardens': 'Fuerza de los guardianes activos', 'Edicts in hand': 'Edictos en la mano', 'City walls': 'Murallas',
  '{*} capital (+2)': 'Capital del {1} (+2)', 'Defender of the Isle: +1 point each': 'Defensor de la Isla: +1 punto cada vez', '🛡️ Defender': '🛡️ Defensor', '💰 Merchant': '💰 Mercader',
  'Holds the merchant (+1)': 'Tiene al mercader (+1)', 'Point edicts drawn': 'Edictos de punto robados', 'Waterworks': 'Acueducto',
  '👑 Crowns & Raiders': '👑 Coronas e Invasores', 'Commodities.': 'Mercancías.',
  'A city next to forest, pasture or mountains takes 1 resource + 1 commodity (📃 parchment, 🧵 linen, 🪙 silver) instead of 2 resources. Other cities still take 2.': 'Una ciudad junto a bosque, pasto o montaña recibe 1 recurso + 1 mercancía (📃 pergamino, 🧵 lino, 🪙 plata) en vez de 2 recursos. Las demás ciudades siguen recibiendo 2.',
  'City improvements.': 'Mejoras de ciudad.', 'Three tracks, levels 1–5, paid with commodities (level n costs n): {*}. You need a city. Level 3 unlocks a power: {*}.': 'Tres ramas, niveles 1–5, pagados con mercancías (el nivel n cuesta n): {1}. Necesitas una ciudad. El nivel 3 desbloquea un poder: {2}.',
  'Capitals.': 'Capitales.', 'The first to level 4 in a track turns one of their cities into its capital (+2 points, safe from raids). The first to level 5 takes it from anyone below 5.': 'El primero en llegar al nivel 4 de una rama convierte una de sus ciudades en su capital (+2 puntos, a salvo de invasiones). El primero en llegar al nivel 5 se la quita a quien esté por debajo de 5.',
  'The event die.': 'El dado de evento.', "Each roll also throws an event die, and the second number die is red. ⛵ moves the raiders' ship one step. A gate ({*}) gives an edict from that deck to everyone whose level n in the track covers the red die (1 to n+1).": 'Cada tirada incluye un dado de evento, y el segundo dado de número es rojo. ⛵ avanza un paso el barco invasor. Una puerta ({1}) da un edicto de ese mazo a todos los que, con nivel n en esa rama, cubran el dado rojo (de 1 a n+1).',
  'Raids.': 'Invasiones.', "When the ship arrives (step 7), the raiders (one per city on the island) fight all active wardens (their ranks added up). If the wardens win, the strongest player is Defender of the Isle (+1 point); a tie draws an edict each. If the raiders win, the players with the weakest wardens each lose a city (it becomes a settlement, and its wall is lost). Then every warden goes inactive. The bandit can't leave the dunes before the first raid.": 'Cuando llega el barco (paso 7), los invasores (uno por cada ciudad de la isla) luchan contra todos los guardianes activos (sumando sus rangos). Si ganan los guardianes, el jugador más fuerte es Defensor de la Isla (+1 punto); en caso de empate, cada uno roba un edicto. Si ganan los invasores, los jugadores con los guardianes más débiles pierden una ciudad cada uno (pasa a ser un poblado y pierde su muralla). Después, todos los guardianes quedan inactivos. El bandido no puede salir de las dunas antes de la primera invasión.',
  'Wardens.': 'Guardianes.', 'Raise one (🐑🪨) on a free corner along your roads, then activate it (🌾). From the next turn an active warden can move along your roads, push a weaker opponent warden away, or chase the bandit off a tile it touches; acting makes it inactive again. Promote with 🐑🪨: rank 2 Veteran, rank 3 Champion (needs Council level 3). Wardens block roads and settlements like buildings.': 'Recluta uno (🐑🪨) en una esquina libre junto a tus caminos y actívalo (🌾). Desde el turno siguiente, un guardián activo puede moverse por tus caminos, expulsar a un guardián rival más débil o ahuyentar al bandido de una casilla que toque; al actuar vuelve a quedar inactivo. Asciende con 🐑🪨: rango 2 Veterano, rango 3 Campeón (requiere Consejo nivel 3). Los guardianes bloquean caminos y poblados como los edificios.',
  'Walls': 'Murallas', '(🧱🧱) go around your cities: +2 cards each to your hand limit when a 7 is rolled. At most 3.': '(🧱🧱) rodean tus ciudades: +2 cartas cada una a tu límite de mano al salir un 7. Como máximo 3.',
  'Edicts': 'Edictos', 'replace development cards. Play them on your turn after rolling (Weighted Dice before rolling), as many as you like. You hold at most 4. Point edicts (+1) are revealed at once. Played edicts go back under their deck.': 'reemplazan a las cartas de desarrollo. Juégalos en tu turno después de tirar (los Dados cargados antes de tirar), tantos como quieras. Puedes tener como máximo 4. Los edictos de punto (+1) se revelan al instante. Los edictos jugados vuelven debajo de su mazo.',
  'Setup.': 'Preparación.', 'Your second piece is a city. First to': 'Tu segunda pieza es una ciudad. El primero en llegar a', 'points wins (unless the host changed it).': 'puntos gana (salvo que el anfitrión lo cambie).',
  '{*} edicts': 'Edictos del {1}', '{*} Guild edicts': 'Edictos del Gremio',
  '💧 Waterworks': '💧 Acueducto', "The roll gave you nothing, so your Academy's Waterworks lets you take any one resource.": 'La tirada no te dio nada, así que el Acueducto de tu Academia te deja tomar un recurso a elección.',
  '📜 Draw an edict': '📜 Roba un edicto', 'You shared the honor of defending the isle. Choose the deck to draw from.': 'Compartiste el honor de defender la isla. Elige de qué mazo robar.', '{*} left': 'quedan {1}',
  'Only on your turn (or in the builder phase)': 'Solo en tu turno (o en la fase de construcción)', 'Only after rolling, on your own turn': 'Solo después de tirar, en tu turno',
  'Activate it first': 'Actívalo primero', 'Activated this turn — it can act from your next turn': 'Activado este turno — puede actuar desde tu próximo turno', '🔥 active': '🔥 activo',
  'Already active': 'Ya está activo', 'Needs 1 wheat': 'Necesita 1 de trigo', 'Already a Champion': 'Ya es Campeón', 'Champions need Council level 3': 'Los Campeones requieren Consejo nivel 3',
  'No pieces of that rank left': 'No quedan piezas de ese rango', 'Needs 1 fleece and 1 iron': 'Necesita 1 de lana y 1 de hierro', '🔥 Activate': '🔥 Activar', '⬆️ Promote to {*}': '⬆️ Ascender a {1}',
  '🚶 Move along your roads': '🚶 Moverse por tus caminos', 'No free corner it can reach': 'No hay esquina libre a su alcance', '⚔️ Push away a weaker warden': '⚔️ Expulsar a un guardián más débil',
  'No weaker opponent warden within reach': 'No hay guardianes rivales más débiles a su alcance', '🥷 Chase the bandit away': '🥷 Ahuyentar al bandido',
  'The bandit stays in the dunes until the first raid': 'El bandido se queda en las dunas hasta la primera invasión', 'The bandit is not on a tile this warden touches': 'El bandido no está en una casilla que toque este guardián',
  '🛡️ Your {*}': '🛡️ Tu {1}', 'rank {*} · {*}': 'rango {1} · {2}',
  'Active wardens defend the island when the raiders land. Moving, pushing or chasing makes the warden inactive again.': 'Los guardianes activos defienden la isla cuando desembarcan los invasores. Mover, expulsar o ahuyentar deja al guardián inactivo otra vez.',
  'Red die': 'Dado rojo', 'White die': 'Dado blanco', 'Total {*}{*}': 'Total {1}{2}', '— the bandits strike!': '— ¡atacan los bandidos!',
  'Nobody has more points than you right now.': 'Ahora nadie tiene más puntos que tú.', 'Nobody else holds an edict right now.': 'Ahora nadie más tiene edictos.',
  '{*} points': '{1} puntos', '{*} edicts': '{1} edictos', '{*} edict': '{1} edicto', 'There is nothing you can pick right now.': 'Ahora no hay nada que puedas elegir.',
  "You'll pick on the board: {*}.": 'Elegirás en el tablero: {1}.', 'Choose on the board': 'Elegir en el tablero', 'Play it': 'Jugarlo', '{*} edict': 'Edicto del {1}', 'Keep it': 'Guardarlo',
  '⚔️ The raiders land!': '⚔️ ¡Desembarcan los invasores!', 'raid {*}': 'invasión {1}', '⛵ Raiders': '⛵ Invasores', 'one per city': 'uno por ciudad', '🛡️ Wardens': '🛡️ Guardianes',
  'active ranks': 'rangos activos', 'click to close': 'clic para cerrar', '🛡️ The island holds!': '🛡️ ¡La isla resiste!', 'You are': 'Eres', '(+1 point)': '(+1 punto)',
  'is Defender of the Isle (+1 point)': 'es Defensor de la Isla (+1 punto)', '{*} share the honor and each draw an edict': '{1} comparten el honor y cada uno roba un edicto',
  '🔥 The raiders win!': '🔥 ¡Ganan los invasores!', 'You lose a city{*}{*}': 'Pierdes una ciudad{1}{2}', '— click which one on the board': '— haz clic en cuál en el tablero',
  ', and so do {*}': ', y también {1}', '{*} each lose a city (the weakest defense)': '{1} pierden una ciudad cada uno (la defensa más débil)',
  '{*} loses a city (the weakest defense)': '{1} pierde una ciudad (la defensa más débil)', '🔥 The raiders win…': '🔥 Ganan los invasores…',
  'but every city left is a protected capital': 'pero todas las ciudades que quedan son capitales protegidas', '⛵ The raiders land…': '⛵ Desembarcan los invasores…',
  'and find no cities to plunder': 'y no encuentran ciudades que saquear', 'vs': 'vs',
  '🎲 Harvest': '🎲 Cosecha', 'Someone': 'Alguien', 'Edicts in hand': 'Edictos en la mano',

  // ---------- server: log ----------
  '{*} rejoined.': '{1} volvió.', '{*} joined the room.': '{1} entró a la sala.', '{*} left the room.': '{1} salió de la sala.', '{*} was removed.': '{1} fue expulsado.',
  'Game started! Everyone rolls — highest roll goes first.': '¡Empezó la partida! Todos tiran — el más alto empieza.',
  'Bandits! {*} must discard half their cards.': '¡Bandidos! {1} debe descartar la mitad de sus cartas.',
  '🏜️ The bandit stays in the dunes until the raiders first reach the island.': '🏜️ El bandido se queda en las dunas hasta que los invasores lleguen por primera vez.',
  'Bandits! {*} moves the bandit.': '¡Bandidos! {1} mueve al bandido.', '🎲 {*} rolled {*} for turn order.': '🎲 {1} sacó {2} para el orden de turno.',
  'Tie at {*} between {*} — roll again!': 'Empate a {1} entre {2} — ¡tiren otra vez!', '{*} goes first! Turn order: {*}.': '¡{1} empieza! Orden de turno: {2}.',
  '{*}, place your first settlement.': '{1}, coloca tu primer poblado.', 'Back in the lobby — the host can start a new game.': 'De vuelta en la sala — el anfitrión puede empezar otra partida.',
  '🛤️ {*} now has the Grand Route ({*} roads).': '🛤️ {1} tiene ahora la Gran Ruta ({2} caminos).', '🛤️ Nobody holds the Grand Route right now.': '🛤️ Ahora nadie tiene la Gran Ruta.',
  '🛡️ {*} now commands the Strongest Watch ({*} guards).': '🛡️ {1} comanda ahora la Guardia Suprema ({2} guardias).',
  '🏆 {*} wins with {*} victory points!': '🏆 ¡{1} gana con {2} puntos de victoria!', 'The bank is short on {*} — nobody receives it.': 'Al banco le falta {1} — nadie lo recibe.',
  'Harvest — {*}': 'Cosecha — {1}', 'Nobody harvests anything.': 'Nadie cosecha nada.', '🥷 {*} stole a card from {*}.': '🥷 {1} le robó una carta a {2}.',
  'You stole 1 {*} from {*}.': 'Le robaste 1 {1} a {2}.', '{*} stole 1 {*} from you.': '{1} te robó 1 {2}.', "— {*}'s turn —": '— Turno de {1} —',
  '{*} is now the host.': '{1} es ahora el anfitrión.', '🎲 {*} rolled {*} ({*}+{*}).': '🎲 {1} sacó {2} ({3}+{4}).', '{*} discarded {*} cards.': '{1} descartó {2} cartas.',
  '{*} moved the bandit.': '{1} movió al bandido.', '{*} placed a {*}.': '{1} colocó {2}.', '{*} collects {*}.': '{1} recibe {2}.', '🏠 {*} built a settlement.': '🏠 {1} construyó un poblado.',
  '🏰 {*} upgraded a settlement to a city.': '🏰 {1} mejoró un poblado a ciudad.', 'Setup complete! {*} rolls first.': '¡Preparación completa! {1} tira primero.', '{*}, place a settlement.': '{1}, coloca un poblado.',
  '{*} built a free road.': '{1} construyó un camino gratis.', '{*} built a road.': '{1} construyó un camino.', '📜 {*} bought a development card.': '📜 {1} compró una carta de desarrollo.',
  'Your new development card: {*}.': 'Tu nueva carta de desarrollo: {1}.', '📜 {*} played Bounty and took {*}.': '📜 {1} jugó Botín y tomó {2}.',
  '📜 {*} played Embargo and seized all {*} ({*}).': '📜 {1} jugó Embargo y confiscó todo el {2} ({3}).', '📜 {*} played a Guard.': '📜 {1} jugó una Guardia.', '📜 {*} played Road Crew.': '📜 {1} jugó Cuadrilla de caminos.',
  '🏦 {*} traded {*} to the bank for {*}.': '🏦 {1} cambió {2} al banco por {3}.', '🤝 {*} offers {*} for {*}.': '🤝 {1} ofrece {2} por {3}.', '🤝 {*} counters: {*} for {*}.': '🤝 {1} contraoferta: {2} por {3}.',
  '🤝 {*} traded {*} with {*} for {*}.': '🤝 {1} cambió {2} con {3} por {4}.', '⏭️ Skipping ahead for {*}.': '⏭️ Avanzando por {1}.', '💡 {*} suggested: {*}.': '💡 {1} sugirió: {2}.',
  "✅ {*} applied {*}'s suggestion: {*}.": '✅ {1} aplicó la sugerencia de {2}: {3}.', '{*} withdrew their suggestion.': '{1} retiró su sugerencia.', "{*} dismissed {*}'s suggestion.": '{1} descartó la sugerencia de {2}.',
  '⏱️ Time ran out.': '⏱️ Se acabó el tiempo.', 'Crowns & Raiders mode': 'modo Coronas e Invasores', 'classic mode': 'modo clásico', 'points to win {*}': 'puntos para ganar {1}', 'island {*}': 'isla {1}',
  'hand limit {*}': 'límite de mano {1}', 'builder phase {*}': 'fase de construcción {1}', 'turn timer {*}': 'reloj de turno {1}', 'friendly bandit {*}': 'bandido amistoso {1}', 'first raid after {*} ship steps': 'primera invasión tras {1} pasos del barco',
  '💾 Game loaded from a save (turn {*}). Others rejoin with this room code by picking their seat.': '💾 Partida cargada desde un archivo (turno {1}). Los demás vuelven con este código eligiendo su asiento.',
  'Kept the full history — the replay still works.': 'Se conservó todo el historial — la repetición sigue funcionando.',
  'Kept the full history. "seed" was empty, so the dice are freshly random from here.': 'Se conservó todo el historial. "seed" estaba vacío, así que los dados son nuevos y al azar desde aquí.',
  'The snapshot was edited (or the history is incomplete), so the game continues from the snapshot and its replay starts here.': 'El estado fue editado (o el historial está incompleto), así que la partida sigue desde ese estado y su repetición empieza aquí.',
  'This save has no history; the replay starts here.': 'Este archivo no tiene historial; la repetición empieza aquí.', '"seed" was empty, so the dice are freshly random.': '"seed" estaba vacío, así que los dados son nuevos y al azar.',
  // crowns log
  '👑 Crowns & Raiders: cities make commodities, the raiders are coming, and the first to 13 points wins.': '👑 Coronas e Invasores: las ciudades producen mercancías, los invasores se acercan y gana el primero en llegar a 13 puntos.',
  '💧 Waterworks: {*} got nothing this roll and may take any one resource.': '💧 Acueducto: {1} no recibió nada en esta tirada y puede tomar un recurso a elección.',
  "⛵ The raiders' ship sails closer ({*}/{*}).": '⛵ El barco invasor se acerca ({1}/{2}).', '🚪 The {*} gate opens (red die {*}).': '🚪 Se abre la puerta del {1} (dado rojo {2}).',
  'The {*} edicts have run out.': 'Se acabaron los edictos del {1}.', '📜 {*} drew {*} — +1 point!': '📜 {1} robó {2} — ¡+1 punto!',
  "📜 {*}'s hand of edicts is full ({*}); the {*} edict goes back.": '📜 {1} tiene la mano de edictos llena ({2}); el edicto del {3} vuelve al mazo.', '📜 {*} drew a {*} edict.': '📜 {1} robó un edicto del {2}.',
  'Your new edict: {*}.': 'Tu nuevo edicto: {1}.', '⚔️ The raiders land! Raider strength {*} (one per city) against wardens {*}.': '⚔️ ¡Desembarcan los invasores! Fuerza invasora {1} (uno por ciudad) contra guardianes {2}.',
  '🛡️ The island holds! {*} is Defender of the Isle (+1 point).': '🛡️ ¡La isla resiste! {1} es Defensor de la Isla (+1 punto).', '🛡️ The island holds! {*} share the honor and each draw an edict.': '🛡️ ¡La isla resiste! {1} comparten el honor y cada uno roba un edicto.',
  '🔥 The raiders win. {*} lose a city.': '🔥 Ganan los invasores. {1} pierden una ciudad.', '🔥 The raiders win, but every city is a protected capital.': '🔥 Ganan los invasores, pero todas las ciudades son capitales protegidas.',
  'There are no cities to plunder yet; the raiders sail away.': 'Aún no hay ciudades que saquear; los invasores se van.', '🏜️ The bandit is free to leave the dunes from now on.': '🏜️ Desde ahora el bandido puede salir de las dunas.',
  "🔥 {*}'s city is sacked and becomes a settlement.": '🔥 Saquean la ciudad de {1} y pasa a ser un poblado.', "{*}'s {*} is pushed to another corner.": 'El {2} de {1} es empujado a otra esquina.',
  "{*}'s {*} has nowhere to go and leaves the board.": 'El {2} de {1} no tiene adónde ir y sale del tablero.', '🧱 {*} built a city wall (hand limit +2).': '🧱 {1} construyó una muralla (límite de mano +2).',
  '🛡️ {*} raised a Warden.': '🛡️ {1} reclutó un Guardián.', '🔥 {*} activated a {*}.': '🔥 {1} activó un {2}.', '⬆️ {*} promoted a warden to {*}.': '⬆️ {1} ascendió un guardián a {2}.',
  "{*}'s {*} moved.": 'El {2} de {1} se movió.', "⚔️ {*}'s {*} pushed an opponent's warden away.": '⚔️ El {2} de {1} expulsó a un guardián rival.', "🛡️ {*}'s {*} drives the bandit off — they move it.": '🛡️ El {2} de {1} ahuyenta al bandido — lo mueve.',
  '🏛️ {*} raised their {*} to level {*}.': '🏛️ {1} subió su {2} al nivel {3}.', '✨ {*} unlocks the {*}.': '✨ {1} desbloquea: {2}.', '👑 {*} takes the {*} capital from {*}!': '👑 ¡{1} le quita la capital del {2} a {3}!',
  '👑 {*} founds the {*} capital (+2 points).': '👑 {1} funda la capital del {2} (+2 puntos).', '💧 {*} took 1 {*} (Waterworks).': '💧 {1} tomó 1 {2} (Acueducto).', '📜 {*} played {*}: {*}': '📜 {1} jugó {2}: {3}', '📜 {*} played {*}.': '📜 {1} jugó {2}.',
  'the number dice will show {*} and {*}': 'los dados de número mostrarán {1} y {2}', 'swapped a {*} and a {*}': 'intercambió un {1} y un {2}', 'the next improvement this turn costs one commodity less': 'la próxima mejora de este turno cuesta una mercancía menos',
  'a free city wall': 'una muralla gratis', 'a settlement became a city': 'un poblado pasó a ser ciudad', '2 free roads': '2 caminos gratis', '{*} wardens promoted': '{1} guardianes ascendidos', '{*} warden promoted': '{1} guardián ascendido',
  '{*} commodities collected': '{1} mercancías cobradas', '{*} commodity collected': '{1} mercancía cobrada', 'took 2 cards from {*}': 'le tomó 2 cartas a {1}', 'the merchant now trades {*} 2:1 for them (+1 point)': 'el mercader ahora le cambia {1} 2:1 (+1 punto)',
  '{*} trades 2:1 this turn': '{1} se cambia 2:1 este turno', 'collected {*} {*}': 'cobró {1} {2}', 'the bandit moved': 'el bandido se movió', "an opponent's {*} deserts{*}": 'un {1} rival deserta{2}',
  'and a {*} joins them': 'y se le une un {1}', 'they move one of their own roads': 'mueve uno de sus propios caminos', '{*} loses a road': '{1} pierde un camino', "an opponent's warden is pushed away": 'un guardián rival es expulsado',
  '{*} discard half their cards': '{1} descartan la mitad de sus cartas', 'nobody is affected': 'nadie se ve afectado', 'took an edict from {*}': 'le tomó un edicto a {1}', 'You took {*} from {*}.': 'Le tomaste {1} a {2}.',
  '{*} took your {*}.': '{1} te tomó {2}.', '{*} wardens activated': '{1} guardianes activados', '{*} warden activated': '{1} guardián activado', '{*} bring 2 cards each': '{1} entregan 2 cartas cada uno', 'nobody has more points': 'nadie tiene más puntos',
  // ---------- server: refusals ----------
  'Please enter a name': 'Escribe un nombre', 'That name is taken in this room': 'Ese nombre ya está en uso en esta sala',
  'That game has already started. To get your seat back, join with the exact name you used.': 'Esa partida ya empezó. Para recuperar tu asiento, entra con el mismo nombre exacto.',
  'Room is full ({*} players max)': 'La sala está llena (máximo {1} jugadores)', 'Need at least 2 players to start': 'Se necesitan al menos 2 jugadores para empezar',
  'Only tied players re-roll': 'Solo los empatados vuelven a tirar', 'You are not in this roll-off': 'No participas en este desempate', 'You already rolled': 'Ya tiraste',
  'Invalid card amounts': 'Cantidades de cartas no válidas', 'You are not in this game': 'No estás en esta partida', 'Bad action': 'Acción no válida', 'The host is still here': 'El anfitrión sigue aquí',
  'Only the host can do that': 'Solo el anfitrión puede hacer eso', 'The game is over': 'La partida terminó', "It's not your turn": 'No es tu turno',
  'Crowns & Raiders uses edicts instead of development cards': 'Coronas e Invasores usa edictos en vez de cartas de desarrollo', 'You do not need to discard': 'No necesitas descartar',
  'Choose exactly {*} cards': 'Elige exactamente {1} cartas', 'The bandit cannot move until the raiders first reach the island': 'El bandido no puede moverse hasta que los invasores lleguen por primera vez',
  'Pick a tile': 'Elige una casilla', 'The bandit must move to a different tile': 'El bandido debe ir a otra casilla', 'Friendly bandit: that tile touches a player with 2 or fewer points': 'Bandido amistoso: esa casilla toca a un jugador con 2 puntos o menos',
  'You cannot steal from that player': 'No puedes robarle a ese jugador', 'Place a road next to your settlement': 'Coloca un camino junto a tu poblado',
  "You can't build there (too close to another settlement?)": 'No puedes construir ahí (¿muy cerca de otro poblado?)', 'You have no settlements left': 'No te quedan poblados',
  'Not enough resources for a settlement': 'No tienes recursos para un poblado', "You can't build a settlement there": 'No puedes construir un poblado ahí',
  'Cities are built on top of your own settlements': 'Las ciudades se construyen sobre tus propios poblados', 'You have no cities left': 'No te quedan ciudades', 'Not enough resources for a city': 'No tienes recursos para una ciudad',
  'Pick a road spot': 'Elige dónde va el camino', 'Place a settlement first': 'Coloca primero un poblado', 'The road must touch the settlement you just placed': 'El camino debe tocar el poblado que acabas de colocar',
  "You can't build a road there": 'No puedes construir un camino ahí', 'You have no roads left': 'No te quedan caminos', 'Not enough resources for a road': 'No tienes recursos para un camino',
  'No development cards left': 'No quedan cartas de desarrollo', 'Not enough resources for a development card': 'No tienes recursos para una carta de desarrollo',
  'You can only play one development card per turn': 'Solo puedes jugar una carta de desarrollo por turno', 'That card cannot be played': 'Esa carta no se puede jugar',
  "You can't play a development card on the turn you bought it": 'No puedes jugar una carta de desarrollo el turno en que la compraste', "You don't have that card": 'No tienes esa carta',
  'Pick two resources': 'Elige dos recursos', 'The bank does not have those': 'El banco no tiene esos', 'Pick a resource': 'Elige un recurso', 'Pick two different cards': 'Elige dos cartas distintas',
  'Choose what to give and what to take': 'Elige qué das y qué tomas', "Don't put the same card on both sides": 'No pongas la misma carta en ambos lados', '{*} trades in groups of {*}': '{1} se cambia en grupos de {2}',
  'That gives you {*} card{*} to take — you picked {*}': 'Eso te da {1} carta{2} para tomar — elegiste {3}', 'The bank only has {*} {*}': 'El banco solo tiene {1} {2}',
  'A trade needs cards on both sides': 'Un intercambio necesita cartas en ambos lados', "You don't have the cards you're offering": 'No tienes las cartas que ofreces', 'That offer is no longer open': 'Esa oferta ya no está abierta',
  'You made this offer': 'Tú hiciste esta oferta', 'A counter-offer needs cards on both sides': 'Una contraoferta necesita cartas en ambos lados', "You don't have the cards they want": 'No tienes las cartas que piden',
  'No open offer': 'No hay ofertas abiertas', 'That player has not accepted': 'Ese jugador no ha aceptado', "You don't have the cards for that trade": 'No tienes las cartas para ese intercambio',
  '{*} no longer has those cards': '{1} ya no tiene esas cartas', 'It is not your build phase': 'No es tu fase de construcción', 'Only the host can skip a connected player': 'Solo el anfitrión puede saltar a un jugador conectado',
  'Nothing to skip': 'No hay nada que saltar', 'Unknown action': 'Acción desconocida', 'Unknown color': 'Color desconocido', 'Color taken': 'Color ocupado',
  'Only the host can change settings — use Suggest instead': 'Solo el anfitrión puede cambiar los ajustes — usa Sugerir', 'As host, just change the setting directly': 'Como anfitrión, cambia el ajuste directamente',
  'That matches the current settings': 'Eso coincide con los ajustes actuales', 'That suggestion is gone': 'Esa sugerencia ya no existe', 'Only the host can apply suggestions': 'Solo el anfitrión puede aplicar sugerencias',
  'Only the host or the person who suggested it can remove it': 'Solo el anfitrión o quien la sugirió puede quitarla', 'Only the host can remove players': 'Solo el anfitrión puede expulsar jugadores',
  "You can't remove yourself": 'No puedes expulsarte a ti mismo', 'Only the host can start': 'Solo el anfitrión puede empezar', 'The game has not started yet': 'La partida aún no empezó',
  'Everyone is rolling for turn order': 'Todos están tirando por el orden de turno', 'Finish placing your starting pieces': 'Termina de colocar tus piezas iniciales', 'Roll the dice first': 'Primero tira los dados',
  'Waiting for players to discard': 'Esperando a que los jugadores descarten', 'Waiting for players to choose which city the raiders sack': 'Esperando a que los jugadores elijan qué ciudad saquean los invasores',
  'Move the bandit first': 'Primero mueve al bandido', 'Choose who to steal from first': 'Primero elige a quién robar', 'Place your free roads first': 'Primero coloca tus caminos gratis',
  'Only the current builder can act right now': 'Ahora solo puede actuar quien está construyendo', "You can't do that right now": 'Ahora no puedes hacer eso',
  'Pick one of your wardens': 'Elige uno de tus guardianes', 'That warden is already a Champion': 'Ese guardián ya es Campeón', 'Champions need the Council at level 3 (Citadel)': 'Los Campeones requieren el Consejo en nivel 3 (Ciudadela)',
  'A warden can only be promoted once per turn': 'Un guardián solo puede ascender una vez por turno', 'You have no {*} pieces left': 'No te quedan piezas de {1}', 'Promoting costs 1 fleece and 1 iron': 'Ascender cuesta 1 de lana y 1 de hierro',
  'Activate the warden first (1 wheat)': 'Primero activa al guardián (1 de trigo)', 'A warden activated this turn can act from next turn on': 'Un guardián activado este turno puede actuar desde el próximo turno',
  'Pick a corner on the board': 'Elige una esquina del tablero', 'Walls go around your own cities': 'Las murallas rodean tus propias ciudades', 'That city already has a wall': 'Esa ciudad ya tiene muralla',
  'You have no walls left (3 at most)': 'No te quedan murallas (máximo 3)', 'A wall costs 2 clay': 'Una muralla cuesta 2 de arcilla', 'Wardens go on an empty corner along your roads': 'Los guardianes van en una esquina libre junto a tus caminos',
  'You have no Warden pieces left': 'No te quedan piezas de Guardián', 'A warden costs 1 fleece and 1 iron': 'Un guardián cuesta 1 de lana y 1 de hierro', 'That warden is already active': 'Ese guardián ya está activo',
  'Activating costs 1 wheat': 'Activar cuesta 1 de trigo', 'Wardens move to an empty corner they can reach along your roads': 'Los guardianes se mueven a una esquina libre que alcancen por tus caminos',
  "Pick an opponent's warden you can reach along your roads": 'Elige un guardián rival que alcances por tus caminos', 'You can only push away a weaker warden': 'Solo puedes expulsar a un guardián más débil',
  'That warden is not next to the bandit': 'Ese guardián no está junto al bandido', 'Pick Guild, Council or Academy': 'Elige Gremio, Consejo o Academia', 'You need at least one city to improve': 'Necesitas al menos una ciudad para mejorar',
  'Your {*} is already at the top level': 'Tu {1} ya está en el nivel máximo', 'Level {*} costs {*} {*}': 'El nivel {1} cuesta {2} {3}', 'Choose one of your cities without a capital': 'Elige una de tus ciudades sin capital',
  'Choose which city becomes your capital': 'Elige qué ciudad será tu capital', 'The raiders are not after you': 'Los invasores no van por ti', 'Pick one of your cities (capitals are protected)': 'Elige una de tus ciudades (las capitales están protegidas)',
  'You have no free resource to take': 'No tienes recursos gratis para tomar', 'The bank is out of {*}': 'Al banco se le acabó {1}', 'You have no edict to draw': 'No tienes edictos para robar', 'Pick a deck': 'Elige un mazo',
  'That edict cannot be played': 'Ese edicto no se puede jugar', "You don't have that edict": 'No tienes ese edicto', 'Choose two dice between 1 and 6': 'Elige dos dados entre 1 y 6',
  'Pick two different numbered tiles': 'Elige dos casillas con número distintas', 'Tiles showing 2, 6, 8 or 12 cannot be swapped': 'Las casillas con 2, 6, 8 o 12 no se pueden intercambiar',
  'Pick one of your cities without a wall': 'Elige una de tus ciudades sin muralla', 'You have no walls left': 'No te quedan murallas', 'Pick one of your settlements': 'Elige uno de tus poblados',
  'This costs 2 iron and 1 wheat': 'Esto cuesta 2 de hierro y 1 de trigo', 'Pick one or two of your wardens': 'Elige uno o dos de tus guardianes', 'Pick a player with more points than you': 'Elige un jugador con más puntos que tú',
  'Pick a land tile next to your settlement or city': 'Elige una casilla de tierra junto a tu poblado o ciudad', 'Pick a resource or commodity': 'Elige un recurso o una mercancía', 'Name a resource': 'Nombra un recurso',
  'Name a commodity': 'Nombra una mercancía', 'Move the bandit to a different tile': 'Mueve al bandido a otra casilla', "Pick an opponent's warden": 'Elige un guardián rival',
  'Place your warden on an empty corner along your roads': 'Coloca tu guardián en una esquina libre junto a tus caminos', 'Pick a road': 'Elige un camino', 'Only a road with a loose end can be removed': 'Solo se puede quitar un camino con un extremo suelto',
  'That warden must stand on one of your roads': 'Ese guardián debe estar sobre uno de tus caminos', 'Pick a player who holds edicts': 'Elige a un jugador que tenga edictos', 'Your hand of edicts is full': 'Tu mano de edictos está llena',
  'Unknown edict': 'Edicto desconocido', 'No room with that code': 'No hay ninguna sala con ese código', 'Session not found': 'No se encontró la sesión', 'Only the host can save before the game ends': 'Solo el anfitrión puede guardar antes de que termine la partida',
  'Pick the seat you want to play': 'Elige el asiento con el que quieres jugar', 'Not found': 'No encontrado', 'Server error': 'Error del servidor', 'Body too large': 'Archivo demasiado grande',
  'That file is not a Hexhaven save (or is from a newer version)': 'Ese archivo no es una partida de Hexhaven (o es de una versión más nueva)', 'A save needs 2–{*} players': 'Una partida necesita 2–{1} jugadores',
  'Every player needs a different seat number (1, 2, 3, …)': 'Cada jugador necesita un número de asiento distinto (1, 2, 3, …)', 'Seat {*} needs a name': 'El asiento {1} necesita un nombre',
  'Two players are called "{*}"': 'Dos jugadores se llaman "{1}"', 'Seat {*}: color must be one of {*}': 'Asiento {1}: el color debe ser uno de {2}', 'Two players use the color {*}': 'Dos jugadores usan el color {1}',
  'This save has no replayable history': 'Este archivo no tiene historial para repetir', 'A Crowns & Raiders save needs its "crowns" section': 'Una partida de Coronas e Invasores necesita su sección "crowns"',
  'Map row {*} needs {*} tiles (it has {*})': 'La fila {1} del mapa necesita {2} casillas (tiene {3})', 'Map row {*}: unknown tile "{*}"': 'Fila {1} del mapa: casilla desconocida "{2}"',
  'Map row {*}: "{*}" needs a number 2–12 except 7 (dunes have none)': 'Fila {1} del mapa: "{2}" necesita un número 2–12 menos el 7 (las dunas no llevan)',
  'Unknown cards "{*}" (use Wo, Cl, Fl, Wh, Ir, Pa, Li, Si followed by a count)': 'Cartas desconocidas "{1}" (usa Wo, Cl, Fl, Wh, Ir, Pa, Li, Si seguidas de una cantidad)',
  'Unknown corner "{*}"': 'Esquina desconocida "{1}"', 'Unknown side "{*}"': 'Lado desconocido "{1}"', 'Unknown tile "{*}"': 'Casilla desconocida "{1}"', 'There is no seat {*}': 'No hay asiento {1}',
  'Bad JSON': 'JSON no válido', 'Harbor "{*}" must be on the coast': 'El puerto "{1}" debe estar en la costa',
  // ---------- new map, city panel ----------
  '🗺️ New map': '🗺️ Nuevo mapa', '🗳️ Ask for a new map': '🗳️ Pedir un mapa nuevo',
  'Deal a new island (only before anyone places a piece)': 'Generar una isla nueva (solo antes de que alguien coloque una pieza)',
  'Ask everyone to vote for a new island': 'Pedir a todos que voten por una isla nueva', 'Map vote': 'Votación del mapa',
  '🗳️ {*} wants a new map': '🗳️ {1} quiere un mapa nuevo',
  '{*} yes · {*} no · {*} of {*} decide (a tie goes to the host)': '{1} sí · {2} no · deciden {3} de {4} (en empate decide el anfitrión)',
  '{*} yes · {*} no · {*} of {*} decide': '{1} sí · {2} no · deciden {3} de {4}',
  'Tied — you decide:': 'Empate — tú decides:', 'Tied — the host decides.': 'Empate — decide el anfitrión.', '👍 Yes': '👍 Sí', '👎 No': '👎 No', 'Keep this map': 'Quedarse con este mapa',
  '🗺️ {*} rerolled the map.': '🗺️ {1} generó un mapa nuevo.', '🗺️ The vote was tied; {*} chose a new map.': '🗺️ La votación quedó empatada; {1} eligió un mapa nuevo.',
  '🗺️ The vote was tied; {*} kept this map.': '🗺️ La votación quedó empatada; {1} se quedó con este mapa.',
  '🗳️ {*} asks for a new map — vote yes or no.': '🗳️ {1} pide un mapa nuevo — vota sí o no.',
  '🗺️ The majority voted for a new map ({*} of {*}).': '🗺️ La mayoría votó por un mapa nuevo ({1} de {2}).',
  '🗺️ The majority kept this map ({*} of {*} said no).': '🗺️ La mayoría se quedó con este mapa ({1} de {2} dijeron que no).',
  'The map can only change before anyone places a piece': 'El mapa solo puede cambiar antes de que alguien coloque una pieza',
  'There is no tied vote to decide': 'No hay una votación empatada que decidir', 'There is no vote right now': 'Ahora no hay ninguna votación',
  '👑 Your city': '👑 Tu ciudad', 'Show your city panel': 'Mostrar tu panel de ciudad', 'Hide your city panel': 'Ocultar tu panel de ciudad',
  'rerolled the map': 'generó un mapa nuevo', 'voted on the map': 'votó sobre el mapa', 'decided the map vote': 'decidió la votación del mapa',
  // ---------- pieces of sentences built on the page ----------
  'Rejoin room {*} as {*}': 'Volver a la sala {1} como {2}', '…or join as someone new:': '…o entra como alguien nuevo:',
  '{*} of {*} in favor ·': '{1} de {2} a favor ·', 'selected — ready': 'elegidas — listo', 'saved {*}': 'guardada {1}', 'seat {*}': 'asiento {1}', 'Seat': 'Asiento',
  '· {*} players · {*}': '· {1} jugadores · {2}', '🛡️ Defender ×{*}': '🛡️ Defensor ×{1}', '{*}, then {*}': '{1}, luego {2}',
  'the first tile to swap (not 2, 6, 8 or 12)': 'la primera casilla a intercambiar (no 2, 6, 8 ni 12)', 'the second tile': 'la segunda casilla',
  'one of your cities without a wall': 'una de tus ciudades sin muralla', 'the settlement to upgrade': 'el poblado a mejorar', 'a warden to promote': 'un guardián para ascender',
  'a second warden, or press “Play now”': 'un segundo guardián, o pulsa “Jugar ya”', 'a land tile next to your settlement or city': 'una casilla de tierra junto a tu poblado o ciudad',
  'the tile the bandit moves to': 'la casilla adonde va el bandido', "the opponent's warden that deserts": 'el guardián rival que deserta',
  'where your own warden joins (or press “Play now”)': 'donde se une tu guardián (o pulsa “Jugar ya”)', 'a road with a loose end': 'un camino con un extremo suelto',
  "an opponent's warden standing on your road": 'un guardián rival sobre tu camino',
  "{*}'s {*} (rank {*}) — {*} · click for actions": '{2} de {1} (rango {3}) — {4} · clic para acciones',
  '{*}: rolled {*}× · expected {*}': '{1}: salió {2}× · esperado {3}', '{*} rolled {*} ({*}+{*})': '{1} sacó {2} ({3}+{4})',
  'event die: {*}': 'dado de evento: {1}', 'red die {*}': 'dado rojo {1}', 'die {*}': 'dado {1}',
  'The ship is {*} of {*} steps from the island': 'El barco lleva {1} de {2} pasos hacia la isla',
  'bank: {*}': 'banco: {1}', 'more {*}': 'más {1}', 'less {*}': 'menos {1}',
  "You'll pick on the board: {*}, then {*}.": 'Elegirás en el tablero: {1}, luego {2}.',
  'You lose a city — click which one on the board, and so do {*}': 'Pierdes una ciudad — haz clic en cuál en el tablero, y también {1}',
  'You lose a city — click which one on the board': 'Pierdes una ciudad — haz clic en cuál en el tablero',
  'You lose a city, and so do {*}': 'Pierdes una ciudad, y también {1}', 'You lose a city': 'Pierdes una ciudad', '{*}×{*} = {*}': '{1}×{2} = {3}', '{*}: {*}': '{1}: {2}',
};

// ---------- matching ----------
const EXACT = new Map(); const PATTERNS = [];
// Match 'A{*}B{*}C' against a string in one pass (no regex backtracking, so long paragraphs stay fast):
// it must start with A and end with C, and each middle piece is taken at its first place after the last one.
// Returns [whole, capture1, capture2, …] or null.
function matchParts(parts, s, fromRight) {
  const first = parts[0]; const last = parts[parts.length - 1];
  if (s.length < first.length + last.length || !s.startsWith(first) || !s.endsWith(last)) return null;
  const start = first.length; const end = s.length - last.length;
  if (end < start) return null;
  if (!fromRight) {
    const caps = [s]; let pos = start;
    for (let i = 1; i < parts.length - 1; i++) {
      const at = s.indexOf(parts[i], pos);
      if (at < 0 || at + parts[i].length > end) return null;
      caps.push(s.slice(pos, at)); pos = at + parts[i].length;
    }
    caps.push(s.slice(pos, end));
    return caps;
  }
  // the same, but each middle piece is taken at its last place (for when the first piece of text itself contains " — ")
  const caps = []; let pos = end;
  for (let i = parts.length - 2; i >= 1; i--) {
    const at = s.lastIndexOf(parts[i], pos - parts[i].length);
    if (at < start) return null;
    caps.unshift(s.slice(at + parts[i].length, pos)); pos = at;
  }
  caps.unshift(s.slice(start, pos));
  return [s, ...caps];
}
// How well a match reads: each piece that is a known phrase, a number or a name-like short word counts.
const wordOnly = new Set(); // texts translated only word by word (a weak match)
const fits = (m, depth) => m.slice(1).reduce((n, c) => n + (!/[A-Za-z]/.test(c) || (trText(c, depth + 1) !== c && !wordOnly.has(c.trim())) ? 1 : 0), 0);
for (const [en, es] of Object.entries(ES)) {
  if (!en.includes('{*}')) { EXACT.set(en, es); continue; }
  const literal = en.replace(/\{\*\}/g, '');
  if ((literal.match(/[A-Za-z]/g) || []).length < 2) continue; // too vague to match safely
  const parts = en.split('{*}');
  PATTERNS.push({ parts, es, weight: literal.length, vague: literal.length < 10 && parts[0] === '' });
}
PATTERNS.sort((a, b) => b.weight - a.weight);
// Lists the engine builds ("2 Wood, 1 Clay", "Ana, Leo") are translated word by word.
const WORDS = new RegExp(`\\b(${['Wood', 'Clay', 'Fleece', 'Wheat', 'Iron', 'Parchment', 'Linen', 'Silver', 'nothing', 'Guild', 'Council', 'Academy',
  'Warden', 'Veteran', 'Champion', 'Guard', 'Road Crew', 'Bounty', 'Monument', 'settlement', 'city'].join('|')})\\b`, 'g');
const EMOJI_HEAD = /^([\p{Extended_Pictographic}️‍\s·•—–-]+)([\s\S]*)$/u;
const memo = new Map();

function trText(s, depth = 0) {
  if (LANG === 'en' || !s || depth > 4) return s;
  const hit = memo.get(s);
  if (hit !== undefined) return hit;
  let out = s;
  const lead = s.match(/^\s*/)[0]; const trail = s.match(/\s*$/)[0]; const core = s.trim();
  if (core && /[A-Za-z]/.test(core)) {
    let t = EXACT.get(core);
    if (t === undefined) { // "📜 Dev card": a known phrase after an icon beats any template
      const e = EMOJI_HEAD.exec(core);
      if (e && e[1].trim() && EXACT.has(e[2])) t = e[1] + EXACT.get(e[2]);
    }
    if (t === undefined) {
      for (const p of PATTERNS) {
        let m = matchParts(p.parts, core);
        if (m && p.parts.length > 2) {
          const r = matchParts(p.parts, core, true);
          if (r && r.join('\u0000') !== m.join('\u0000') && fits(r, depth) > fits(m, depth)) m = r;
        }
        // short, vague templates (like '{*} left') only take short pieces, so they can't swallow whole sentences
        if (m && p.vague && m.slice(1).some((c) => c.length > 24 || (c.match(/ /g) || []).length > 2)) continue;
        if (m) { t = p.es.replace(/\{(\d)\}/g, (_, i) => { const c = m[Number(i)] || ''; return trText(c, depth + 1); }); break; }
      }
    }
    if (t === undefined) {
      const e = EMOJI_HEAD.exec(core);
      if (e && e[1].trim() && e[2]) { const inner = trText(e[2], depth + 1); if (inner !== e[2]) t = e[1] + inner; }
    }
    if (t === undefined && WORDS.test(core)) { WORDS.lastIndex = 0; t = core.replace(WORDS, (w) => EXACT.get(w) || w); wordOnly.add(core); }
    WORDS.lastIndex = 0;
    if (t !== undefined) out = lead + t + trail;
  }
  if (memo.size > 5000) memo.clear();
  memo.set(s, out);
  return out;
}
const tr = (s) => trText(s);

// ---------- translating the page as it changes ----------
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'text']);
// Never translated: chat, anything marked data-notr. Player names: the text sitting directly in these elements
// (their child labels like "(you)" still are).
const NO_TR = '.e.chat, [data-notr], .room-code';
const NAME_HOLDERS = '.pl-name, .who, .plist b, .chip, .rf-p, .victim-name b, .loadsum-players > span, .seatpick .btn';
const seen = new WeakMap(); // node → the translation we wrote (so our own writes aren't re-translated)
function trAttrs(n) {
  for (const a of ['title', 'placeholder', 'aria-label']) {
    const v = n.getAttribute(a);
    if (v && /[A-Za-z]/.test(v)) { const t = trText(v); if (t !== v) n.setAttribute(a, t); }
  }
}
function trNode(n) {
  if (n.nodeType === 3) {
    const p = n.parentElement;
    if (!p || SKIP.has(p.tagName) || SKIP.has(p.localName) || p.matches(NAME_HOLDERS) || p.closest(NO_TR)) return;
    if (seen.get(n) === n.data) return;
    const t = trText(n.data);
    seen.set(n, t);
    if (t !== n.data) n.data = t;
    return;
  }
  if (n.nodeType !== 1 || SKIP.has(n.tagName)) return;
  trAttrs(n);
  if (n.closest && n.closest(NO_TR)) return;
  for (let c = n.firstChild; c; c = c.nextSibling) trNode(c);
}
if (LANG !== 'en') {
  const run = () => {
    trNode(document.body);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach(trNode);
        else if (m.type === 'characterData') trNode(m.target);
        else if (m.type === 'attributes') trAttrs(m.target);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder', 'aria-label'] });
    const title = document.querySelector('title');
    if (title) new MutationObserver(() => { const t = trText(document.title); if (t !== document.title) document.title = t; }).observe(title, { childList: true });
  };
  if (document.body) run(); else document.addEventListener('DOMContentLoaded', run);
  const c = window.confirm.bind(window); const p = window.prompt.bind(window); const a = window.alert.bind(window);
  window.confirm = (m) => c(trText(String(m)));
  window.prompt = (m, d) => p(trText(String(m)), d);
  window.alert = (m) => a(trText(String(m)));
}

// The language picker: a small button that cycles through the languages.
function langButton(cls = 'btn small') {
  const next = LANG === 'en' ? 'es' : 'en';
  return `<button class="${cls} langbtn" data-lang="${next}" data-notr title="${LANG === 'en' ? 'Cambiar a español' : 'Switch to English'}" aria-label="${LANG === 'en' ? 'Cambiar a español' : 'Switch to English'}">${LANG === 'en' ? '🌐 ES' : '🌐 EN'}</button>`;
}
document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-lang]'); if (b) setLang(b.dataset.lang); });
