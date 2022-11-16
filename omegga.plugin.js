const fs = require('fs');
const { brs } = OMEGGA_UTIL;
const amlist = require('./AmmoSetup');

let interval;
let enabled = true;

let password;
let updatedelay;
let loseamount;
let totax;

let boxbrslist = {};

const pclr = {
	err: '[LM] <color="ff7711">',
	inf: '<color="ffdd00">',
	msg: '[LM] <color="aaffaa">'
}

const notguns = [
	'BrickTool', 'Hammer', 'PaintTool', 'SelectionTool', 'Guide', 'ResizeTool', 'Applicator', 'ImpactGrenade', 'StickGrenade', 'ImpulseGrenade', 'HealthPotion'
]

const infiniteguns = [
	'twincannon', 'bazooka', 'minigun'
]

let dispencercooldown = [];

let dead = [];

let ammoboxfolder;

let ammotypes;
let gunammotypes;

let playerammo = [];

class LimitedAmmo {
	
	constructor(omegga, config, store) {
		this.omegga = omegga;
		this.config = config;
		this.store = store
		password = this.config.Password;
		updatedelay = this.config.updateDelay;
		loseamount = this.config.AmountLostOnDeath;
		totax = this.config.TaxInfiniteWeapons;
	}
	
	async getHeldWeapon(pawn) {
		const reg = new RegExp(
		/BP_FigureV2_C .+?PersistentLevel\.(?<pawn>BP_FigureV2_C_\d+)\.WeaponSimState = .+(PersistentLevel.(Weapon|BP_Item)_|CurrentItemInstance=)(?<Weapon>.+)(_C_(?<ID>\w+)|,)/
		);
		const [{groups: { Weapon, ID }}] = await this.omegga.addWatcher(reg, {
			exec: () =>
			this.omegga.writeln(
				`getAll BP_FigureV2_C WeaponSimState Name=${pawn}`
			),
			first: 'index',
			timeoutDelay: 500
		});
		return {weapon: Weapon, id: ID};
	}
	
	async getWeaponAmmo(Weapon, id) {
		const trueweapon = 'Weapon_' + Weapon + '_C_' + id;
		const reg = new RegExp(
		`Weapon_${Weapon}_C .+PersistentLevel\.${trueweapon}.SimState = .+AmmoLoaded=(?<Ammo>.+),AmmoAvailable`
		);
		const [{groups: { Ammo }}] = await this.omegga.addWatcher(reg, {
			exec: () =>
			this.omegga.writeln(
				`getAll Weapon_${Weapon}_C simState Name=${trueweapon}`
			),
			first: 'index',
			timeoutDelay: 500
		});
		return Number(Ammo);
	}
	
	async tick() {
		if(!enabled) {
			return;
		}
		
		const players = this.omegga.players;
		for(var pi in players) {
			const player = players[pi];
			const weapon = await this.getHeldWeapon(await player.getPawn());
			if(weapon.weapon == "None" || notguns.includes(weapon.weapon)) {
				continue;
			}
			if(weapon.id == null || weapon.weapon == null) {
				return;
			}
			let ammo = await this.getWeaponAmmo(weapon.weapon, weapon.id);;
			let pa = playerammo.find(a => a.player = player.id);
			if(pa == null) {
				playerammo.push({player: player.id, ammo: ammo, selected: weapon.weapon});
				continue;
			}
			const index = playerammo.indexOf(pa);
			if(pa.selected != weapon.weapon) {
				pa.selected = weapon.weapon;
				pa.ammo = ammo;
				playerammo[index] = pa;
				continue;
			}
			const keys = await this.store.keys();
			if(!keys.includes(player.id)) {
				continue;
			}
			let inv = await this.store.get(player.id);
			const ammot = gunammotypes[weapon.weapon.toLowerCase()];
			const infinite = infiniteguns.includes(weapon.weapon.toLowerCase()) && totax;
			if(inv[ammot] <= 0 && !infinite && !dead.includes(player.name)) {
				this.omegga.whisper(player.name, pclr.msg + 'You ran out of ' + ammotypes[ammot] + '.</>');
				player.takeItem('Weapon_' + weapon.weapon.toLowerCase());
				continue;
			}
			if(pa.ammo > ammo || infinite) {
				const decrease = pa.ammo - ammo;
				inv[ammot] -= decrease;
				if(infinite) {
					inv[ammot]--;
				}
				if(inv[ammot] < 0) {
					inv[ammot] = 0;
				}
				this.store.set(player.id, inv);
				this.omegga.middlePrint(player.name, inv[ammot]);
				if(inv[ammot] <= 0) {
					this.omegga.whisper(player.name, pclr.msg + 'You ran out of ' + ammotypes[ammot] + '.</>');
					player.takeItem('Weapon_' + weapon.weapon.toLowerCase());
					continue;
				}
			}
			pa.ammo = ammo;
			playerammo[index] = pa;
		}
	}
	
