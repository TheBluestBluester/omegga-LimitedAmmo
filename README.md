# omegga-LimitedAmmo
Make people care where they shoot.
This plugin gives players limited ammounts of ammo, ammo boxes and ammo dispencers.

## Creating ammo dispencers.
To create an ammo dispencer you first place a brick of your choice. Then you add an interact component.

Then you write in "Print to console" the following:

ammodis (ammo box savefile name without .brs) (cooldown in seconds) (password)

This also supports random ammo! To have the dispencer generate random ammo instead of the brs file write:

random-(min range)-(max range)

...or skip the ammo box entirely by writing:

give-(ammo type)-(amount)

## Creating custom ammo boxes.
To make the ammo box functional add a brick ON TOP of the ammo box and add an interact component.

Then you write in "Print to console" the following:

limitedammo (ammo type as a number) (ammo amount) (extention of the clear box from the bottom of the brick in x2 microbricks)

Once you finished your ammo box put it into "AmmoBoxes" folder inside the plugin and then reload.

## Interacting from other plugins

You can make the plugin give or remove ammo from players using emitPlugin.

### setammo

Sets player's ammo count;
Args:
[player name/id/etc.] [ammo type as a number] [ammo amount]

### changeammo

Changes player's ammo count;
Args:
[player name/id/etc.] [ammo type as a number] [ammo amount]
