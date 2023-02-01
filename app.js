const settings = require("./settings.json");

const readline = require("readline");
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const soundIds = {
	761: {
		BANJO: 841 + 7,
		BASEDRUM: 826 + 7,
		BASS: 827 + 7,
		BELL: 828 + 7,
		BIT: 840 + 7,
		CHIME: 829 + 7,
		COW_BELL: 838 + 7,
		DIDGERIDOO: 839 + 7,
		FLUTE: 830 + 7,
		GUITAR: 831 + 7,
		HARP: 832 + 7,
		HAT: 833 + 7,
		IRON_XYLOPHONE: 837 + 7,
		PLING: 834 + 7,
		SNARE: 835 + 7,
		XYLOPHONE: 836 + 7,
		ARROW_HIT_PLAYER: 67
	},
	760: {
		BANJO: 776 + 7,
		BASEDRUM: 761 + 7,
		BASS: 762 + 7,
		BELL: 763 + 7,
		BIT: 775 + 7,
		CHIME: 764 + 7,
		COW_BELL: 773 + 7,
		DIDGERIDOO: 774 + 7,
		FLUTE: 765 + 7,
		GUITAR: 766 + 7,
		HARP: 767 + 7,
		HAT: 768 + 7,
		IRON_XYLOPHONE: 772 + 7,
		PLING: 769 + 7,
		SNARE: 770 + 7,
		XYLOPHONE: 771 + 7,
		ARROW_HIT_PLAYER: 67
	},
	759: {
		BANJO: 776 + 7,
		BASEDRUM: 761 + 7,
		BASS: 762 + 7,
		BELL: 763 + 7,
		BIT: 775 + 7,
		CHIME: 764 + 7,
		COW_BELL: 773 + 7,
		DIDGERIDOO: 774 + 7,
		FLUTE: 765 + 7,
		GUITAR: 766 + 7,
		HARP: 767 + 7,
		HAT: 768 + 7,
		IRON_XYLOPHONE: 772 + 7,
		PLING: 769 + 7,
		SNARE: 770 + 7,
		XYLOPHONE: 771 + 7,
		ARROW_HIT_PLAYER: 67
	}
};

const oldLog = console.log;
const oldErr = console.error;
const oldWarn = console.warn;
function consoleBase(log) {
	return function(...a) {
		process.stdout.clearLine();
		process.stdout.cursorTo(0);
		log(...a);
		process.stdout.write("> " + rl.line);
	};
}
console.log = consoleBase(oldLog);
console.error = consoleBase(oldErr);
console.warn = consoleBase(oldWarn);

let auth;

try {
	auth = require("./auth.json");
} catch (e) {
	auth = [];
}

const hh = {
	"content-type": "application/json"
};
if (auth.length > 1) {
	hh["authorization"] = "Basic " + auth[1];
	if (auth.length > 2) {
		hh["host"] = auth[2];
	}
}
const hhh = auth.length > 0 ? auth[0] : "http://localhost:9000";

const blacklist = [];

const clientPrefs = {};

let channel;
if (settings.discordEnabled) {
	const token = require("./token.json");
	const { Client } = require("discord.js");
	const dClient = new Client({ intents: [] });
	dClient.on("ready", () => {
		dClient.channels.fetch(token[1]).then(c => {
			channel = c;
		});
	});

	dClient.login(token[0]);
}

const mc = require("minecraft-protocol");
const fetch = require("@replit/node-fetch");
const sharp = require("sharp");
const fs = require("fs");
const NBS = require("@encode42/nbs.js");
const MidiPlayer = require("midi-player-js");
const {
	Instrument,
	InstrumentIds,
	instrumentMap,
	percussionMap,
	nbsToInstr
} = require("./musicMaps.js");
function getMidiInstrumentNote(midiInstrument, midiPitch, midiVolume) {
	if (!(midiInstrument in instrumentMap)) return;
	let instrument = null;
	const instrumentList = instrumentMap[midiInstrument];
	for (const candidateInstrumentName of instrumentList) {
		const candidateInstrumentOffset = Instrument[candidateInstrumentName];
		if (midiPitch >= candidateInstrumentOffset && midiPitch <= candidateInstrumentOffset + 24) {
			instrument = candidateInstrumentName;
			break;
		}
	}

	if (instrument == null) return;

	const pitch = midiPitch - Instrument[instrument];
	const noteId = pitch + InstrumentIds.indexOf(instrument) * 25;
	const volume = midiVolume / 127.0;

	sendNote(noteId, volume, 0, 0);
}
function getMidiPercussionNote(midiPitch, midiVolume) {
	if (midiPitch in percussionMap) {
		const noteId = percussionMap[midiPitch];
		const volume = midiVolume / 127.0;

		sendNote(noteId, volume, 0, 0);
	}
}
let instrumentIds = {};
const midiPlayer = new MidiPlayer.Player(function(event) {
	const eventName = event.name.toLowerCase();
	if(eventName == "program change") {
		instrumentIds[event.track] = event.value;
	} else if (eventName == "note on") {
		const midiPitch = event.noteNumber;
		const midiVolume = event.velocity;
		if (event.track == 9) {
			getMidiPercussionNote(midiPitch, midiVolume);
		} else {
			const midiInstrument = event.track in instrumentIds ? instrumentIds[event.track] : 0;
			getMidiInstrumentNote(midiInstrument, midiPitch, midiVolume);
		}
	}
});

let lastMBBv = -1;

midiPlayer.on("playing", function(currentTick) {
	const v = Math.floor(100 - midiPlayer.getSongPercentRemaining()) / 100;
	if (v <= lastMBBv) return;
	lastMBBv = v;
	iterateClients(async c => {
		updBossBar(c, v);
	}, "play");
});

