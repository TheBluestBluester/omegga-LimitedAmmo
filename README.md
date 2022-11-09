# omegga-LimitedAmmo
Make people care where they shoot.
This plugin gives players limited ammounts of ammo, ammo boxes and ammo dispencers.

## Creating ammo dispencers.
To create an ammo dispencer you first place a brick of your chouce. Then you add an interact component.

Then you write in "Print to console" the following:

ammodis (ammo box savefile name without .brs) (cooldown in seconds) (password)

If done correctly the ammo box of your choice should spawn ontop of the brick.

## Creating custom ammo boxes.
To make the ammo box functional add a brick ON TOP of the ammo box and add an interact component.

Then you write in "Print to console" the following:

limitedammo (ammo type as a number) (ammo amount) (should the ammo box disappear upon clicking (0 / 1))

Once you finished your ammo box put it into "AmmoBoxes" folder inside the plugin.