	async setupBoxes() {
		for(var abf in ammoboxfolder) {
			const box = ammoboxfolder[abf];
			const boxfile = fs.readFileSync(__dirname + "/AmmoBoxes/"+box);
			const boxbrs = brs.read(boxfile);
			let bricks = boxbrs.bricks;
			for(var b in bricks) {
				let brick = bricks[b];
				if('components' in brick) {
					if('BCD_Interact' in brick.components) {
						let consoletag = brick.components.BCD_Interact.ConsoleTag.split(' ');
						if(consoletag.length < 5) {
							consoletag.push(password);
						}
						else if(consoletag[0].toLowerCase == 'limitedammo') {
							consoletag[4] = password;
						}
						brick.components.BCD_Interact.ConsoleTag = consoletag.join(' ');
					}
				}
				bricks[b] = brick;
			}
			boxbrs.bricks = bricks;
			const boxsubstr = box.substr(0, box.length - 4);
			boxbrslist[boxsubstr] = boxbrs;
		}
	}
	
	async createBox(playername, boxname, pos, size) {
		function random(min, max) {
			return Math.round(Math.random() * (max - min)) + min;
		}
		const sb = boxname.split('-');
		let foundbox;
		switch(sb[0].toLowerCase()) {
			case 'random':
			const minrange = Number(sb[1]);
			const maxrange = Number(sb[2]);
			if(isNaN(minrange) || isNaN(maxrange)) {
				this.omegga.whisper(playername, pclr.err + 'Min range and max range must be both numbers.</>');
				return;
			}
			const values = Object.values(boxbrslist);
			if(minrange < 0 || minrange > maxrange || maxrange > values.length - 1) {
				this.omegga.whisper(playername, pclr.err + 'This dispencer may have incorrect values setup.</>');
				return;
			}
			foundbox = values[random(minrange, maxrange)];
			break;
			
			case 'give':
			const ammotype = ammotypes.find(at => at.toLowerCase().includes(sb[1].toLowerCase()));
			const count = Number(sb[2]);
			if(ammotype == null) {
				this.omegga.whisper(playername, pclr.err + 'Invalid ammo type.</>');
				return;
			}
			if(isNaN(count)) {
				this.omegga.whisper(playername, pclr.err + 'Ammo amount must be a number.</>');
				return;
			}
			const pl = await this.omegga.getPlayer(playername);
			let inv = await this.store.get(pl.id);
			inv[ammotypes.indexOf(ammotype)] += count;
			this.omegga.middlePrint(playername, '+' + count + ' ' + ammotype);
			this.store.set(pl.id, inv);
			break;
			
			default:
			foundbox = boxbrslist[boxname];
			if(foundbox == null) {
				this.omegga.whisper(playername, pclr.err + 'Ammo box ' + boxname + ' doesn\'t exist.</>');
				return;
			}
			this.omegga.loadSaveData(foundbox, {quiet: true, offX: pos[0], offY: pos[1], offZ: pos[2] + size[2]});
			break;
		}
	}
			