const songs = {};
function updateSongs() {
	for (const s in songs) {
		delete songs[s];
	}
	const songList = fs.readdirSync("songs/");
	for (const s of songList) {
		const sl = s.toLowerCase();
		if (!(sl.endsWith(".nbs") || sl.endsWith(".mid") || sl.endsWith(".midi"))) continue;
		let ext = sl.slice(s.lastIndexOf(".") + 1);
		if (ext == "mid") ext += "i";
		const b = sl.slice(0, s.lastIndexOf(".")).replace(/_|-/g, " ").replace(/ +/g, " ");
		let k = b;
		if (k in songs) {
			k = b + " " + ext;
		}
		let i = 1;
		while (k in songs) {
			k = b + " " + i++;
		}
		songs[k] = s;
	}
}
updateSongs();

function playNotes(nbs, tick) {
	for (const layer of nbs.layers) {
		const layerVolume = layer.volume / 100;
		const note = layer.notes[tick];
		if (note && note.instrument < nbs.instruments.loaded.length) {
			const key = Math.max(33, Math.min(57, note.key));
			sendNote(((key - 33) % 25) + InstrumentIds.indexOf(nbsToInstr[nbs.instruments.loaded[note.instrument].id]) * 25, layerVolume * note.velocity / 100, note.pitch / 100, note.panning / 100);
		}
	}
}

let nbsInterval = -1;
let currSong = null;

function addBossBar(c) {
	c.write("boss_bar", {
		entityUUID: [ 0, 0, 0, 0 ],
		action: 0,
		title: JSON.stringify("\u00A79Playing: \u00A73" + currSong),
		health: 0,
		color: 1,
		dividers: 0,
		flags: 0
	});
}

function updBossBar(c, v) {
	c.write("boss_bar", {
		entityUUID: [ 0, 0, 0, 0 ],
		action: 2,
		health: v
	});
}

function remBossBar(c) {
	c.write("boss_bar", {
		entityUUID: [ 0, 0, 0, 0 ],
		action: 1
	});
}

// https://stackoverflow.com/a/5574446/6917520
String.prototype.toProperCase = function () {
	return this.replace(/\w\S*/g, function(txt) {
		return txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase();
	});
};

function playSong(song) {
	if (song == null) {
		song = Object.keys(songs)[Math.floor(Math.random() * Object.keys(songs).length)];
	}
	song = song.toLowerCase().replace(/_|-/g, " ").replace(/ +/g, " ");
	if (!(song in songs)) {
		for (const s in songs) {
			if (s.startsWith(song)) {
				song = s;
				break;
			}
		}
	}
	if (!(song in songs)) {
		for (const s in songs) {
			if (s.includes(song)) {
				song = s;
				break;
			}
		}
	}
	if (song in songs) {
		stopSong();
		currSong = song.toProperCase();
		iterateClients(async c => {
			addBossBar(c);
		}, "play");
		song = songs[song];
		if (song.toLowerCase().endsWith(".nbs")) {
			const nbs = NBS.fromArrayBuffer(new Uint8Array(fs.readFileSync("songs/" + song)).buffer);
			let tick = -1;
			const startTime = Date.now();
			nbsInterval = setInterval(() => {
				const songTime = Date.now() - startTime;
				const lastTick = tick;
				tick = Math.round(songTime * nbs.tempo / 1000);
				if (tick == lastTick) return;
				for (let t = lastTick + 1; t <= tick; t++) {
					setTimeout(() => playNotes(nbs, t), 0);
				}
				iterateClients(async c => {
					updBossBar(c, tick / nbs.length);
				}, "play");
				if (tick >= nbs.length) {
					clearInterval(nbsInterval);
					nbsInterval = -1;
					songEnded();
				}
			}, 0);
		} else {
			midiPlayer.loadFile("songs/" + song);
			midiPlayer.play();
		}
		return true;
	}
	return false;
}

midiPlayer.on("endOfFile", () => {
	songEnded();
});

function songEnded() {
	broadcast("\u00A79Song has ended!");
	stopSong();
}

function stopSong() {
	if (nbsInterval != -1) {
		clearInterval(nbsInterval);
		nbsInterval = -1;
	} else {
		midiPlayer.stop();
		instrumentIds = {};
		lastMBBv = 0;
	}
	currSong = null;
	iterateClients(async c => {
		remBossBar(c);
	}, "play");
}

const colors = require("./colors.json");
const imageQ = require("image-q");
const palette = new imageQ.utils.Palette();
const colors2 = [];
for (const c of colors) {
	palette.add(imageQ.utils.Point.createByRGBA(c[0], c[1], c[2], 255));
	colors2.push((c[0] << 16) + (c[1] << 8) + c[2]);
}
const jsonParseMulti = require("./json-multi-parse.js");
const { v4: uuidv4 } = require("uuid");

const nearestColor = color => {
	let lowest = Number.POSITIVE_INFINITY;
	let tmp;
	let index = 0;
	let a, b, c, d;
	for (const i in colors) {
		d = colors[i];
		a = color[0] - d[0];
		b = color[1] - d[1];
		c = color[2] - d[2];
		tmp = a * a + b * b + c * c;
		if (tmp < lowest) {
			lowest = tmp;
			index = i;
		}
	}
	return colors[index];
}

const ditherAlgos = [
	"nearest",
	"riemersma",
	"floyd-steinberg",
	"false-floyd-steinberg",
	"stucki",
	"atkinson",
	"jarvis",
	"burkes",
	"sierra",
	"two-sierra",
	"sierra-lite",
	// custom
	"three-sierra"
];

