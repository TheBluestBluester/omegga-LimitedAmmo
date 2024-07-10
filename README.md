# omegga-LimitedAmmo
Make people care where they shoot.
This plugin gives players limited ammounts of ammo, ammo boxes and ammo spawners.

## Creating ammo spawners.
To create an ammo spawner, place down a brick with a "Print To Console" in the interact component set to the following:

`ammospawner (Minimum box index) (Maximum box index) (Cooldown in seconds)`

The ammo spawners need to be cached for the plugin to recognize them.
To cache ammo spawners you have to type `/recache`.
The plugin automatically recaches on startup or when a save is loaded.

## Creating custom ammo boxes.
To make the ammo box functional add an interact component to a brick. It can be any brick, but preferebly it should be somewhere where player's can easily click it.
To define the ammo box's ammo type, write the ammo type name into "Message".
In "Print To Console" write the amount of ammo that will be given, and the order.
Order value is for ordering ammo boxes. The higher up the ammo box is in the order, the higher the rarity.

If you want to make the ammo box give all of the ammo types, instead of the ammo type write ALL.
When writing to "Print To Console" you first have to input the order, then the randomness (0 - 100), then all amounts for every single ammo type.

## Plugin events.
### setammo

Sets player's ammo count;
Args:
[player name/id/etc.] [ammo type as a number] [ammo amount]

### changeammo

Changes player's ammo count;
Args:
[player name/id/etc.] [ammo type as a number] [ammo amount]
