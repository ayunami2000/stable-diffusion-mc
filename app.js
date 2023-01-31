const oldLog = console.log;
const oldErr = console.error;
const oldWarn = console.warn;
console.log = function(...a) {
	process.stdout.clearLine();
	process.stdout.cursorTo(0);
	oldLog(...a);
	process.stdout.write("> ");
};
console.error = function(...a) {
	process.stdout.clearLine();
	process.stdout.cursorTo(0);
	oldErr(...a);
	process.stdout.write("> ");
};
console.warn = function(...a) {
	process.stdout.clearLine();
	process.stdout.cursorTo(0);
	oldWarn(...a);
	process.stdout.write("> ");
};

const auth = require("./auth.json");
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
const token = require("./token.json");

const onlyDitherFinal = false;

const onlyBigScreenFinal = true;

const discordEnabled = false;

const blacklist = [];

let channel;
if (discordEnabled) {
	const { Client } = require("discord.js");
	const dClient = new Client({ intents: [] });
	dClient.on("ready", () => {
		dClient.channels.fetch(token[1]).then(c => {
			channel = c;
		});
	});

	dClient.login(token[0]);
}

const readline = require("readline");
const mc = require("minecraft-protocol");
const fetch = require("@replit/node-fetch");
const sharp = require("sharp");
const colors = require("./colors.json");
const colors2 = [];
for (const c of colors) {
	colors2.push((c[0] << 16) + (c[1] << 8) + c[2]);
}
const jsonParseMulti = require("./json-multi-parse.js");
const Dither = require("image-dither");
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

const dither = new Dither({
	matrix: Dither.matrices.sierra3,
	channels: 3,
	findColor: nearestColor
});

const mjpegBoundary = "7b3cc56e5f51db803f790dad720ed50a";
const defaultPrompt = "rocky mountains";
const defaultNegPrompt = "";
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