const quantizerThreeSierra = new imageQ.image.ErrorDiffusionArray(
	new imageQ.distance.Euclidean(),
	imageQ.image.ErrorDiffusionArrayKernel.FloydSteinberg
);
// ThreeSierra
quantizerThreeSierra._kernel = [
	[ 5 / 32, 1, 0 ],
	[ 3 / 32, 2, 0 ],
	[ 2 / 32, -2, 1 ],
	[ 4 / 32, -1, 1 ],
	[ 5 / 32, 0, 1 ],
	[ 4 / 32, 1, 1 ],
	[ 2 / 32, 2, 1 ],
	[ 2 / 32, -1, 2 ],
	[ 3 / 32, 0, 2 ],
	[ 2 / 32, 1, 2 ]
];

const setImmediateImpl = typeof setImmediate == "function" ? setImmediate : typeof process != "undefined" && typeof process.nextTick == "function" ? callback => process.nextTick(callback) : callback => setTimeout(callback, 0);

async function ditherImg(quant, rawData, progressCallback) {
	const pointContainer = imageQ.utils.PointContainer.fromUint8Array(rawData.data, rawData.info.width, rawData.info.height);
	if (quant == "three-sierra") {
		const out = await new Promise((resolve, reject) => {
			let pc;
			const iterator = quantizerThreeSierra.quantize(pointContainer, palette);
			const next = () => {
				try {
					const result = iterator.next();
					if (result.done) {
						resolve(pc);
					} else {
						if (result.value.pointContainer) pc = result.value.pointContainer;
						if (progressCallback) progressCallback(result.value.progress);
						setImmediateImpl(next);
					}
				} catch (error) {
					reject(error);
				}
			};
			setImmediateImpl(next);
		  });
		return out.toUint8Array();
	} else {
		const d = {
			colorDistanceFormula: "euclidean",
			quantization: quant
		};
		if (progressCallback) d.onProgress = progressCallback;
		return (await imageQ.applyPalette(pointContainer, palette, d)).toUint8Array();
	}
}

const mjpegBoundary = "7b3cc56e5f51db803f790dad720ed50a";
let lastImg = null;
let lastImgJpeg = null;
const jpegRes = [];
const blankImg = sharp({
	create: {
		width: 768,
		height: 768,
		channels: 3,
		background: { r: 0, g: 0, b: 0 }
	}
});
blankImg.png().toBuffer().then(b => {
	lastImgJpeg = b;
});
blankImg.jpeg().toBuffer().then(b => {
	lastImg = b;
});

function writeJpegFrame(res, img) {
	res.write("--" + mjpegBoundary + "\r\n");
	res.write("Content-Type: image/jpeg\r\n");
	res.write("Content-Length: " + img.length + "\r\n");
	res.write("\r\n");
	res.write(img);
	res.write("\r\n");
}

require("http").createServer(async (req, res) => {
	if (req.url.startsWith("/songs")) {
		res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
		return res.end(Object.keys(songs).join("\n"));
	}
	if (lastImg == null || lastImgJpeg == null) return res.end();
	if (req.url.startsWith("/mjpeg")) {
		res.writeHead(200, { "Cache-Control": "no-cache", "Connection": "close", "Content-Type": "multipart/x-mixed-replace; boundary=" + mjpegBoundary, "Pragma": "no-cache" });
		writeJpegFrame(res, lastImgJpeg);
		writeJpegFrame(res, lastImgJpeg);
		jpegRes.push(res);
	} else {
		res.writeHead(200, { "Content-Type": "image/png" });
		res.end(lastImg);
	}
}).listen(8420);

const cmds = {};

const sessionId = Date.now();

const options = {
	motd: "\u00A79Stable Diffusion \u00A7aMC\n\u00A73by ayunami2000",
	maxPlayers: 20,
	port: 25565,
	onlineMode: true,
	version: false,
	fallbackVersion: "1.19.3",
	enforceSecureProfile: false,
	errorHandler: (c, e) => {
		if (c.version <= 758) {
			c.end("Please use 1.19.X!");
		} else {
			console.error(e);
			c.end("An unknown error occurred.");
		}
	},
	hideErrors: true,
	validateChannelProtocol: false/*,
	compressionThreshold: 256*/
};

const server = mc.createServer(options);
const mcDataAll = require("minecraft-data");

const filledMapIdCache = {};

function getFilledMapId(vers) {
	if (vers <= 758) return -1;
	if (!(vers in filledMapIdCache)) {
		const itm = mcDataAll(vers).itemsByName;
		if ("filled_map" in itm) {
			filledMapIdCache[vers] = itm.filled_map.id;
		} else {
			filledMapIdCache[vers] = -1;
		}
	}
	return filledMapIdCache[vers];
}

const dimensionCodecCache = {};

function getDimensionCodec(vers) {
	if (vers <= 758) return null;
	if (!(vers in dimensionCodecCache)) {
		const lp = mcDataAll(vers).loginPacket;
		if (lp) {
			dimensionCodecCache[vers] = lp.dimensionCodec || null;
		} else {
			dimensionCodecCache[vers] = null;
		}
	}
	return dimensionCodecCache[vers];
}

const itemFrameIdCache = {};

function getItemFrameId(vers) {
	if (vers <= 758) return -1;
	if (!(vers in itemFrameIdCache)) {
		const ent = mcDataAll(vers).entitiesByName;
		if ("glow_item_frame" in ent) {
			itemFrameIdCache[vers] = ent.glow_item_frame.id;
		} else if ("item_frame" in ent) {
			itemFrameIdCache[vers] = ent.item_frame.id;
		} else if ("ItemFrame" in ent) {
			itemFrameIdCache[vers] = ent.ItemFrame.id;
		} else {
			itemFrameIdCache[vers] = -1;
		}
	}
	return itemFrameIdCache[vers];
}

