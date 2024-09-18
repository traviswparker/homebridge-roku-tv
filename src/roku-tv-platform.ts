import fs from "fs";
import path from "path";
import {
  API,
  Categories,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  Service,
} from "homebridge";
import { RokuClient } from "roku-client";

import { RokuAccessory } from "./roku-tv-accessory";
import { homeScreenActiveId, PLUGIN_NAME } from "./settings";

interface RokuTvPlatformConfig {
  name?: string;
  excludedDevices?: string[];
  excludedApps?: string[];
  pollingInterval?: number;
  devices?: { name: string; ip: string }[];
  autoDiscover?: boolean;
}

export class RokuTvPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly accessories: PlatformAccessory[] = [];
  public readonly accessoriesToPublish: PlatformAccessory[] = [];

  private devicesFilePath: string;

  constructor(
    public readonly log: Logging,
    public readonly config: RokuTvPlatformConfig,
    public readonly api: API
  ) {
    this.log.debug("Finished initializing platform:", this.config.name);
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    console.log(this.api.user.storagePath());

    this.devicesFilePath = path.join(
      this.api.user.storagePath(),
      "roku-devices.json"
    );

    this.loadPersistedDevices();

    this.api.on("didFinishLaunching", async () => {
      this.log.debug("Executed didFinishLaunching callback");
      try {
        await this.discoverDevices();
      } catch (e) {
        this.log.error("Error during device discovery:", e);
      }
    });
  }

  loadPersistedDevices() {
    if (fs.existsSync(this.devicesFilePath)) {
      const data = fs.readFileSync(this.devicesFilePath, "utf-8");
      const persistedDevices: string[] = JSON.parse(data);
      this.log.info("Loaded persisted devices from roku-devices.json");
      // Merge persisted devices into config.devices if not already present
      this.config.devices = this.config.devices || [];
      persistedDevices.forEach((ip) => {
        if (!this.config.devices?.find((device) => device.ip === ip)) {
          this.config.devices?.push({ name: `Roku ${ip}`, ip });
        }
      });
      // Remove duplicates
      this.config.devices = Array.from(
        new Set(this.config.devices.map((device) => JSON.stringify(device)))
      ).map((json) => JSON.parse(json) as { name: string; ip: string });
    }
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info("Loading accessory from cache:", accessory.displayName);

    this.accessories.push(accessory);
  }

  async discoverDevices() {
    const discoveredIPs = new Set<string>();

    if (this.config.autoDiscover) {
      this.log.info("Starting auto-discovery of Roku devices...");
      try {
        const devices = await RokuClient.discoverAll();
        devices.forEach((d) => {
          if (
            !this.config.excludedDevices?.includes(d.ip) &&
            !this.config.devices?.find((device) => device.ip === d.ip)
          ) {
            this.config.devices?.push({ name: `Roku ${d.ip}`, ip: d.ip });
            discoveredIPs.add(d.ip);
          }
        });
        this.log.info(`Auto-discovered ${discoveredIPs.size} new devices.`);
      } catch (e) {
        this.log.error("Error during auto-discovery:", e);
      }
    }

    // Use a Set to ensure unique IPs
    const uniqueDeviceIPs = new Set(
      this.config.devices?.map((device) => device.ip) || []
    );

    const promises = Array.from(uniqueDeviceIPs).map(async (addr) => {
      const d = new RokuClient(addr);
      const apps = await d.apps();
      const info = await d.info();
      apps.push({
        name: "Home",
        type: "Home",
        id: homeScreenActiveId,
        version: "1",
      });

      return {
        client: d,
        apps,
        info,
      };
    });

    const deviceInfos = await Promise.all(promises);

    this.log.info(`Discovered ${deviceInfos.length} unique devices`);

    for (const deviceInfo of deviceInfos) {
      const uuid = this.api.hap.uuid.generate(
        `${deviceInfo.client.ip}-${deviceInfo.info.serialNumber}`
      );
      this.log.debug(
        `Generated UUID for device ${deviceInfo.info.userDeviceName}: ${uuid}`
      );
      this.withRokuAccessory(uuid, deviceInfo);
      this.log.info(`Added device ${deviceInfo.info.userDeviceName}`);
    }

    this.api.publishExternalAccessories(PLUGIN_NAME, this.accessoriesToPublish);
    this.persistDevices();
  }

  persistDevices() {
    const devicesToPersist =
      this.config.devices?.map((device) => device.ip) || [];
    fs.writeFileSync(
      this.devicesFilePath,
      JSON.stringify(devicesToPersist, null, 2)
    );
    this.log.info("Persisted discovered devices to roku-devices.json");
  }

  withRokuAccessory(uuid: string, deviceInfo: RokuDevice) {
    const existingAccessory = this.accessories.find(
      (accessory) => accessory.UUID === uuid
    );

    if (existingAccessory) {
      this.log.info(
        "Restoring existing accessory from cache:",
        existingAccessory.displayName
      );

      new RokuAccessory(
        this,
        existingAccessory,
        deviceInfo,
        this.config.excludedApps ?? []
      );
    } else {
      const deviceName =
        this.config.devices?.find(
          (device) => device.ip === deviceInfo.client.ip
        )?.name || deviceInfo.info.userDeviceName;

      const accessory = new this.api.platformAccessory(
        deviceName,
        uuid,
        Categories.TELEVISION
      );
      new RokuAccessory(
        this,
        accessory,
        deviceInfo,
        this.config.excludedApps ?? []
      );
      this.accessoriesToPublish.push(accessory);
    }
  }

  async addDevice(device: { name: string; ip: string }) {
    if (this.config.devices?.find((d) => d.ip === device.ip)) {
      this.log.warn(`Device with IP ${device.ip} already exists.`);
      return;
    }
    this.config.devices?.push(device);
    this.persistDevices();
    await this.discoverDevices();
  }

  async removeDevice(ip: string) {
    this.config.devices = this.config.devices?.filter((d) => d.ip !== ip);
    this.persistDevices();
    this.log.info(`Removed device with IP ${ip} from configuration.`);
    // Optionally, unregister the accessory
    const uuid = this.api.hap.uuid.generate(ip);
    const accessory = this.accessories.find((a) => a.UUID === uuid);
    if (accessory) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLUGIN_NAME, [
        accessory,
      ]);
      this.log.info(`Unregistered accessory: ${accessory.displayName}`);
      this.accessories.splice(this.accessories.indexOf(accessory), 1);
    }
  }
}

export interface RokuDevice {
  client: RokuClient;
  apps: RokuApp[];
  info: Record<string, string>;
}

interface RokuApp {
  id: string;
  name: string;
  type: string;
  version: string;
}
