<SPAN ALIGN="CENTER" STYLE="text-align:center">
<DIV ALIGN="CENTER" STYLE="text-align:center">

[![homebridge-better-roku: The Better Roku Plugin for Homebridge](images/banner.png)](https://github.com/watzon/homebridge-better-roku)

# Homebridge Better Roku
[![Downloads](https://img.shields.io/npm/dt/homebridge-better-roku?color=%230559C9&logo=icloud&logoColor=%23FFFFFF&style=for-the-badge)](https://www.npmjs.com/package/homebridge-better-roku)
[![Version](https://img.shields.io/npm/v/homebridge-better-roku?color=%230559C9&label=Latest%20Version&logo=ubiquiti&logoColor=%23FFFFFF&style=for-the-badge)](https://www.npmjs.com/package/homebridge-better-roku)

# Complete HomeKit support for the Roku ecosystem using [Homebridge](https://homebridge.io).
</DIV>
</SPAN>

`homebridge-better-roku` is a plugin for Homebridge that allows you to control your Roku devices and apps.

## Why use this plugin instead of the others?

I was pretty disappointed with the other Roku plugins in existence right now. They don't seem to work and aren't maintained for the most part, which led me to create this plugin.

This plugin also has some marked improvements over the others, including:

- The ability to manually add devices to HomeKit rather than relying on auto-discovery.
- Optional automatic discovery of Roku devices on your network.
- Device blocklist to prevent devices you don't want to appear in HomeKit from being discovered.

Like the other apps, we still also have an app blocklist and the ability to set the polling interval.

## Installation

1. Install Homebridge using the official guide [here](https://homebridge.io/install/).

2. Install `homebridge-better-roku` plugin using npm:
    ```
    sudo npm install -g homebridge-better-roku
    ```

3. Run Homebridge with the Roku platform:
    ```
    homebridge -I
    ```

## Configuration

To configure the Roku platform, you will need to add the following to your `config.json` file:

```json
{
    "platforms": [
        {
            "platform": "BetterRokuTVs",
            "name": "Roku TV Platform",
            "devices": [
                {
                    "name": "Roku TV",
                    "ip": "192.168.1.100"
                }
            ],
            "excludedApps": ["SomeAppToExclude"],
            "pollingInterval": 30000,
            "autoDiscover": true
        }
    ]
}
```