if (settings.defaultSong && settings.defaultSong != "") {
	server.on("listening", function() {
		playSong(settings.defaultSong);
	});
}

server.on("login", function(client) {
	if (server.playerCount > server.maxPlayers) {
		client.end("\u00A79Server is full!");
		return;
	}
	if (!(client.version == 759 || client.version == 760 || client.version == 761)) {
		client.end("\u00A79Unsupported version!");
		return;
	}
	if (blacklist.includes(client.username.toLowerCase())) {
		client.end("\u00A79L.");
		return;
	}
	clientPrefs[client.username] = JSON.parse(JSON.stringify(settings.defaultClientPrefs));
	const addr = client.socket.remoteAddress + ":" + client.socket.remotePort;
	console.log(client.username + " connected", "(" + addr + ")");
	broadcast("\u00A7a\u00BB \u00A79" + client.username, client);

	client.on("end", function() {
		delete clientPrefs[client.username];
		console.log(client.username + " disconnected", "(" + addr + ")");
		broadcast("\u00A7c\u00AB \u00A79" + client.username, client);
	});

	client.write("login", {
		entityId: 0,
		isHardcore: false,
		gameMode: 2,
		previousGameMode: -1,
		worldNames: "minecraft:world_the_end",
		dimensionCodec: getDimensionCodec(client.version),
		worldType: "minecraft:the_end",
		worldName: "minecraft:world_the_end",
		hashedSeed: [ 0, 0 ],
		maxPlayers: server.maxPlayers,
		viewDistance: 0,
		simulationDistance: 0,
		reducedDebugInfo: true,
		enableRespawnScreen: true,
		isDebug: false,
		isFlat: false
	});
	client.write("abilities", {
		flags: 3,
		flyingSpeed: 0,
		walkingSpeed: 0
	});
	client.write("held_item_slot", {
		slot: 4
	});
	client.write("position", {
		x: 0,
		y: 400,
		z: 0,
		yaw: 0,
		pitch: 0,
		flags: 0x00
	});
	client.write("spawn_position", {
		location: { x: 0, y: 400, z: 0 },
		angle: [ 0, 0, 0, 0 ]
	});
	if (currSong != null) {
		addBossBar(client);
	}
	setMap(client);
	sendMessage(client, "\u00A79Welcome to \u00A73Stable Diffusion \u00A7aMC\u00A79! Do \u00A73/? \u00A79to get started!\nOnline players: \u00A73" + server.playerCount + " \u00A79/ \u00A73" + server.maxPlayers + "\n\u00A73" + getOnlinePlayers().join("\u00A79, \u00A73") + (currSong == null ? "" : "\n\u00A79Now playing: \u00A73" + currSong));
	for (let i = 0; i < 36; i++) {
		spawnMap(client, i);
	}
	client.on("pick_item", function(data) {
		giveMap(client);
	});
	client.on("window_items", function(data) {
		giveMap(client);
	});
	client.on("chat_message", function(data) {
		const b = data.message.replace(/^tf!(l|list|lsit|online|who)/gi, "") != data.message;
		data.message = data.message.replace(/[\u00A7\u0000-\u001F\u007F-\u009F]/g, "").replace(/&([0-9a-fklmnor])/gi, "\u00A7$1");
		broadcast("\u00A73" + client.username + " \u00BB \u00A79" + data.message);
		if (b) {
			iterateClients(async c => {
				cmds["tf!l"].run(null, c);
			}, "play");
		}
	});
	client.on("chat_command", function(data) {
		const args = data.command.replace(/[\u00A7\u0000-\u001F\u007F-\u009F]/g, "").trim().split(" ");
		args[0] = args[0].toLowerCase();
		if (args[0] in cmds) {
			cmds[args[0]].run(args.slice(1), client);
		} else {
			sendMessage(client, "\u00A79Error: Invalid command!");
		}
	});
});

server.on("error", function(error) {
	console.log("Error:", error);
});

server.on("listening", function() {
	console.log("Server listening on port", server.socketServer.address().port);
});

async function iterateClients(cb, state, ...args) {
	for (const clientId in server.clients) {
		const client = server.clients[clientId];
		if (client == undefined) continue;
		if (state != null && client.state != state) return;
		await cb(client, ...args);
	}
}

function broadcast(message, exclude) {
	console.log(message.replace(/\u00A7./g, ""));
	iterateClients(async client => {
		if (client == exclude) return;
		sendMessage(client, message);
	}, "play");
}

function sendMessage(client, message) {
	if (client == null) {
		console.log(message.replace(/\u00A7./g, ""));
		return;
	}
	if (client.state != "play") return;
	client.write("system_chat", {
		content: JSON.stringify(message)
	});
}

function getOnlinePlayers() {
	return Object.values(server.clients).map(c => c.username);
}

let running = false;
let opts = {
	dither: settings.defaultDither,
	prompt: settings.defaultPrompt,
	negPrompt: settings.defaultNegPrompt,
	model: settings.defaultModel,
	vae: settings.defaultVae
};

let cmdList = null;

function getCmdList() {
	if (cmdList == null) {
		cmdList = [];
		for (const cmd in cmds) {
			if (cmd == cmds[cmd].main) cmdList.push(cmd);
		}
	}
	return cmdList;
}

cmds.help = cmds.h = cmds["?"] = {
	main: "help",
	desc: "Shows command help.",
	usage: "",
	run: async function(args, client) {
		if (args.length > 0) {
			const cmd = args[0].toLowerCase();
			if (cmd in cmds) {
				sendMessage(client, "\u00A73" + cmd + "\u00A79: " + cmds[cmd].desc + " Usage: /" + cmd + (cmds[cmd].usage.length > 0 ? " " + cmds[cmd].usage : ""));
			} else {
				sendMessage(client, "\u00A79Error: Command not found!");
			}
		} else {
			sendMessage(client, "\u00A79Commands: \u00A73" + getCmdList().join(" \u00A79; \u00A73"));
		}
	}
};

