module.exports = {
	async setupAmmo() {
		const ammoTypes = [
			'Light ammo',
			'Medium ammo',
			'Heavy ammo',
			'Shotgun ammo',
			'Explosives'
		]
		const gunAmmo = {
			assaultrifle: 1,
			autoshotgun: 3,
			antimaterielrifle: 2,
			bullpuprifle: 1,
			bullpupsmg: 0,
			derringer: 0,
			grenadelauncher: 4,
			heavyassaultrifle: 1,
			heavysmg: 0,
			highpowerpistol: 0,
			huntingshotgun: 3,
			impactgrenade: 4,
			impactgrenadelauncher: 4,
			leveractionrifle: 2,
			lightmachinegun: 1,
			magnumpistol: 1,
			microsmg: 0,
			pistol: 0,
			pulsecarbine: 1,
			quadlauncher: 4,
			revolver: 0,
			rocketlauncher: 4,
			semiautorifle: 1,
			servicerifle: 1,
			shotgun: 3,
			slugshotgun: 3,
			sniper: 2,
			standardsubmachinegun: 0,
			submachinegun: 0,
			supershotgun: 3,
			suppressedassaultrifle: 1,
			suppressedbullpupsmg: 0,
			suppressedpistol: 0,
			suppressedservicerifle: 1,
			tacticalshotgun: 3,
			tacticalsmg: 0,
			typewritersmg: 0,
			
			minigun: 0,
			twincannon: 4,
			bazooka: 4
		}
		return [ammoTypes, gunAmmo];
	}
}