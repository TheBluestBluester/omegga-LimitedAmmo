const fs = require('fs');
const { brs } = OMEGGA_UTIL;
const amlist = require('./AmmoSetup');
const vec = require('./vectorOperations');

let last = 0;
let interval;
let ammoSpawnInterval;
let enabled = true;

let password;
let updatedelay;
let loseamount;
let totax;
let todelete;
let toreturn;
let towipeleave;
let authorized;
let saveAmmo;
let starterAmmo;
let dropPerc;
let returnOnAmmo;

let ammoBoxData = [];
let playerAmmoBox = {};
let playerPawnList = {};

let defaultAmmo = [];

let removed = {};
let playerammolist = {};

const ammoBoxOwner = [{
	id: '00000000-0000-0000-0000-4000b0800000',
	name: 'Ammo box',
	bricks: 0
}];

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

let dead = [];

let ammoboxfolder;

let ammoSpawners = [];

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
		if(updatedelay < 120) {
			updatedelay = 120;
		}
		loseamount = this.config.AmountLostOnDeath;
		totax = this.config.TaxInfiniteWeapons;
		todelete = this.config.BanInfiniteWeapons;
		toreturn = this.config.ReturnWeapon;
		authorized = this.config.Authorized;
		saveAmmo = this.config.SaveAmmoOnLeave;
		starterAmmo = this.config.StarterAmmo;
		dropPerc = this.config.AmountDropped;
		returnOnAmmo = this.config.ReturnWhenHasAmmo;
	}
	
	async getHeldWeapons() {
		const reg = new RegExp(
		`BP_FigureV2_C .+?PersistentLevel\.(?<Pawn>.+?)\.WeaponSimState = .CurrentItemInstance=(.+?PersistentLevel\.(Weapon|BP_Item)_(?<Weapon>.+?)_C_(?<ID>\\d*)|(?<isNone>None))`
		);
		const data = await this.omegga.addWatcher(reg, {
			exec: () =>
			this.omegga.writeln(
				`getAll BP_FigureV2_C WeaponSimState`
			),
			first: 'index',
			timeoutDelay: 100,
			bundle: true
		}).catch();
		
		let dataArray = [];
		for(let i in data) {
			const chunk = data[i];
			let weapon = chunk[4];
			if(chunk[5] == 'None') { weapon = "None"; }
			dataArray.push({pawn: chunk[1], weapon: weapon, id: chunk[5]});
		}
		
		return dataArray;
		
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
	
	async ammoSpawnerTick() {
		
		for(let s in ammoSpawners) {
			
			let spawner = ammoSpawners[s];
			
			if(spawner.boxIndex != null) { continue; }
			
			if(spawner.coolDown > 0) {
				
				spawner.coolDown -= 0.01;
				
				if(spawner.coolDown <= 0) {
					
					spawner.coolDown = spawner.coolDownMax;
					
					const boxId = await this.createBox(spawner.pos, spawner.minMax[0], spawner.minMax[1]);
					spawner.boxIndex = boxId;
					
				}
				
			}
			
			ammoSpawners[s] = spawner;
			
		}
		
	}
	
	async tick() {
		try {
		
		function returnKeyAndValue(object, value) {
			const key = Object.entries(object).find(o => o[1] == value);
			if(key == null) { return [false, false]; }
			return [key[0], value];
		}
		
		const players = this.omegga.players;
		const gunStates = await this.getHeldWeapons();
		
		for(var gs in gunStates) {
			
			const weapon = gunStates[gs];
			//console.log(weapon);
			const [pl, ppawn] = returnKeyAndValue(playerPawnList, weapon.pawn);
			if(pl == false) { continue; }
			
			const player = players.find(p => p.id == pl);
			if(player == null) { continue; }
			let pa = playerammo[player.id];
			
			if(pa == null) {
				playerammo[player.id] = {grnt: '', grenade: false, ammo: 0, selected: null};
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
				if(toreturn && !returnOnAmmo) {
					if(player.name in removed) {
						
						const wepArray = removed[player.name];
						for(let i in wepArray) {
							
							player.giveItem(wepArray[i]);
							
						}
						removed[player.name] = [];
						
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
				if(toreturn && !returnOnAmmo) {
					if(player.name in removed) {
						
						const wepArray = removed[player.name];
						for(let i in wepArray) {
							
							player.giveItem(wepArray[i]);
							
						}
						removed[player.name] = [];
						
					}
				}
				this.omegga.middlePrint(player.name, inv[ammot]);
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
					if(!(player.name in removed)) { removed[player.name] = []; }
					removed[player.name].push(wep);
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
					const wep = 'Weapon_' + weapon.weapon.toLowerCase();
					player.takeItem(wep);
					if(toreturn) {
						if(!(player.name in removed)) { removed[player.name] = []; }
						removed[player.name].push(wep);
					}
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
			
			const fileName = ammoboxfolder[abf];
			const file = fs.readFileSync(__dirname + '/AmmoBoxes/' + fileName);
			
			const brsSave = brs.read(file);
			
			const brickInd = brsSave.bricks.findIndex(b => 'BCD_Interact' in b.components);
			let interactBrick = brsSave.bricks[brickInd];
			
			const bounds = OMEGGA_UTIL.brick.getBounds(brsSave);
			const extent = vec.div(vec.sub(bounds.maxBound, bounds.minBound), 2);
			
			if(interactBrick.components.BCD_Interact.Message == "ALL") {
				
				const data = interactBrick.components.BCD_Interact.ConsoleTag.split(' ');
				if(this.checkArrayNaN(data)) {
					this.omegga.broadcast(pclr.err + 'Ammo box "' + fileName + '" contains invalid data.<>');
					continue;
				}
				
				const order = Number(data[0]);
				const randomPerc = Number(data[1]) / 100;
				const amounts = data.splice(2, data.length - 2);
				if(amounts.length != ammotypes.length) {
					this.omegga.broadcast(pclr.err + 'Ammo box "' + fileName + '" contains invalid amount of params.<>');
					continue;
				}
				
				interactBrick.components.BCD_Interact.Message = '';
				interactBrick.components.BCD_Interact.ConsoleTag = '';
				brsSave.bricks[brickInd] = interactBrick;
				brsSave.brick_owners = ammoBoxOwner;
				
				ammoBoxData.push({ammoType: "ALL", amounts: amounts, random: randomPerc, center: bounds.center, extent: extent, order: order, brs: brsSave, interInd: brickInd});
				
			}
			else if(interactBrick.components.BCD_Interact.Message == "PLAYERDROP") {
				
				interactBrick.components.BCD_Interact.Message = '';
				interactBrick.components.BCD_Interact.ConsoleTag = '';
				brsSave.bricks[brickInd] = interactBrick;
				brsSave.brick_owners = ammoBoxOwner;
				
				playerAmmoBox = {brs: brsSave, interInd: brickInd, center: bounds.center, extent: extent};
				
			}
			else {
				
				const ammoType = ammotypes.findIndex(i => i == interactBrick.components.BCD_Interact.Message);
				if(ammoType == -1) {
					this.omegga.broadcast(pclr.err + 'Ammo box "' + fileName + '" contains invalid ammo type.<>');
					continue;
				}
				
				const data = interactBrick.components.BCD_Interact.ConsoleTag.split(' ');
				if(this.checkArrayNaN(data)) {
					this.omegga.broadcast(pclr.err + 'Ammo box "' + fileName + '" contains invalid data.<>');
					continue;
				}
				
				const amount = Number(data[0]);
				const order = Number(data[1]);
				
				interactBrick.components.BCD_Interact.Message = '';
				interactBrick.components.BCD_Interact.ConsoleTag = '';
				brsSave.bricks[brickInd] = interactBrick;
				brsSave.brick_owners = ammoBoxOwner;
				
				ammoBoxData.push({ammoType: ammoType, amount: amount, center: bounds.center, extent: extent, order: order, brs: brsSave, interInd: brickInd});
				
			}
			
		}
		
	}
	
	checkArrayNaN = (array) => {
		
		for(let i in array) {
			
			if(isNaN(array[i])) {
				return true;
			}
			
		}
		
		return false;
		
	}
	
	copyArray = (array) => {
		
		let newArray = [];
		for(let i in array) {
			
			newArray.push(array[i]);
			
		}
		
		return newArray;
		
	}
	
	async createBox(pos, min, max) {
		
		const id = Math.floor(Math.random() * 100000);
		
		let ammoBoxList = this.copyArray(ammoBoxData);
		ammoBoxList = (ammoBoxList.sort((a, b) => a.order - b.order)).splice(min, max - min + 1);
		//console.log(ammoBoxList);
		const selInd = Math.floor((Math.random() ** 2) * ammoBoxList.length);
		const ammoBox = ammoBoxList[selInd];
		
		const trueCenter = vec.add(ammoBox.center, pos);
		
		let interactBrick = ammoBox.brs.bricks[ammoBox.interInd];
		if(ammoBox.ammoType == "ALL") {
			
			let randomAmounts = this.copyArray(ammoBox.amounts);
			for(let i=0;i<randomAmounts.length;i++) { randomAmounts[i] = Math.floor(((1 - Math.random() * ammoBox.random)) * randomAmounts[i])}
			
			interactBrick.components.BCD_Interact.ConsoleTag = 'ammoBox ALL ' + randomAmounts.join(',') + ' ' + trueCenter.join(' ') + ' ' + ammoBox.extent.join(' ') + ' ' + id;
			
		}
		else {
			interactBrick.components.BCD_Interact.ConsoleTag = 'ammoBox ' + ammoBox.ammoType + ' ' + ammoBox.amount + ' ' + trueCenter.join(' ') + ' ' + ammoBox.extent.join(' ') + ' ' + id;
		}
		ammoBox.brs.bricks[ammoBox.interInd] = interactBrick;
		
		this.omegga.loadSaveData(ammoBox.brs, {quiet: true, offX: pos[0], offY: pos[1], offZ: pos[2]});
		
		return id;
		
	}
	
	async reCacheAmmoSpawns() {
		
		//if(!result) { return; }
		
		console.log("Recaching ammo spawns...");
		
		const host = this.omegga.host;
		
		ammoSpawners = [];
		
		const brs = await this.omegga.getSaveData();
		//console.log(brs);
		if (brs == null) { return; }
		
		let bricks = brs.bricks.filter(b => 'BCD_Interact' in b.components);
		
		for(let b in bricks) {
			
			const brick = bricks[b];
			
			const data = brick.components.BCD_Interact.ConsoleTag.split(' ');
			const tag = (data[0]).toLowerCase();
			
			if(tag == 'ammospawner' && data.length == 4) {
				
				const owner = brs.brick_owners[brick.owner_index - 1];
				const authorizedOwner = authorized.find(ap => ap.name == owner.name);
				if(!(owner.name == host.name || authorizedOwner)) { continue; }
				
				let ammoSpawnPos = brick.position;
				ammoSpawnPos[2] += brick.size[2];
				
				const coolDown = Number(data[3]);
				
				if(isNaN(coolDown)) {
					this.omegga.broadcast(pclr.err + 'Ammo spawner at [' + ammoSpawnPos + '] contains invalid cooldown parameters.<>');
					continue;
				}
				
				const minMax = [Number(data[1]), Number(data[2])];
				if(isNaN(minMax[0]) || isNaN(minMax[1]) || minMax[0] > minMax[1] || minMax[0] < 0 || minMax[1] > ammoBoxData.length - 1) {
					this.omegga.broadcast(pclr.err + 'Ammo spawner at [' + ammoSpawnPos + '] contains invalid min-max parameters.<>');
					continue;
				}
				
				ammoSpawners.push({pos: ammoSpawnPos, minMax: minMax, coolDown: coolDown, coolDownMax: coolDown, boxIndex: null});
				
			}
			
		}
		
		this.omegga.broadcast(pclr.msg + 'Ammo spawns cached!<>');
		this.omegga.clearBricks('00000000-0000-0000-0000-4000b0800000', {quiet: true});
		
	}
	
	async init() {
		ammoboxfolder = fs.readdirSync(__dirname + "/AmmoBoxes");
		
		const l = await amlist.setupAmmo();
		ammotypes = l[0];
		gunammotypes = l[1]
		
		this.setupBoxes();
		
		
		function pattern(line, omegga) {
			//try{
			
			const regex = /\[(?<counter>\d+)\]LogChat: (?<player>\w+) finished uploading/;
			const match = line.match(regex);
			if(match == null) {
				return;
			}
			
			let groups = match.groups
			if(groups.counter == last) {
				return;
			}
			last = groups.counter;
			
			//groups.execute = execute;
			omegga.emit('brsload');
			
			//return groups;
		}
		
		this.omegga.addMatcher((line) => pattern(line, this.omegga), this.reCacheAmmoSpawns);
		
		
		for(let i=0;i<ammotypes.length;i++) {
			
			if(i > starterAmmo.length - 1) {
				defaultAmmo.push(0);
			}
			else {
				defaultAmmo.push(Number(starterAmmo[i]));
			}
			
		}
		
		const deathevents = await this.omegga.getPlugin('deathevents');
		if(deathevents) {
			console.log('Deathevents detected.');
			deathevents.emitPlugin('subscribe');
		}
		else {
			console.log('This plugin requires deathevents.');
			return;
		}
		
		this.omegga.on('interact', async data => {
			try{
			const split = data.message.split(' ');
			
			if(split[0] != 'ammoBox') { return; }
			
			//console.log(data.message);
			const brs = await this.omegga.getSaveData({center: data.position, extent: data.brick_size});
			const owner = brs.brick_owners[brs.bricks[0].owner_index - 1];
			if(owner.name != ammoBoxOwner[0].name) {
				this.omegga.whisper(data.player.name, pclr.err + 'This box was created by a player.<>');
				return;
			}
			
			const splitNum = [];
			for(let i=1;i<split.length;i++) { splitNum.push(Number(split[i])); }
			
			const center = splitNum.splice(2, 3);
			const extent = splitNum.splice(2, 3);
			
			this.omegga.clearRegion({center: center, extent: extent});
			
			if(split[1] == "ALL") {
				
				let messageArray = [];
				
				let amounts = split[2].split(',');
				for(let i=0;i<amounts.length;i++) {
					//console.log(Number(amounts[i]));
					playerammolist[data.player.id][i] += Number(amounts[i]);
					
					messageArray.push('+ ' + amounts[i] + ' ' + ammotypes[i]);
					
				}
				
				this.omegga.middlePrint(data.player.name, messageArray.join(', '));
				
			}
			else {
				playerammolist[data.player.id][splitNum[0]] += splitNum[1];
				this.omegga.middlePrint(data.player.name, '+' + splitNum[1] + ' ' + ammotypes[splitNum[0]]);
			}
			
			if(toreturn && returnOnAmmo) {
				if(data.player.name in removed) {
					
					const playerAmmo = playerammolist[data.player.id];
					const pl = await this.omegga.getPlayer(data.player.name); // Fix dis shit already.
					
					const wepArray = removed[data.player.name];
					let toKeep = [];
					for(let i in wepArray) {
						
						const spl = wepArray[i].replace('Weapon_', '');
						const ammoType = gunammotypes[spl];
						//console.log(playerAmmo);
						if(playerAmmo[ammoType] <= 0) { toKeep.push(wepArray[i]); continue; }
						pl.giveItem(wepArray[i]);
						
					}
					
					if(toKeep.length > 0) {
						removed[data.player.name] = toKeep;
					}
					else {
						removed[data.player.name] = [];
					}
					
				}
			}
			
			const ammoSpawnerInd = ammoSpawners.findIndex(as => as.boxIndex == splitNum[2]);
			if(ammoSpawnerInd > -1) {
				ammoSpawners[ammoSpawnerInd].boxIndex = null;
			}
			}catch(e){console.log(e)}
			
		})
		.on('brsload', async () => {
			this.reCacheAmmoSpawns();
		})
		.on('cmd:recache', async name => {
			
			const player = await this.omegga.getPlayer(name);
			const auth = authorized.find(ap => ap.name == name);
			if(!(await player.isHost() || auth)) {
				this.omegga.whisper(name, pclr.err + 'You are not trusted enough to use this command!</>');
				return;
			}
			
			this.reCacheAmmoSpawns({omegga: this.omegga, pclr: pclr});
			
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
			
			if(toreturn && returnOnAmmo) {
				if(reciever.name in removed) {
					
					//const playerAmmo = playerammolist[reciever.id];
					//const pl = await this.omegga.getPlayer(reciever.name); // Fix dis shit already.
					
					const wepArray = removed[reciever.name];
					let toKeep = [];
					for(let i in wepArray) {
						
						const spl = wepArray[i].replace('Weapon_', '');
						const ammoType = gunammotypes[spl];
						//console.log(playerAmmo);
						if(rinv[ammoType] <= 0) { toKeep.push(wepArray[i]); continue; }
						reciever.giveItem(wepArray[i]);
						
					}
					
					if(toKeep.length > 0) {
						removed[reciever.name] = toKeep;
					}
					else {
						removed[reciever.name] = [];
					}
					
				}
			}
			
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
				let inv = this.copyArray(defaultAmmo);
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
			let inv = this.copyArray(defaultAmmo);
			
			if(saveAmmo) {
				
				if(!keys.includes(player.id)) {
					this.store.set(player.id, inv);
				}
				else {
					inv = await this.store.get(player.id);
				}
				
			}
			
			const pl = await this.omegga.getPlayer(player.id);
			const pawn = await pl.getPawn();
			playerPawnList[player.id] = pawn;
			
			playerammolist[player.id] = inv;
		})
		.on('leave', async player => {
			
			if(saveAmmo) {
				
				let inv = playerammolist[player.id];
				this.store.set(player.id, inv);
				
			}

			delete playerammolist[player.id];
		});
		interval = setInterval(() => this.tick(), updatedelay);
		ammoSpawnInterval = setInterval(() => this.ammoSpawnerTick(), 10);
		const players =  this.omegga.players;
		const keys = await this.store.keys();
		for(var pi in players) {
			const player = await this.omegga.getPlayer(players[pi].id);
			let inv = this.copyArray(defaultAmmo);
			
			if(saveAmmo) {
				if(!keys.includes(player.id)) {
					this.store.set(player.id, inv);
				}
				else {
					inv = await this.store.get(player.id);
				}
			}
			
			const pawn = await player.getPawn();
			playerPawnList[player.id] = pawn;
			
			playerammolist[player.id] = inv;
		}
		
		this.reCacheAmmoSpawns().catch((e) => {console.log(e)});
		
		return { registeredCommands: ['giveammo', 'reset', 'listammo', 'wipeammo', 'recache'] };
	}
	
	async pluginEvent(event, from, ...args) {
		const ev = event.toLowerCase();
		if(ev === 'death' && loseamount > 0 && loseamount <= 100) {
			if(args[0] == null) {
				return;
			}
			const player = args[0].player;
			let inv = playerammolist[player.id];
			
			const loss = (1 - loseamount / 100);
			const drop = (1 - loss) * (dropPerc / 100);
			let dropAmounts = [];
			
			for(var i in inv) {
				let ammo = inv[i];
				dropAmounts.push(ammo * drop);
				ammo = Math.floor(ammo * loss);
				inv[i] = ammo;
			}
			playerammolist[player.id] = inv;
			this.omegga.whisper(player.name, pclr.msg + 'You have lost some ammo!</>');
			
			if(drop > 0) {
				
				let playerPos = await (this.omegga.getPlayer(player.name)).getPosition();
				playerPos = vec.floor(playerPos);
				
				const interactBrick = playerAmmoBox.brs.bricks[playerAmmoBox.interInd];
				const trueCenter = vec.add(playerAmmoBox.center, playerPos);
				playerAmmoBox.brs.bricks[playerAmmoBox.interInd] = interactBrick;
				interactBrick.components.BCD_Interact.ConsoleTag = "ammoBox ALL " + dropAmounts.join(',') + ' ' + trueCenter.join(' ') + ' ' + playerAmmoBox.extent.join(' ') + ' -1';
				
				this.omegga.loadSaveData(playerAmmoBox.brs, {quiet: true, offX: playerPos[0], offY: playerPos[1], offZ: playerPos[2]});
				
			}
			
			dead.push(player.name);
		}
		if(ev === 'spawn') {
			if(args[0] == null) {
				return;
			}
			const player = args[0].player;
			if(loseamount >= 100) {
				playerammolist[player.id] = this.copyArray(defaultAmmo);
			}
			//console.log(playerammolist, loseamount);
			const ind = dead.indexOf(player.name)
			if(ind > -1) {
				dead.splice(ind,1);
			}
			
			removed[player.name] = [];
			
			const pl = await this.omegga.getPlayer(player.name);
			const pawn = await pl.getPawn();
			playerPawnList[player.id] = pawn;
			
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
		clearInterval(ammoSpawnInterval);
		
		this.omegga.clearBricks('00000000-0000-0000-0000-4000b0800000', {quiet: true});
		
		if(!saveAmmo) { return; }
		const players = this.omegga.players;
		for(var pi in players) {
			const player = players[pi];
			let inv = playerammolist[player.id];
			this.store.set(player.id, inv);
		}
	}
}
module.exports = LimitedAmmo;