cmds.songs = cmds.song = cmds.s = {
	main: "songs",
	desc: "Manage songs.",
	usage: "[song|stop|random|rand]",
	run: async function(args, client) {
		if (args.length > 0) {
			const songName = args.join(" ");
			if (songName.toLowerCase() == "stop") {
				stopSong();
				broadcast("\u00A79Song has been stopped!");
			} else {
				let songSuccess;
				if (songName.toLowerCase() == "random" || songName.toLowerCase() == "rand") {
					songSuccess = playSong(null);
				} else {
					songSuccess = playSong(songName);
				}
				if (songSuccess) {
					broadcast("\u00A79Now playing: \u00A73" + currSong);
				} else {
					sendMessage(client, "\u00A79Error: Song not found!");
				}
			}
		} else {
			sendMessage(client, "\u00A79Songs: \u00A73" + Object.keys(songs).join("\u00A79,\u00A73 ").toProperCase() + "\n\u00A79Songs can also be viewed online at the path \u00A73/songs");
		}
	}
};

cmds.preferences = cmds.prefs = cmds.pref = {
	main: "preferences",
	desc: "Set user preferences.",
	usage: "[key] [value]",
	run: async function(args, client) {
		if (client == null) {
			sendMessage(client, "Server cannot set preferences.");
			return;
		}
		if (args.length > 0) {
			let currPref = null;
			for (const pref in clientPrefs[client.username]) {
				if (pref.toLowerCase() == args[0].toLowerCase()) {
					currPref = pref;
					break;
				}
			}
			if (currPref == null) {
				sendMessage(client, "\u00A79Error: Invalid preference!");
			} else {
				if (args.length > 1) {
					const newVal = args[1].toLowerCase();
					if (newVal == "true" || newVal == "1") {
						clientPrefs[client.username][currPref] = true;
					} else if (newVal == "false" || newVal == "0") {
						clientPrefs[client.username][currPref] = false;
					} else {
						sendMessage(client, "\u00A79Error: Invalid value! Must be either \u00A73true \u00A79or \u00A73false\u00A79!");
						return;
					}
					sendMessage(client, "\u00A73" + currPref + "\u00A79 has been set to \u00A73" + clientPrefs[client.username][currPref] + "\u00A79!");
				} else {
					clientPrefs[client.username][currPref] = !clientPrefs[client.username][currPref];
					sendMessage(client, "\u00A73" + currPref + "\u00A79 has been toggled to \u00A73" + clientPrefs[client.username][currPref] + "\u00A79!");
				}
			}
		} else {
			sendMessage(client, "\u00A79Preferences: \u00A73" + Object.entries(clientPrefs[client.username]).map(p => p[0] + "\u00A79: \u00A73" + p[1]).join("\u00A79, \u00A73"));
		}
	}
};

cmds.render = cmds.r = {
	main: "render",
	desc: "Render it!",
	usage: "",
	run: async function(args, client) {
		if (running) {
			sendMessage(client, "\u00A79Error: Currently generating!");
			return;
		}
		running = true;
		await render(opts);
		running = false;
	}
};

cmds.ditheralgorithm = cmds.ditheralgo = cmds.dither = cmds.d = {
	main: "ditheralgorithm",
	desc: "Set dithering algorithm.",
	usage: "[dithering algorithm]",
	run: async function(args, client) {
		if (args.length > 0) {
			if (running) {
				sendMessage(client, "\u00A79Error: Currently generating!");
				return;
			}
			const potentialDither = args.join(" ").toLowerCase();
			if (!ditherAlgos.includes(potentialDither)) {
				sendMessage(client, "\u00A79Error: Invalid dithering algorithm!");
				return;
			}
			opts.dither = potentialDither;
			broadcast("\u00A79Dithering algorithm has been set to \u00A73" + opts.dither + "\u00A79!");
		} else {
			sendMessage(client, "\u00A79Current dithering algorithm: \u00A73" + opts.dither + "\n\u00A79Available dithering algorithms: \u00A73" + ditherAlgos.join("\u00A79, \u00A73"));
		}
	}
};

cmds.prompt = cmds.p = {
	main: "prompt",
	desc: "Set the prompt.",
	usage: "<\", \"-delimited tokens>",
	run: async function(args, client) {
		if (running) {
			sendMessage(client, "\u00A79Error: Currently generating!");
			return;
		}
		if (args.length == 0) {
			sendMessage(client, "\u00A79Current prompt: \u00A73" + opts.prompt);
		} else {
			opts.prompt = args.join(" ");
			broadcast("\u00A79Prompt has been set to \u00A73" + opts.prompt + "\u00A79!");
		}
	}
};

cmds.clearprompt = cmds.cp = {
	main: "clearprompt",
	desc: "Clear the prompt.",
	usage: "[reset|r]",
	run: async function(args, client) {
		if (running) {
			sendMessage(client, "\u00A79Error: Currently generating!");
			return;
		}
		let ta;
		if (args.length > 0 && ((ta = args[0].toLowerCase()) == "reset" || ta == "r")) {
			opts.prompt = settings.defaultPrompt;
			broadcast("\u00A79Prompt has been reset!");
		} else {
			opts.prompt = "";
			broadcast("\u00A79Prompt has been cleared!");
		}
	}
};

