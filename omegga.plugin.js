const fs = require('fs');
const { brs } = OMEGGA_UTIL;
const amlist = require('./AmmoSetup');

let interval;
let enabled = true;

let password;
let updatedelay;
let loseamount;
let totax;
let todelete;
let toreturn;
let towipeleave;
let authorized;

let boxbrslist = {};

let removed = [];
let playerammolist = {};

const pclr = {
	err: '[LM] <color="ff7711">',
	inf: '<color="ffdd00">',
	msg: '[LM] <color="aaffaa">'
};

const notguns = [
	'BrickTool', 'Hammer', 'PaintTool', 'SelectionTool', 'Guide', 'ResizeTool', 'Applicator', 'ImpulseGrenade', 'HealthPotion'
];
const grenades = [
	'ImpactGrenade', 'StickGrenade'
];
const infiniteguns = [
	'twincannon', 'bazooka', 'minigun'
];

let dispencercooldown = [];

let dead = [];

let ammoboxfolder;

let ammotypes;
let gunammotypes;

let playerammo = {};

class LimitedAmmo {
	
	constructor(omegga, config, store) {
		this.omegga = omegga;
		this.config = config;
		this.store = store
		password = this.config.Password;
		updatedelay = this.config.UpdateDelay;
		loseamount = this.config.AmountLostOnDeath;
		totax = this.config.TaxInfiniteWeapons;
		todelete = this.config.BanInfiniteWeapons;
		toreturn = this.config.ReturnWeapon;
		towipeleave = this.config.WipeOnLeave;
		authorized = this.config.Authorized;
	}
	
