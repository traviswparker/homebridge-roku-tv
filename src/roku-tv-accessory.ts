import { Characteristic, Logger, PlatformAccessory, Service } from "homebridge";
import { RokuClient, Keys } from "roku-client";

import { MappedApp, RokuAppMap } from "./roku-app-map";
import { RokuDevice, RokuTvPlatform } from "./roku-tv-platform";
import { homeScreenActiveId } from "./settings";
import { sanitizeAccessoryName } from "./utils";

const pollingDefault = 30000;
const HOME = {
  command: "Home",
  name: "home",
};

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class RokuAccessory {
  private readonly platform: RokuTvPlatform;
  private readonly accessory: PlatformAccessory;
  private readonly Characteristic: typeof Characteristic;
  private readonly logger: Logger;
  private readonly roku: RokuClient;
  private readonly tvService: Service;
  private readonly speakerService: Service;
  private infoService: Service;
  private rokuAppMap: RokuAppMap;

  constructor(
    platform: RokuTvPlatform,
    accessory: PlatformAccessory,
    private readonly device: RokuDevice,
    private readonly excludedApps: string[],
  ) {
    this.platform = platform;
    this.accessory = accessory;
    this.Characteristic = platform.Characteristic;
    this.logger = platform.log;

    this.roku = new RokuClient(device.client.ip);
    this.rokuAppMap = new RokuAppMap(device.apps);
    this.logger.info(`Roku Tv Ip is: ${device.client.ip}`);

    this.infoService =
      this.accessory.getService(this.platform.Service.AccessoryInformation) ||
      this.accessory.addService(this.platform.Service.AccessoryInformation);
    this.tvService =
      this.accessory.getService(this.platform.Service.Television) ||
      this.accessory.addService(this.platform.Service.Television);
    this.speakerService =
      this.accessory.getService(this.platform.Service.TelevisionSpeaker) ||
      this.accessory.addService(this.platform.Service.TelevisionSpeaker);

    this.configureInfoService();
    this.configureSpeakerService();
    this.configureTvService();
    this.startPolling(this.platform.config.pollingInterval ?? pollingDefault);

    // handle on / off events using the Active characteristic
  }

  private startPolling(pollingInterval: number) {
    setInterval(() => {
      // this.logger.info("Ran poll for power and Active App");
      this.updatePowerAndApp();
    }, pollingInterval);
  }

  private configureTvService() {
    this.tvService.displayName = "Roku Tv Service";

    // set sleep discovery characteristic
    this.tvService.setCharacteristic(
      this.Characteristic.SleepDiscoveryMode,
      this.Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE,
    );
    this.tvService.setCharacteristic(
      this.Characteristic.ConfiguredName,
      this.device.info.userDeviceName,
    );
    this.updatePowerAndApp();
    this.configureTvActiveState();
    this.configureTvActiveApp();
    this.configureAppInputs();
    this.configureRemoteSupport();
  }

  private configureRemoteSupport() {
    this.tvService
      .getCharacteristic(this.Characteristic.RemoteKey)
      .on("set", (newValue, callback) => {
        switch (newValue) {
          case this.Characteristic.RemoteKey.REWIND: {
            this.logger.info("set Remote Key Pressed: REWIND");
            this.roku.command().keypress(Keys.REVERSE).send();
            break;
          }
          case this.Characteristic.RemoteKey.FAST_FORWARD: {
            this.logger.info("set Remote Key Pressed: FAST_FORWARD");
            this.roku.command().keypress(Keys.FORWARD).send();
            break;
          }
          case this.Characteristic.RemoteKey.NEXT_TRACK: {
            this.logger.info("set Remote Key Pressed: NEXT_TRACK");
            this.roku.command().keypress(Keys.RIGHT).send();
            break;
          }
          case this.Characteristic.RemoteKey.PREVIOUS_TRACK: {
            this.logger.info("set Remote Key Pressed: PREVIOUS_TRACK");
            this.roku.command().keypress(Keys.LEFT).send();
            break;
          }
          case this.Characteristic.RemoteKey.ARROW_UP: {
            this.logger.info("set Remote Key Pressed: ARROW_UP");
            this.roku.command().keypress(Keys.UP).send();
            break;
          }
          case this.Characteristic.RemoteKey.ARROW_DOWN: {
            this.logger.info("set Remote Key Pressed: ARROW_DOWN");
            this.roku.command().keypress(Keys.DOWN).send();
            break;
          }
          case this.Characteristic.RemoteKey.ARROW_LEFT: {
            this.logger.info("set Remote Key Pressed: ARROW_LEFT");
            this.roku.command().keypress(Keys.LEFT).send();
            break;
          }
          case this.Characteristic.RemoteKey.ARROW_RIGHT: {
            this.logger.info("set Remote Key Pressed: ARROW_RIGHT");
            this.roku.command().keypress(Keys.RIGHT).send();
            break;
          }
          case this.Characteristic.RemoteKey.SELECT: {
            this.logger.info("set Remote Key Pressed: SELECT");
            this.roku.command().keypress(Keys.SELECT).send();
            break;
          }
          case this.Characteristic.RemoteKey.BACK: {
            this.logger.info("set Remote Key Pressed: BACK");
            this.roku.command().keypress(Keys.BACK).send();
            break;
          }
          case this.Characteristic.RemoteKey.EXIT: {
            this.logger.info("set Remote Key Pressed: EXIT");
            this.roku.command().keypress(Keys.HOME).send();
            break;
          }
          case this.Characteristic.RemoteKey.PLAY_PAUSE: {
            this.logger.info("set Remote Key Pressed: PLAY_PAUSE");
            this.roku.command().keypress(Keys.PLAY).send();
            break;
          }
          case this.Characteristic.RemoteKey.INFORMATION: {
            this.logger.info("set Remote Key Pressed: INFORMATION");
            this.roku.command().keypress(Keys.INFO).send();
            break;
          }
        }

        callback(null);

        // don't forget to callback!
      });
  }

  private configureAppInputs() {
    const apps = this.rokuAppMap
      .getApps()
      .filter((x) => !this.excludedApps.includes(x.name));
    apps.forEach((app) => {
      const sanitizedAppName = sanitizeAccessoryName(app.name);
      this.logger.info(
        `Adding Input ${sanitizedAppName} with info ID: ${app.id}, TYPE: ${app.type}`,
      );

      const typeChar =
        app.type === "Home"
          ? this.Characteristic.InputSourceType.HOME_SCREEN
          : this.Characteristic.InputSourceType.HDMI;

      const inputService =
        this.accessory.getService(sanitizedAppName) ||
        this.accessory.addService(
          this.platform.Service.InputSource,
          sanitizedAppName,
          app.id.toString(),
        );
      inputService
        .setCharacteristic(this.Characteristic.Identifier, app.id)
        .setCharacteristic(this.Characteristic.ConfiguredName, sanitizedAppName)
        .setCharacteristic(
          this.Characteristic.IsConfigured,
          this.Characteristic.IsConfigured.CONFIGURED,
        )
        .setCharacteristic(this.Characteristic.InputSourceType, typeChar);

      this.tvService.addLinkedService(inputService);
    });
  }

  private configureTvActiveApp() {
    this.tvService
      .getCharacteristic(this.Characteristic.ActiveIdentifier)
      .on("set", async (identifier, callback) => {
        // the value will be the value you set for the Identifier Characteristic
        // on the Input Source service that was selected - see input sources below.

        const app: MappedApp = this.rokuAppMap.getAppFromId(
          identifier as number,
        );

        this.logger.info(`set Active Input Source => ${app.name}`);
        if (app.rokuAppId === homeScreenActiveId) {
          await this.roku.command().keypress(HOME).send();
        } else {
          try {
            await this.roku.launch(app.rokuAppId);
          } catch (e) {
            this.logger.error("Failed to launch app", e);
            this.updatePowerAndApp();
          }
        }
        callback(null);
      })
      .on("get", async (callback) => {
        const rokuApp = await this.roku.active();

        if (rokuApp == null) {
          callback(null, homeScreenActiveId);
          return;
        }

        const app = this.rokuAppMap.getAppFromRokuId(rokuApp.id);

        if (app) {
          this.logger.info(`Get Active Input Source: ${app.name}`);
          callback(null, app.id);
        } else {
          callback(null, homeScreenActiveId);
        }
      });
  }

  private configureTvActiveState() {
    this.tvService
      .getCharacteristic(this.Characteristic.Active)
      .on("set", async (onOrOff, callback) => {
        this.logger.info("set Active => setNewValue: " + onOrOff);
        await this.roku
          .command()
          .keypress({
            command: onOrOff ? "poweron" : "poweroff",
            name: "power",
          })
          .send();
        const info = await this.roku.info();
        const isOn = info["powerMode"] === "PowerOn";
        this.tvService.updateCharacteristic(
          this.Characteristic.Active,
          isOn
            ? this.Characteristic.Active.ACTIVE
            : this.Characteristic.Active.INACTIVE,
        );

        this.updatePowerAndApp();

        callback(null);
      })
      .on("get", async (callback) => {
        const info = await this.roku.info();
        const isOn = info["powerMode"] === "PowerOn";
        this.logger.info(`Getting Power State: ${info["powerMode"]}`);
        callback(
          null,
          isOn
            ? this.Characteristic.Active.ACTIVE
            : this.Characteristic.Active.INACTIVE,
        );
      });
  }

  private configureSpeakerService() {
    this.speakerService
      .setCharacteristic(
        this.Characteristic.Active,
        this.Characteristic.Active.ACTIVE,
      )
      .setCharacteristic(
        this.Characteristic.VolumeControlType,
        this.Characteristic.VolumeControlType.RELATIVE,
      );

    // handle volume control
    this.speakerService
      .getCharacteristic(this.Characteristic.VolumeSelector)
      .on("set", (incOrDec, callback) => {
        if (incOrDec === this.Characteristic.VolumeSelector.INCREMENT) {
          this.logger.info("Incrementing the Volume");
          this.roku.command().volumeUp().send();
        } else {
          this.logger.info("Decrementing the volume");
          this.roku.command().volumeDown().send();
        }
        callback(null);
      });
    this.speakerService
      .getCharacteristic(this.Characteristic.Mute)
      .on("set", (_incOrDec, callback) => {
        this.logger.info("Toggling Mute");
        this.roku.command().volumeMute().send();

        callback(null);
      });
  }

  private configureInfoService() {
    const sanitizedName = sanitizeAccessoryName(
      this.device.info.userDeviceName,
    );
    this.infoService
      .setCharacteristic(
        this.Characteristic.Manufacturer,
        this.device.info.vendorName,
      )
      .setCharacteristic(this.Characteristic.Model, this.device.info.modelName)
      .setCharacteristic(this.Characteristic.Name, sanitizedName)
      .setCharacteristic(
        this.Characteristic.SerialNumber,
        this.device.info.serialNumber,
      );
  }

  private updatePowerAndApp() {
    this.roku.info().then((info) => {
      const powerMode = info["powerMode"];
      const isOn = powerMode === "PowerOn";

      this.logger.debug(`Power Mode is: ${powerMode}`);
      this.logger.debug(`Is On: ${isOn}`);

      this.tvService.updateCharacteristic(
        this.Characteristic.Active,
        powerMode === "Unknown" || powerMode === null
          ? this.Characteristic.Active.INACTIVE
          : this.Characteristic.Active.ACTIVE,
      );

      // Ensure the accessory remains accessible when the TV is off
      if (!isOn) {
        this.tvService.updateCharacteristic(
          this.Characteristic.ActiveIdentifier,
          homeScreenActiveId,
        );
      }
    });

    this.roku.active().then((app) => {
      const rokuId = app ? app.id : homeScreenActiveId;
      const mappedApp = this.rokuAppMap.getAppFromRokuId(rokuId);

      if (!mappedApp) {
        return;
      }

      this.logger.debug(
        `Active App is: ${mappedApp.name} ${mappedApp.id} ${mappedApp.rokuAppId}`,
      );

      this.tvService
        .getCharacteristic(this.Characteristic.ActiveIdentifier)
        .updateValue(mappedApp.id);

      this.tvService.updateCharacteristic(
        this.Characteristic.ActiveIdentifier,
        mappedApp.id,
      );
    });
  }
}