cmds.negprompt = cmds.negativeprompt = cmds.neg = cmds.negative = cmds.negp = cmds.np = cmds.n = {
	main: "negativeprompt",
	desc: "Set the negative prompt.",
	usage: "<\", \"-delimited tokens>",
	run: async function(args, client) {
		if (running) {
			sendMessage(client, "\u00A79Error: Currently generating!");
			return;
		}
		if (args.length == 0) {
			sendMessage(client, "\u00A79Current negative prompt: \u00A73" + opts.negPrompt);
		} else {
			opts.negPrompt = args.join(" ");
			broadcast("\u00A79Negative prompt has been set to \u00A73" + opts.negPrompt + "\u00A79!");
		}
	}
};

cmds.clearnegprompt = cmds.clearnegativeprompt = cmds.clearneg = cmds.clearnegative = cmds.clearnegp = cmds.cnp = cmds.cn = {
	main: "clearnegativeprompt",
	desc: "Clear the negative prompt.",
	usage: "[reset|r]",
	run: async function(args, client) {
		if (running) {
			sendMessage(client, "\u00A79Error: Currently generating!");
			return;
		}
		let ta;
		if (args.length > 0 && ((ta = args[0].toLowerCase()) == "reset" || ta == "r")) {
			opts.negPrompt = settings.defaultNegPrompt;
			broadcast("\u00A79Negative prompt has been reset!");
		} else {
			opts.negPrompt = "";
			broadcast("\u00A79Negative prompt has been cleared!");
		}
	}
};

cmds.model = cmds.m = {
	main: "model",
	desc: "Set the model.",
	usage: "<model>",
	run: async function(args, client) {
		if (args.length == 0) {
			sendMessage(client, "\u00A79Current model: \u00A73" + opts.model + await getModelListText());
		} else {
			if (running) {
				sendMessage(client, "\u00A79Error: Currently generating!");
				return;
			}
			const models = await getModels();
			const model = args.join(" ");
			const pm = models.options["stable-diffusion"].filter(m => m.toLowerCase() == model.toLowerCase());
			if (pm.length > 0) {
				opts.model = pm[0];
				broadcast("\u00A79Model has been set to \u00A73" + opts.model + "\u00A79!");
			} else {
				sendMessage(client, "\u00A79Error: Model not found!");
			}
		}
	}
};

cmds.vae = cmds.v = {
	main: "vae",
	desc: "Set the VAE.",
	usage: "<VAE>",
	run: async function(args, client) {
		if (args.length == 0) {
			sendMessage(client, "\u00A79Current VAE: \u00A73" + opts.vae + await getModelListText());
		} else {
			if (running) {
				sendMessage(client, "\u00A79Error: Currently generating!");
				return;
			}
			const models = await getModels();
			const model = args.join(" ");
			const pm = models.options.vae.filter(m => m.toLowerCase() == model.toLowerCase());
			if (pm.length > 0) {
				opts.vae = pm[0];
				broadcast("\u00A79VAE has been set to \u00A73" + opts.vae + "\u00A79!");
			} else {
				sendMessage(client, "\u00A79Error: VAE not found!");
			}
		}
	}
};

cmds.list = cmds.l = cmds.online = cmds["tf!l"] = {
	main: "list",
	desc: "List online players.",
	usage: "",
	run: async function(args, client) {
		sendMessage(client, "\u00A79Online players (\u00A73" + server.playerCount + "\u00A79 / \u00A73" + server.maxPlayers + "\u00A79): \u00A73" + getOnlinePlayers().join("\u00A79, \u00A73"));
	}
};

function getSoundIds(vers) {
	if (vers in soundIds) return soundIds[vers];
	return {
		PLING: 67,
		ARROW_HIT_PLAYER: 67
	};
}

function sendNote(note, volume, precisePitch, pan) {
	const pitch = note % 25;
	const fixedPitch = 0.5 * Math.pow(2, (pitch + precisePitch) / 12);
	const instrumentId = Math.floor(note / 25);
	const instrument = InstrumentIds[instrumentId];
	iterateClients(async c => {
		if (c.username in clientPrefs && !clientPrefs[c.username].music) return;
		const instrToSoundId = getSoundIds(c.version);
		if (!(instrument in instrToSoundId)) return;
		c.write("sound_effect", {
			soundId: instrToSoundId[instrument],
			soundCategory: 2,
			x: (0.5 * -pan) * 8,
			y: 401.7 * 8,
			z: 0,
			volume: volume,
			pitch: fixedPitch,
			seed: 0
		});
	}, "play");
}

let modelsCache = {};
let lastModelsFetch = 0;

async function getModels() {
	const now = Date.now();
	if (now - lastModelsFetch > 1000 * 60 * 5) {
		lastModelsFetch = now;
		modelsCache = await (await fetch(hhh + "/get/models", {
			headers: hh
		})).json();
	}
	return modelsCache;
}

async function getModelListText() {
	const models = await getModels();
	let res = "\n\u00A79Available models:\n";
	for (const cat in models.options) {
		if (cat == "hypernetwork") continue;
		res += "\u00A79\u00BB \u00A73" + cat + "\u00A79: \u00A73" + models.options[cat].join("\u00A79, \u00A73") + "\n";
	}
	res = res.slice(0, res.length - 1);
	return res;
}

async function spawnMap(client, i) {
	if (client.state != "play") return;
	const x = Math.floor(i / 6);
	const y = i % 6;
	client.write("spawn_entity", {
		entityId: 1 + i,
		objectUUID: uuidv4(),
		type: getItemFrameId(client.version),
		x: 2.5 - x,
		y: 403.5 - y,
		z: 5,
		pitch: -128,
		yaw: 0,
		headPitch: 0,
		objectData: 2,
		velocityX: 0,
		velocityY: 0,
		velocityZ: 0
	});
	client.write("entity_metadata", {
		entityId: 1 + i,
		metadata: [
			{
				key: 8,
				type: client.version <= 760 ? 6 : 7,
				value: {
					present: true,
					itemId: getFilledMapId(client.version),
					itemCount: 1,
					nbtData: {
						type: "compound",
						name: "",
						value: {
							map: {
								type: "int",
								value: i
							}
						}
					}
				}
			}
		]
	});
}