	async init() {
		ammoboxfolder = fs.readdirSync(__dirname + "/AmmoBoxes");
		this.setupBoxes();
		const l = await amlist.setupAmmo();
		ammotypes = l[0];
		gunammotypes = l[1]
		
		if(loseamount > 0) {
			const deathevents = await this.omegga.getPlugin('deathevents');
			if(deathevents) {
				console.log('Deathevents detected.');
				deathevents.emitPlugin('subscribe');
			}
			else {
				console.error('Ammo loss on death requires deathevents! Players will NOT lose ammo on death.');
			}
		}
		/*
		this.omegga.on('cmd:enable', async name => {
			enabled = !enabled
			this.omegga.whisper(name, 'Enabled: ' + enabled);
		});
		*/
		this.omegga.on('interact', async data => {
			const d = data.message.split(' ');
			if(d[0].toLowerCase() === 'limitedammo') {
				if(password.length > 0 && d[4] !== password) {
					return;
				}
				let inv = await this.store.get(data.player.id);
				inv[d[1]] += Number(d[2]);
				this.omegga.middlePrint(data.player.name, '+' + d[2] + ' ' + ammotypes[d[1]]);
				this.store.set(data.player.id, inv);
				let size = data.brick_size;
				let pos = data.position;
				if(!isNaN(Number(d[3]))) {
					size[2] += Number(d[3])
					pos[2] -= Number(d[3])
				}
				this.omegga.clearRegion({center: pos, extent: size});
			}
			if(d[0].toLowerCase() === 'ammodis') {
				if(password.length > 0 && d[3] !== password) {
					return;
				}
				const timeout = dispencercooldown.filter(x => x === data.position.join(' '));
				if(timeout.length > 0) {
					this.omegga.middlePrint(data.player.name, 'This ammo dispencer is on cooldown!');
					return;
				}
				this.createBox(data.player.name, d[1], data.position, data.brick_size);
				dispencercooldown.push(data.position.join(' '));
				setTimeout(() => dispencercooldown.splice(dispencercooldown.indexOf(data.position.join(' ')),1), Number(d[2]) * 1000);
			}
		})
		.on('cmd:giveammo', async (name, ...args) => {
			const amount = Math.floor(Number(args[0]));
			if(isNaN(amount)) {
				this.omegga.whisper(name, pclr.err + 'Amount must be a number.</>');
				return;
			}
			if(amount < 0) {
				this.omegga.whisper(name, pclr.err + 'Amount cannot be negative.</>');
				return;
			}
			const slot = Math.floor(Number(args[1]));
			if(slot < 0 || isNaN(slot) || slot >= ammotypes.length) {
				this.omegga.whisper(name, pclr.err + 'You must input a proper ammo type. 0 - ' + (ammotypes.length - 1) + '</>');
				return;
			}
			args = args.slice(2,args.length);
			const plr = args.join(' ');
			if(plr === name) {
				this.omegga.whisper(name, pclr.err + 'You cannot give yourself ammo.</>');
				return;
			}
			console.log(plr);
			const reciever = await this.omegga.getPlayer(plr);
			if(reciever == null) {
				this.omegga.whisper(name, pclr.err + 'Could not find the reciever.</>');
				return;
			}
			const sender = await this.omegga.getPlayer(name);
			let sinv = await this.store.get(sender.id);
			if(sinv == null) {
				return;
			}
			if(sinv[slot] < amount) {
				this.omegga.whisper(name, pclr.err + 'You don\'t have enough ammo.</>');
				return;
			}
			let rinv = await this.store.get(reciever.id);
			if(rinv == null) {
				return;
			}
			sinv[slot] -= amount;
			rinv[slot] += amount;
			this.omegga.middlePrint(name, '-' + amount + ' ' + ammotypes[slot] + ' to ' + plr);
			this.omegga.middlePrint(plr, '+' + amount + ' ' + ammotypes[slot] + ' from ' + name);
			this.store.set(sender.id, sinv);
			this.store.set(reciever.id, rinv);
		})
		.on('cmd:listammo', async name => {
			const player = this.omegga.getPlayer(name);
			const inv = await this.store.get(player.id);
			for(var i in inv) {
				const ammot = ammotypes[i];
				const amount = inv[i];
				this.omegga.whisper(name, pclr.inf + ammot + ': ' + amount + '</>');
			}
		})
		.on('cmd:wipeammo', async name => {
			const player = await this.omegga.getPlayer(name);
			if(await player.isHost()) {
				this.store.wipe();
				this.omegga.whisper(name, pclr.msg + 'Wiped succesfully.</>');
			}
			else {
				this.omegga.whisper(name, pclr.err + 'You are not trusted enough to use this command!</>');
			}
		})
		.on('join', async player => {
			const keys = await this.store.keys();
			let inv = [];
			for(var i in ammotypes) {
				inv[i] = 0;
			}
			if(!keys.includes(player.id)) {
				this.store.set(player.id, inv);
			}
		});
		interval = setInterval(() => this.tick(), 500);
		return { registeredCommands: ['giveammo', 'reset', 'listammo'] };
	}
	
	async pluginEvent(event, from, ...args) {
		const ev = event.toLowerCase();
		if(ev === 'death' && loseamount > 0 && loseamount <= 1) {
			if(args[0] == null) {
				return;
			}
			const player = args[0].player;
			let inv = await this.store.get(player.id);
			for(var i in inv) {
				let ammo = inv[i];
				ammo = Math.floor(ammo * (1 - loseamount));
				inv[i] = ammo;
			}
			this.store.set(player.id, inv);
			this.omegga.whisper(player.name, pclr.msg + 'You have lost some ammo!</>');
			dead.push(player.name);
		}
		if(ev === 'spawn' && loseamount > 0 && loseamount <= 1) {
			if(args[0] == null) {
				return;
			}
			const player = args[0].player;
			dead.splice(dead.indexOf(player.name),1);
		}
		if(ev === 'setammo' || event === 'changeammo') {
			const pla = args[0];
			const slot = ammotypes.indexOf(args[1]);
			const amount = Number(args[2]);
			if(slot === -1 || slot == null || isNaN(amount) || amount == null) {
				return;
			}
			const player = await this.omegga.getPlayer(pla);
			if(player == null) {
				return;
			}
			let inv = await this.store.get(player.id);
			switch(ev) {
				case 'setammo':
					inv[slot] = amount;
					break;
				case 'changeammo':
					inv[slot] += amount;
					inv[slot] = Math.max(0, inv[slot]);
					let sign = '+';
					if(amount < 0) {
						sign = ''
					}
					this.omegga.middlePrint(player.name, sign + amount + ' ' + ammotypes[slot]);
					break;
			}
			this.store.set(player.id, inv);
		}
	}
	
	async stop() {
		const deathevents = await this.omegga.getPlugin('deathevents');
		if(deathevents && loseamount > 0) {
			console.log('Unsubbing...');
			deathevents.emitPlugin('unsubscribe');
		}
		clearInterval(interval);
	}
}
module.exports = LimitedAmmo;