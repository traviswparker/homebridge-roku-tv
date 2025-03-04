import {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  Service,
  PlatformConfig,
  Categories,
} from "homebridge";
import { RokuClient } from "roku-client";
import { RokuAccessory } from "./roku-tv-accessory";
import { PLUGIN_NAME } from "./settings";

interface RokuTvPlatformConfig extends PlatformConfig {
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

  /**
   * Constructor for the RokuTvPlatform class.
   * Initializes the platform with the provided logging, configuration, and API.
   * Sets up event listeners and loads cached accessories.
   */
  constructor(
    public readonly log: Logging,
    public readonly config: RokuTvPlatformConfig,
    public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;

    // Load cached accessories immediately
    this.accessories.forEach((accessory) => {
      this.configureAccessory(accessory);
    });

    this.api.on("didFinishLaunching", () => {
      this.log.debug("Executed didFinishLaunching callback");
      this.discoverDevicesInBackground();
    });
  }

  /**
   * Configures a cached accessory.
   * Logs the loading of the accessory and adds it to the accessories array.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info("Loading accessory from cache:", accessory.displayName);
    accessory.category = Categories.TELEVISION;
    this.accessories.push(accessory);
  }

  /**
   * Discovers devices in the background.
   * Performs discovery and processes the discovered devices.
   * Logs any errors that occur during the discovery process.
   */
  private async discoverDevicesInBackground() {
    try {
      const discoveredDevices = await this.performDiscovery();
      this.processDiscoveredDevices(discoveredDevices);
    } catch (error) {
      this.log.error("Error during background device discovery:", error);
    }
  }

  /**
   * Performs the discovery of Roku devices.
   * Discovers devices through auto-discovery and from the configuration.
   * Returns an array of discovered RokuDevice objects.
   */
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
        .join(", ")}`,
    );

    const devicePromises = Array.from(discoveredIPs).map(async (ip) => {
      if (typeof ip !== "string") {
        this.log.error(`Invalid IP address: ${JSON.stringify(ip)}`);
        return null;
      }
      try {
        const client = new RokuClient(ip);
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

  /**
   * Processes the discovered devices.
   * Adds new accessories, updates existing ones, removes stale accessories,
   * and persists the device information.
   */
  private processDiscoveredDevices(devices: RokuDevice[]) {
    devices.forEach((device) => {
      const uuid = this.api.hap.uuid.generate(
        `${device.client.ip}-${device.info.serialNumber}`,
      );

      if (!this.accessories.find((accessory) => accessory.UUID === uuid)) {
        this.log.info(`Discovered new device: ${device.info.userDeviceName}`);
        this.addAccessory(device, uuid);
      } else {
        this.log.debug(`Device already exists: ${device.info.userDeviceName}`);
        this.updateAccessory(device, uuid);
      }
    });
    this.api.publishExternalAccessories(PLUGIN_NAME, this.accessories);
  }

  /**
   * Adds a new accessory for a discovered device.
   * Creates a new PlatformAccessory, configures it with RokuAccessory,
   * and registers it with the platform.
   */
  private addAccessory(device: RokuDevice, uuid: string) {
    const accessory = new this.api.platformAccessory(
      device.info.userDeviceName,
      uuid,
    );
    accessory.category = Categories.TELEVISION;
    new RokuAccessory(this, accessory, device, this.config.excludedApps ?? []);
    this.accessories.push(accessory);
  }

  /**
   * Updates an existing accessory for a discovered device.
   * Finds the existing accessory and reconfigures it with the updated device information.
   */
  private updateAccessory(device: RokuDevice, uuid: string) {
    const existingAccessory = this.accessories.find(
      (accessory) => accessory.UUID === uuid,
    );
    if (existingAccessory) {
      new RokuAccessory(
        this,
        existingAccessory,
        device,
        this.config.excludedApps ?? [],
      );
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