let lastMapD = null;
const lastMapDs = [];

async function setMap(url, fin) {
	if (url == null) {
		await sleep(50);
		return await setMap(lastImg);
	}
	if (url instanceof Object && "version" in url) {
		if (lastMapD == null) {
			return await setMap(lastImg);
		}
		url.write("map", lastMapD);
		giveMap(url);
		for (let i = 0; i < 36; i++) {
			url.write("map", lastMapDs[i]);
		}
		return;
	}
	if (typeof url == "string") {
		if (url.startsWith("/")) {
			url = Buffer.from(await (await fetch(hhh + url, {
				headers: hh
			})).arrayBuffer());
		} else if (url.startsWith("data:")) {
			url = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
		}
	}
	let img;
	try {
		img = sharp(url, { failOn: "none" });
		img = img.ensureAlpha();
		await img.metadata();
		await img.stats();
		lastImg = (await img.clone().png().toBuffer({ resolveWithObject: true })).data;
		if (fin && settings.discordEnabled) {
			try {
				channel.send({
					files: [
						lastImg
					]
				});
			} catch (e) {
				console.error(e);
			}
		}
		lastImgJpeg = Buffer.from((await img.clone().jpeg().toBuffer({ resolveWithObject: true })).data);
		for (const res of jpegRes) {
			if (res.closed) {
				jpegRes.splice(jpegRes.indexOf(res), 1);
				continue;
			}
			writeJpegFrame(res, lastImgJpeg);
			writeJpegFrame(res, lastImgJpeg);
		}
	} catch (e) {
		return;
	}
	const rawData2 = await img.clone().resize(128, 128).raw().toBuffer({ resolveWithObject: true });
	const dithered2 = await ditherImg(opts.dither, rawData2, progressXp);
	const channelCount2 = dithered2.length / (rawData2.info.width * rawData2.info.height);
	const buffer = [];
	for (let x = 0; x < rawData2.info.width; x++) {
		for (let y = 0; y < rawData2.info.height; y++) {
			const idx = x * rawData2.info.height + y;
			let r = dithered2[idx * channelCount2],
				g = dithered2[idx * channelCount2 + 1],
				b = dithered2[idx * channelCount2 + 2];
			const ind = colors2.indexOf((r << 16) + (g << 8) + b);
			if (ind == -1) {
				console.warn("Inexact RGB detected!", r, g, b);
				const col = nearestColor([ r, g, b ]);
				r = col[0];
				g = col[1];
				b = col[2];
			}
			buffer.push(4 + ind);
		}
	}
	const d = {
		itemDamage: 37,
		scale: 4,
		locked: false,
		columns: 128,
		rows: 128,
		x: 0,
		y: 0,
		data: Buffer.from(buffer)
	};
	lastMapD = d;
	await iterateClients(async c => {
		c.write("map", d);
		giveMap(c);
	}, "play");
	if (lastMapDs.length == 0 || (fin || !settings.onlyBigScreenFinal)) {
		const rawData = await img.resize(768, 768).raw().toBuffer({ resolveWithObject: true });
		const dithered = await ditherImg(opts.dither, rawData, progressXp);
		const channelCount = dithered.length / (rawData.info.width * rawData.info.height);
		const buffers = Array(36).fill(0).map(() => []);
		for (let x = 0; x < rawData.info.width; x++) {
			for (let y = 0; y < rawData.info.height; y++) {
				const idx = x * rawData.info.height + y;
				let r = dithered[idx * channelCount],
					g = dithered[idx * channelCount + 1],
					b = dithered[idx * channelCount + 2];
				const ind = colors2.indexOf((r << 16) + (g << 8) + b);
				if (ind == -1) {
					console.warn("Inexact RGB detected!", r, g, b);
					const col = nearestColor([ r, g, b ]);
					r = col[0];
					g = col[1];
					b = col[2];
				}
				buffers[Math.floor(x / 128) + Math.floor(y / 128) * 6].push(4 + ind);
			}
		}
		lastMapDs.length = 0;
		for (let i = 0; i < 36; i++) {
			const d = {
				itemDamage: i,
				scale: 4,
				locked: false,
				columns: 128,
				rows: 128,
				x: 0,
				y: 0,
				data: Buffer.from(buffers[i])
			};
			lastMapDs.push(d);
			await iterateClients(async c => {
				c.write("map", d);
			}, "play");
		}
		await iterateClients(async c => {
			if (c.username in clientPrefs && !clientPrefs[c.username].finalSound) return;
			if (fin) {
				c.write("sound_effect", {
					soundId: getSoundIds(c.version)["PLING"],
					soundCategory: 4,
					x: 0,
					y: 401.7 * 8,
					z: 5 * 8,
					volume: 1.0,
					pitch: 1.5,
					seed: 0
				});
				c.write("sound_effect", {
					soundId: getSoundIds(c.version)["ARROW_HIT_PLAYER"],
					soundCategory: 4,
					x: 0,
					y: 401.7 * 8,
					z: 5 * 8,
					volume: 1.0,
					pitch: 0.5,
					seed: 0
				});
			}
		}, "play");
	}
	progressXp(-1);
}
const loadingText = "Loading...";
let loadingCycle = 0;
function cycleLoading() {
	const res = "\u00A79" + loadingText.slice(0, loadingCycle) + "\u00A73" + loadingText[loadingCycle] + "\u00A79" + loadingText.slice(loadingCycle + 1);
	loadingCycle = (loadingCycle + 1) % loadingText.length;
	return res;
}
function progress(i, t) {
	const m = (!i && !t) ? JSON.stringify(cycleLoading()) : JSON.stringify("\u00A73" + i + "\u00A79 / \u00A73" + t + "\u00A79 (\u00A73" + Math.round(i / t * 100) + "%\u00A79)");
	iterateClients(async c => {
		c.write("system_chat", {
			content: m,
			isActionBar: true
		});
	}, "play");
}