	async getHeldWeapon(pawn) {
		const reg = new RegExp(
		`BP_FigureV2_C .+?PersistentLevel\.${pawn}\.WeaponSimState = .CurrentItemInstance=(.+?PersistentLevel\.(Weapon|BP_Item)_(?<Weapon>.+?)_C_(?<ID>\\d*)|(?<isNone>None))`
		);
		const [{groups: { Weapon, ID, isNone }}] = await this.omegga.addWatcher(reg, {
			exec: () =>
			this.omegga.writeln(
				`getAll BP_FigureV2_C WeaponSimState Name=${pawn}`
			),
			first: 'index',
			timeoutDelay: 500
		}).catch();
		
		if(isNone) {
			
			return {weapon: 'None', id: null};
		}
		else {
			return {weapon: Weapon, id: ID};
		}
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
		}).catch();
		return Number(Ammo);
	}
	
	async tick() {
		try {
		
		const entries = Object.entries(dispencercooldown);
		
		for(let e in entries) {
			
			const entry = entries[e];
			
			if(entry[1] > 0) {
				entry[1] -= updatedelay;
				dispencercooldown[entry[0]] = entry[1];
			}
			else {
				delete dispencercooldown[entry[0]];
			}
			
		}
		
		const players = this.omegga.players;
		for(var pi in players) {
			const player = players[pi];
			const ppawn = await player.getPawn().catch();
			const weapon = await this.getHeldWeapon(ppawn);
			//console.log(weapon.weapon);
			let pa = playerammo[player.id];
			//console.log(pa);
			if(pa == null) {
				playerammo[player.id] = {grnt: '', grenade: false, ammo: 0, selected: weapon.weapon};
				continue;
			}
			let inv = playerammolist[player.id];
			 
			if((pa.selected != weapon.weapon || weapon.weapon == "None") && pa.grenade) {
				if(pa.grenade != null && pa.grenade) {
					pa.grenade = false;
					const grenadetype = gunammotypes[pa.grnt.toLowerCase()];
					inv[grenadetype]--;
					playerammolist[player.id] = inv;
					this.omegga.middlePrint(player.name, inv[grenadetype]);
				}
				continue;
			}
			
			if(weapon.weapon == "None" || notguns.includes(weapon.weapon)) {
				if(toreturn) {
					const weprem = removed.filter(x => x.pl === player.name);
					for(var wr in weprem) {
						const wep = weprem[wr].wep;
						removed.splice(removed.indexOf(wep), 1);
						player.giveItem(wep);
					}
				}
				continue;
			}
			
			let ammo = await this.getWeaponAmmo(weapon.weapon, weapon.id);
			const ammot = gunammotypes[weapon.weapon.toLowerCase()];
			if(ammot == null) {
				continue;
			}
			if(grenades.includes(weapon.weapon)) {
				if(inv[ammot] <= 0) {
					this.omegga.whisper(player.name, pclr.msg + 'You ran out of ' + ammotypes[ammot] + '.</>');
					const wep = 'Weapon_' + weapon.weapon.toLowerCase();
					player.takeItem(wep);
					continue;
				}
				pa.grenade = true;
				pa.grnt = weapon.weapon;
				playerammo[player.id] = pa;
				pa.selected = weapon.weapon
				continue;
			}
			if(pa.selected != weapon.weapon) {
				pa.selected = weapon.weapon;
				pa.grenade = false;
				pa.ammo = ammo;
				playerammo[player.id] = pa;
				continue;
			}
			const keys = Object.keys(playerammolist);
			if(!keys.includes(player.id)) {
				continue;
			}
			const infinite = infiniteguns.includes(weapon.weapon.toLowerCase());
			if(infinite && todelete) {
				this.omegga.whisper(player.name, pclr.msg + 'This weapon is not allowed.</>');
				const wep = 'Weapon_' + weapon.weapon.toLowerCase();
				player.takeItem(wep);
				continue;
			}
			if(inv[ammot] <= 0 && !(infinite && totax) && !dead.includes(player.name)) {
				this.omegga.whisper(player.name, pclr.msg + 'You ran out of ' + ammotypes[ammot] + '.</>');
				const wep = 'Weapon_' + weapon.weapon.toLowerCase();
				player.takeItem(wep);
				if(toreturn) {
					removed.push({pl: player.name, wep: wep});
				}
				continue;
			}
			if(pa.ammo > ammo || (infinite && totax)) {
				const decrease = pa.ammo - ammo;
				inv[ammot] -= decrease;
				if(infinite && totax) {
					inv[ammot]--;
				}
				if(inv[ammot] < 0) {
					inv[ammot] = 0;
				}
				playerammolist[player.id] = inv;
				this.omegga.middlePrint(player.name, inv[ammot]);
				if(inv[ammot] <= 0) {
					this.omegga.whisper(player.name, pclr.msg + 'You ran out of ' + ammotypes[ammot] + '.</>');
					player.takeItem('Weapon_' + weapon.weapon.toLowerCase());
					continue;
				}
			}
			pa.ammo = ammo;
			playerammo[player.id] = pa;
		}
		
		}
		catch(e) {
			//console.log(e);
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
			const values = Object.keys(boxbrslist);
			if(minrange < 0 || minrange > maxrange || maxrange > values.length - 1) {
				this.omegga.whisper(playername, pclr.err + 'This dispencer may have incorrect values setup.</>');
				return;
			}
			const minmax = maxrange - minrange;
			boxname = values[Math.abs(random(-minmax, minmax)) + minrange];
			default:
			foundbox = boxbrslist[boxname];
			if(foundbox == null) {
				this.omegga.whisper(playername, pclr.err + 'Ammo box ' + boxname + ' doesn\'t exist.</>');
				return;
			}
			this.omegga.loadSaveData(foundbox, {quiet: true, offX: pos[0], offY: pos[1], offZ: pos[2] + size[2]});
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
			let inv = playerammolist[pl.id];
			inv[ammotypes.indexOf(ammotype)] += count;
			this.omegga.middlePrint(playername, '+' + count + ' ' + ammotype);
			playerammolist[pl.id] = inv;
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
		
		this.omegga.on('interact', async data => {
			const d = data.message.split(' ');
			if(d[0].toLowerCase() === 'limitedammo') {
				if(password.length > 0 && d[4] !== password) {
					return;
				}
				if(authorized.length > 0) {
					const brs = await this.omegga.getSaveData({center: data.position, extent: data.brick_size});
					const brick = brs.bricks[0];
					const owner = brs.brick_owners[brick.owner_index - 1];
					const filter = authorized.filter(p => p.id === owner.id);
					if(filter.length === 0) {
						this.omegga.whisper(data.player.name, pclr.err + 'This person is not authorized to make ammo boxes.</>');
						return;
					}
				}
				let inv = playerammolist[data.player.id];
				const slot = Number(d[1]);
				inv[slot] += Number(d[2]);
				this.omegga.middlePrint(data.player.name, '+' + d[2] + ' ' + ammotypes[d[1]]);
				playerammolist[data.player.id] = inv;
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
				const timeout = dispencercooldown[data.position.join(' ')];
				if(timeout != null) {
					this.omegga.middlePrint(data.player.name, 'This ammo dispencer is on cooldown!');
					return;
				}
				if(authorized.length > 0) {
					const brs = await this.omegga.getSaveData({center: data.position, extent: data.brick_size});
					const brick = brs.bricks[0];
					const owner = brs.brick_owners[brick.owner_index - 1];
					const filter = authorized.filter(p => p.id === owner.id);
					if(filter.length === 0) {
						this.omegga.whisper(data.player.name, pclr.err + 'This person is not authorized to make ammo dispencers.</>');
						return;
					}
				}
				this.createBox(data.player.name, d[1], data.position, data.brick_size);
				dispencercooldown[data.position.join(' ')] = Number(d[2]) * 1000;
				//setTimeout(() => dispencercooldown.splice(dispencercooldown.indexOf(data.position.join(' ')),1), Number(d[2]) * 1000);
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
			const reciever = await this.omegga.findPlayerByName(plr);
			if(reciever == null) {
				this.omegga.whisper(name, pclr.err + 'Could not find the reciever.</>');
				return;
			}
			if(reciever.name === name) {
				this.omegga.whisper(name, pclr.err + 'You cannot give yourself ammo.</>');
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
			this.omegga.middlePrint(name, '-' + amount + ' ' + ammotypes[slot] + ' to ' + reciever.name);
			this.omegga.middlePrint(reciever.name, '+' + amount + ' ' + ammotypes[slot] + ' from ' + name);
			playerammolist[sender.id] = sinv;
			playerammolist[reciever.id] = rinv;
		})
		.on('cmd:listammo', async name => {
			const player = await this.omegga.getPlayer(name);
			const inv = playerammolist[player.id];
			for(var i in inv) {
				const ammot = ammotypes[i];
				const amount = inv[i];
				this.omegga.whisper(name, pclr.inf + ammot + ': ' + amount + '</>');
			}
		})
		.on('cmd:wipeammo', async name => {
			const player = await this.omegga.getPlayer(name);
			if(await player.isHost()) {
				const keys = await this.store.keys();
				let inv = [];
				for(var i in ammotypes) {
					inv[i] = 0;
				}
				for(var k in keys) {
					const key = keys[k];
					this.store.set(key, inv);
					if(playerammolist[key] == null) {
						return;
					}
					playerammolist[key] = inv;
				}
				this.omegga.whisper(name, pclr.msg + 'Wiped succesfully.</>');
			}
			else {
				this.omegga.whisper(name, pclr.err + 'You are not trusted enough to use this command!</>');
			}
		})
		.on('join', async player => {
			const keys = await this.store.keys();
			let inv = [];
			if(!keys.includes(player.id)) {
				for(var i in ammotypes) {
					inv[i] = 0;
				}
				this.store.set(player.id, inv);
			}
			else {
				inv = await this.store.get(player.id);
			}
			playerammolist[player.id] = inv;
		})
		.on('leave', async player => {
			let inv = playerammolist[player.id];
			if(towipeleave) {
				for(var i in inv) {
					inv[i] = 0;
				}
			}
			this.store.set(player.id, inv);
			delete playerammolist[player.id];
		});
		interval = setInterval(() => this.tick(), updatedelay);
		const players =  this.omegga.players;
		for(var pi in players) {
			const player = players[pi];
			let inv = await this.store.get(player.id);
			playerammolist[player.id] = inv;
		}
		return { registeredCommands: ['giveammo', 'reset', 'listammo', 'wipeammo'] };
	}
	
	async pluginEvent(event, from, ...args) {
		const ev = event.toLowerCase();
		if(ev === 'death' && loseamount > 0 && loseamount <= 1) {
			if(args[0] == null) {
				return;
			}
			const player = args[0].player;
			let inv = playerammolist[player.id];
			for(var i in inv) {
				let ammo = inv[i];
				ammo = Math.floor(ammo * (1 - loseamount));
				inv[i] = ammo;
			}
			playerammolist[player.id] = inv;
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
		if(ev === 'setammo' || ev === 'changeammo') {
			const pla = args[0];
			const slot = Number(args[1]);
			const amount = Number(args[2]);
			if(isNaN(slot) || slot == null || isNaN(amount) || amount == null) {
				return;
			}
			const player = await this.omegga.getPlayer(pla);
			if(player == null) {
				return;
			}
			let inv = playerammolist[player.id];
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
					if(!Number(args[3])) {
						this.omegga.middlePrint(player.name, sign + amount + ' ' + ammotypes[slot]);
					}
					break;
			}
			playerammolist[player.id] = inv;
		}
		if(ev === 'getammo') {
			const pla = args[0];
			const slot = Number(args[1]);
			const amount = Number(args[2]);
			if(isNaN(slot) || slot == null || isNaN(amount) || amount == null) {
				return;
			}
			const player = await this.omegga.getPlayer(pla);
			if(player == null) {
				return;
			}
			let inv = playerammolist[player.id];
			const sender = await this.omegga.getPlugin(from);
			sender.emitPlugin('ammocount', inv[slot]);
		}
	}
	
	async stop() {
		const deathevents = await this.omegga.getPlugin('deathevents');
		if(deathevents && loseamount > 0) {
			console.log('Unsubbing...');
			deathevents.emitPlugin('unsubscribe');
		}
		clearInterval(interval);
		const players = this.omegga.players;
		for(var pi in players) {
			const player = players[pi];
			let inv = [];
			if(towipeleave) {
				for(var i in ammotypes) {
					inv[i] = 0;
				}
			}
			else {
				inv = playerammolist[player.id];
			}
			this.store.set(player.id, inv);
		}
	}
}
module.exports = LimitedAmmo;