server.on("login", function(client) {
	if (server.playerCount > options.maxPlayers) {
		client.end("Server is full!");
		return;
	}
	if (blacklist.includes(client.username.toLowerCase())) {
		client.end("L.");
		return;
	}
	const addr = client.socket.remoteAddress + ":" + client.socket.remotePort;
	console.log(client.username + " connected", "(" + addr + ")");
	broadcast("\u00A7a\u00BB \u00A79" + client.username, client);

	client.on("end", function() {
		console.log(client.username + " disconnected", "(" + addr + ")");
		broadcast("\u00A7c\u00AB \u00A79" + client.username, client);
	});

	client.write("login", {
		entityId: 0,
		isHardcore: false,
		gameMode: 2,
		previousGameMode: -1,
		worldNames: "minecraft:overworld",
		dimensionCodec: getDimensionCodec(client.version),
		worldType: "minecraft:the_end",
		worldName: "minecraft:overworld",
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
	setMap(client);
	sendMessage(client, "\u00A79Welcome to \u00A73Stable Diffusion \u00A7aMC\u00A79! Do \u00A73/? \u00A79to get started!\nOnline players: \u00A73" + server.playerCount + " \u00A79/ \u00A73" + server.maxPlayers + "\n\u00A73" + getOnlinePlayers().join("\u00A79, \u00A73"));
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
			});
		}
	});
	client.on("chat_command", function(data) {
		const args = data.command.trim().replace(/[\u00A7\u0000-\u001F\u007F-\u009F]/g, "").split(" ");
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

async function iterateClients(cb, ...args) {
	for (const clientId in server.clients) {
		if (server.clients[clientId] === undefined) continue;
		await cb(server.clients[clientId], ...args);
	}
}

function broadcast(message, exclude) {
	console.log(message.replace(/\u00A7./g, ""));
	iterateClients(async client => {
		if (client == exclude) return;
		sendMessage(client, message);
	});
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
	dither: true,
	prompt: defaultPrompt,
	negPrompt: defaultNegPrompt,
	model: "landscapemix",
	vae: "vae-ft-mse-840000-ema-pruned"
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

cmds.dither = cmds.d = {
	main: "dither",
	desc: "Toggle dithering.",
	usage: "",
	run: async function(args, client) {
		if (running) {
			sendMessage(client, "\u00A79Error: Currently generating!");
			return;
		}
		opts.dither = !opts.dither;
		broadcast("\u00A79Dithering has been " + (opts.dither ? "\u00A7aen" : "\u00A7cdis") + "abled\u00A79!");
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
			opts.prompt = defaultPrompt;
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
			opts.negPrompt = defaultNegPrompt;
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
		if (running) {
			sendMessage(client, "\u00A79Error: Currently generating!");
			return;
		}
		if (args.length == 0) {
			sendMessage(client, "\u00A79Current model: \u00A73" + opts.model);
		} else {
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

cmds.listmodel = cmds.lm = cmds.listvae = cmds.lv = {
	main: "listmodel",
	desc: "List available models.",
	usage: "",
	run: async function(args, client) {
		const models = await getModels();
		let res = "\u00A79Available models:\n";
		for (const cat in models.options) {
			if (cat == "hypernetwork") continue;
			res += "\u00A79\u00BB \u00A73" + cat + "\u00A79: \u00A73" + models.options[cat].join("\u00A79, \u00A73") + "\n";
		}
		res = res.slice(0, res.length - 1);
		sendMessage(client, res);
	}
};

cmds.vae = cmds.v = {
	main: "vae",
	desc: "Set the VAE.",
	usage: "<VAE>",
	run: async function(args, client) {
		if (running) {
			sendMessage(client, "\u00A79Error: Currently generating!");
			return;
		}
		if (args.length == 0) {
			sendMessage(client, "\u00A79Current VAE: \u00A73" + opts.vae);
		} else {
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
	const doDither = (fin || !onlyDitherFinal) && opts.dither;
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
		img = img.removeAlpha();
		await img.metadata();
		await img.stats();
		lastImg = (await img.clone().png().toBuffer({ resolveWithObject: true })).data;
		if (fin && discordEnabled) {
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
	const dithered2 = doDither ? dither.dither(rawData2.data, rawData2.info.width) : rawData2.data;
	const buffer = [];
	for (let x = 0; x < rawData2.info.width; x++) {
		for (let y = 0; y < rawData2.info.height; y++) {
			const idx = x * rawData2.info.height + y;
			let r = dithered2[idx * rawData2.info.channels],
				g = dithered2[idx * rawData2.info.channels + 1],
				b = dithered2[idx * rawData2.info.channels + 2];
			if (!doDither) {
				const col = nearestColor([ r, g, b ]);
				r = col[0];
				g = col[1];
				b = col[2];
			}
			buffer.push(4 + colors2.indexOf((r << 16) + (g << 8) + b));
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
		if (c.state != "play") return;
		c.write("map", d);
		giveMap(c);
	});
	if (lastMapDs.length == 0 || (fin || !onlyBigScreenFinal)) {
		const rawData = await img.resize(768, 768).raw().toBuffer({ resolveWithObject: true });
		const dithered = doDither ? dither.dither(rawData.data, rawData.info.width) : rawData.data;
		const buffers = Array(36).fill(0).map(() => []);
		for (let x = 0; x < rawData.info.width; x++) {
			for (let y = 0; y < rawData.info.height; y++) {
				const idx = x * rawData.info.height + y;
				let r = dithered[idx * rawData.info.channels],
					g = dithered[idx * rawData.info.channels + 1],
					b = dithered[idx * rawData.info.channels + 2];
				if (!doDither) {
					const col = nearestColor([ r, g, b ]);
					r = col[0];
					g = col[1];
					b = col[2];
				}
				buffers[Math.floor(x / 128) + Math.floor(y / 128) * 6].push(4 + colors2.indexOf((r << 16) + (g << 8) + b));
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
				if (c.state != "play") return;
				c.write("map", d);
			});
		}
	}
}
function progress(i, t) {
	const m = JSON.stringify("\u00A73" + i + "\u00A79 / \u00A73" + t + "\u00A79 (\u00A73" + Math.round(i / t * 100) + "%\u00A79)");
	iterateClients(async c => {
		if (c.state != "play") return;
		c.write("system_chat", {
			content: m,
			isActionBar: true
		});
	});
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
			if ("output" in res2) {
				setMap(res2.output[0].path);
			}
			if ("step" in res2 && "total_steps" in res2) {
				progress(res2.step, res2.total_steps);
				lastProgress = [ res2.step, res2.total_steps ];
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
	await setMap(res2.output[0].data, true);
	broadcast("\u00A79Done generating!");
}

const shutdown = async function() {
	console.log("Stopping!");
	rl.close();
	await iterateClients(async c => {
		c.end("Server is stopping!");
	});
	process.exit();
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const prompt = query => new Promise((resolve) => rl.question(query, resolve));

rl.on("SIGINT", shutdown);
process.on("SIGINT", shutdown);

(async() => {
	while (true) {
		const cmd = (await prompt("> ")).trim();
		const args = cmd.replace(/[\u00A7\u0000-\u001F\u007F-\u009F]/g, "").split(" ");
		args[0] = args[0].toLowerCase();
		if (args[0] in cmds) {
			cmds[args[0]].run(args.slice(1), null);
		} else if (args[0] == "ban" || args[0] == "b" && args.length > 1) {
			const a = args.join(" ").toLowerCase().split(" ").slice(1);
			for (const aa of a) {
				if (blacklist.includes(aa)) {
					blacklist.splice(blacklist.indexOf(aa), 1);
				} else {
					blacklist.push(aa);
					await iterateClients(async c => {
						if (!c.username) return;
						if (a.includes(c.username.toLowerCase())) {
							c.end("L.");
						}
					});
				}
			}
		} else {
			console.log("Error: Invalid command!");
		}
	}
})();