function progressXp(p) {
	const d = {
		experienceBar: p == -1 ? 1 : (p / 100),
		level: p == -1 ? 0 : p,
		totalExperience: 0
	};
	iterateClients(async c => {
		c.write("experience", d);
	}, "play");
}

function progressSound(i, t) {
	iterateClients(async c => {
		if (c.username in clientPrefs && !clientPrefs[c.username].progressSound) return;
		c.write("sound_effect", {
			soundId: getSoundIds(c.version)["PLING"],
			soundCategory: 4,
			x: 0,
			y: 401.7 * 8,
			z: settings.onlyBigScreenFinal ? 0 : (5 * 8),
			volume: 0.5,
			pitch: 0.5 + 1.5 * i / t,
			seed: 0
		});
	}, "play");
}

function giveMap(client) {
	if (client.state != "play") return;
	client.write("set_slot", {
		windowId: 0,
		stateId: 0,
		slot: 40,
		item: {
			present: true,
			itemId: getFilledMapId(client.version),
			itemCount: 1,
			nbtData: {
				type: "compound",
				name: "",
				value: {
					map: {
						type: "int",
						value: 37
					}
				}
			}
		}
	});
}
const sleep = async ms => await new Promise(r => setTimeout(r, ms));
async function render(currOpts) {
	broadcast("\u00A79Starting generation!");
	const res = await (await fetch(hhh + "/render", {
		headers: hh,
		body: JSON.stringify({
			active_tags: [],
			guidance_scale: 12,
			height: 768,
			negative_prompt: currOpts.negPrompt,
			num_inference_steps: 28,
			num_outputs: 1,
			original_prompt: currOpts.prompt,
			output_format: "png",
			output_quality: 75,
			prompt: currOpts.prompt,
			sampler: "euler_a",
			seed: Math.random() * 1000000,
			session_id: sessionId,
			show_only_filtered_image: true,
			stream_image_progress: true,
			stream_progress_updates: true,
			turbo: true,
			use_full_precision: true,
			use_stable_diffusion_model: currOpts.model,
			use_vae_model: currOpts.vae,
			width: 768
		}),
		method: "POST"
	})).json();
	await sleep(500);
	let res2 = null;
	let lastProgress = null;
	let queue = [];
	while (res2 == null || (!("output" in res2)) || "path" in res2.output[0]) {
		if (res2 != null) {
			if ("detail" in res2 && res2.detail.toLowerCase().includes("early")) {
				progress();
			}
			if ("step" in res2 && "total_steps" in res2) {
				progress(res2.step, res2.total_steps);
				lastProgress = [ res2.step, res2.total_steps ];
			}
			if ("output" in res2) {
				progressSound(...lastProgress);
				setMap(res2.output[0].path);
			}
		} else if (lastProgress != null) {
			progress(...lastProgress);
		}
		if (queue.length == 0) {
			const jsonUnparsed = await (await fetch(hhh + res.stream, {
				headers: hh
			})).text();
			const jsonParsed = jsonParseMulti(jsonUnparsed, { partial: false });
			if (jsonParsed.length > 0) {
				queue.push(...jsonParsed);
			} else {
				await sleep(500);
			}
		}
		if (queue.length > 0) {
			res2 = queue.shift();
		} else {
			res2 = null;
		}
	}
	progressSound(lastProgress[1], lastProgress[1]);
	await setMap(res2.output[0].data, true);
	broadcast("\u00A79Done generating!");
}

const shutdown = async function() {
	console.log("Stopping!");
	rl.close();
	await iterateClients(async c => {
		c.end("\u00A79Server is stopping!");
	});
	process.exit();
};

const prompt = query => new Promise((resolve) => rl.question(query, resolve));

rl.on("SIGINT", shutdown);
process.on("SIGINT", shutdown);

(async() => {
	while (true) {
		const cmd = await prompt("> ");
		const args = cmd.replace(/[\u00A7\u0000-\u001F\u007F-\u009F]/g, "").trim().split(" ");
		args[0] = args[0].toLowerCase();
		if (args[0] in cmds) {
			cmds[args[0]].run(args.slice(1), null);
		} else if (args[0] == "updsongs") {
			updateSongs();
			console.log("Updated songs!");
		} else if (args[0] == "say") {
			if (args.length > 1) {
				broadcast("\u00A73Server \u00A79\u00A7o(Real)\u00A7r\u00A73 \u00BB \u00A79" + args.slice(1).join(" "));
			} else {
				console.log("Please specify a message to say!");
			}
		} else if (args[0] == "ban") {
			if (args.length > 1) {
				console.log("Please specify name or names to ban or unban!");
			} else {
				const a = args.join(" ").toLowerCase().split(" ").slice(1);
				console.log("Banning/Unbanning: " + a.join(", "));
				for (const aa of a) {
					if (blacklist.includes(aa)) {
						blacklist.splice(blacklist.indexOf(aa), 1);
					} else {
						blacklist.push(aa);
						await iterateClients(async c => {
							if (!c.username) return;
							if (a.includes(c.username.toLowerCase())) {
								c.end("\u00A79L.");
							}
						});
					}
				}
			}
		} else {
			console.log("Error: Invalid command!");
		}
	}
})();