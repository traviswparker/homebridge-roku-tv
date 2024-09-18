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
import { PLUGIN_NAME } from "./settings";

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

  public accessories: PlatformAccessory[] = [];
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

    this.devicesFilePath = path.join(
      this.api.user.storagePath(),
      "roku-devices.json"
    );

    this.loadPersistedDevices();

    // Load cached accessories immediately
    this.accessories.forEach((accessory) => {
      this.configureAccessory(accessory);
    });

    this.api.on("didFinishLaunching", () => {
      this.log.debug("Executed didFinishLaunching callback");
      this.discoverDevicesInBackground();
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

  private async discoverDevicesInBackground() {
    try {
      const discoveredDevices = await this.performDiscovery();
      this.processDiscoveredDevices(discoveredDevices);
    } catch (error) {
      this.log.error("Error during background device discovery:", error);
    }
  }

  private async performDiscovery(): Promise<RokuDevice[]> {
    const discoveredIPs = new Set<string>();

    if (this.config.autoDiscover) {
      const devices = await RokuClient.discoverAll();
      devices.forEach((d) => {
        if (
          !this.config.excludedDevices?.includes(d.ip) &&
          !this.config.devices?.find((device) => device.ip === d.ip)
        ) {
          discoveredIPs.add(d.ip);
        }
      });
    }

    // Include devices from config
    this.config.devices?.forEach((device) => {
      if (typeof device.ip === "string") {
        discoveredIPs.add(device.ip);
      } else {
        this.log.warn(`Invalid IP in config: ${JSON.stringify(device)}`);
      }
    });

    this.log.debug(
      `Discovered IPs: ${Array.from(discoveredIPs)
        .map((ip) => JSON.stringify(ip))
        .join(", ")}`
    );

    const devicePromises = Array.from(discoveredIPs).map(async (ip) => {
      if (typeof ip !== "string") {
        this.log.error(`Invalid IP address: ${JSON.stringify(ip)}`);
        return null;
      }
      try {
        // Remove 'http://' and ':8060' if present
        const cleanIp = ip.replace(/^http:\/\//, "").replace(/:8060$/, "");
        const client = new RokuClient(cleanIp);
        const apps = await client.apps();
        const info = await client.info();
        return { client, apps, info };
      } catch (error) {
        this.log.error(`Error processing device ${ip}:`, error);
        return null;
      }
    });

    const devices = await Promise.all(devicePromises);
    return devices.filter((device): device is RokuDevice => device !== null);
  }

  private processDiscoveredDevices(devices: RokuDevice[]) {
    devices.forEach((device) => {
      const uuid = this.api.hap.uuid.generate(
        `${device.client.ip}-${device.info.serialNumber}`
      );

      if (!this.accessories.find((accessory) => accessory.UUID === uuid)) {
        this.log.info(`Discovered new device: ${device.info.userDeviceName}`);
        this.addAccessory(device, uuid);
      } else {
        this.log.debug(`Device already exists: ${device.info.userDeviceName}`);
        this.updateAccessory(device, uuid);
      }
    });

    this.removeStaleAccessories(devices);

    // Convert RokuDevice[] to the format expected by persistDevices
    const devicesToPersist = devices.map((device) => ({
      name: device.info.userDeviceName,
      ip: device.client.ip,
    }));

    this.persistDevices(devicesToPersist);
  }

  private addAccessory(device: RokuDevice, uuid: string) {
    const accessory = new this.api.platformAccessory(
      device.info.userDeviceName,
      uuid
    );
    new RokuAccessory(this, accessory, device, this.config.excludedApps ?? []);
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLUGIN_NAME, [accessory]);
    this.accessories.push(accessory);
  }

  private updateAccessory(device: RokuDevice, uuid: string) {
    const existingAccessory = this.accessories.find(
      (accessory) => accessory.UUID === uuid
    );
    if (existingAccessory) {
      new RokuAccessory(
        this,
        existingAccessory,
        device,
        this.config.excludedApps ?? []
      );
    }
  }

  private removeStaleAccessories(currentDevices: RokuDevice[]) {
    const staleAccessories = this.accessories.filter(
      (accessory) =>
        !currentDevices.some(
          (device) =>
            this.api.hap.uuid.generate(
              `${device.client.ip}-${device.info.serialNumber}`
            ) === accessory.UUID
        )
    );

    if (staleAccessories.length > 0) {
      this.log.info("Removing stale accessories");
      this.api.unregisterPlatformAccessories(
        PLUGIN_NAME,
        PLUGIN_NAME,
        staleAccessories
      );
      this.accessories = this.accessories.filter(
        (accessory) => !staleAccessories.includes(accessory)
      );
    }
  }

  private persistDevices(devices?: { name: string; ip: string }[]) {
    const devicesToPersist = devices || this.config.devices || [];
    fs.writeFileSync(
      this.devicesFilePath,
      JSON.stringify(devicesToPersist, null, 2)
    );
    this.log.info("Persisted devices to roku-devices.json");
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
    this.config.devices = this.config.devices || [];
    this.config.devices.push(device);
    this.persistDevices(this.config.devices);

    // Discover and add the new device
    const client = new RokuClient(device.ip);
    try {
      const apps = await client.apps();
      const info = await client.info();
      const newDevice = { client, apps, info };
      const uuid = this.api.hap.uuid.generate(
        `${device.ip}-${info.serialNumber}`
      );
      this.addAccessory(newDevice, uuid);
    } catch (error) {
      this.log.error(`Failed to add device ${device.ip}:`, error);
    }
  }

  async removeDevice(ip: string) {
    this.config.devices = this.config.devices?.filter((d) => d.ip !== ip);
    this.persistDevices(this.config.devices);
    this.log.info(`Removed device with IP ${ip} from configuration.`);

    // Unregister the accessory
    const uuid = this.api.hap.uuid.generate(ip);
    const accessory = this.accessories.find((a) => a.UUID === uuid);
    if (accessory) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLUGIN_NAME, [
        accessory,
      ]);
      this.log.info(`Unregistered accessory: ${accessory.displayName}`);
      this.accessories = this.accessories.filter((a) => a !== accessory);
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
