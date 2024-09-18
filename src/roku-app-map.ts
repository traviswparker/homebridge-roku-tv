import type { RokuApp } from "roku-client";
import { sanitizeAccessoryName } from "./utils";

export interface MappedApp {
  id: number;
  rokuAppId: string;
  name: string;
  type: string;
  version: string;
}

function hashCode(s: string) {
  return s.split("").reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);
}

export function createMappedApps(apps: RokuApp[]): MappedApp[] {
  return apps.map((a) => ({ ...a, rokuAppId: a.id, id: hashCode(a.id) }));
}

export function asMappedApp(app: RokuApp): MappedApp {
  return createMappedApps([app])[0];
}

export class RokuAppMap {
  private readonly apps: MappedApp[];

  constructor(apps: RokuApp[]) {
    this.apps = apps.map((app, index) => ({
      id: index + 1,
      rokuAppId: app.id,
      name: sanitizeAccessoryName(app.name),
      type: app.type,
      version: app.version,
    }));
  }

  getAppFromRokuId(identifier: string): MappedApp {
    return this.apps.find((x) => x.rokuAppId === identifier) as MappedApp;
  }
  getAppFromId(identifier: number): MappedApp {
    return this.apps.find((x) => x.id === identifier) as MappedApp;
  }

  getApps(): MappedApp[] {
    return this.apps;
  }
}
