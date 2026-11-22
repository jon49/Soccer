import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { installDevice } from "./install-device.js";

const ua = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.119 Mobile/15E148 Safari/604.1",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edg/138.0.0.0",
  linuxChrome:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  macFirefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:140.0) Gecko/20100101 Firefox/140.0",
};

describe("installDevice", () => {
  it("tells Safari on an iPhone from other iPhone browsers", () => {
    assert.equal(installDevice(ua.iphoneSafari), "ios-safari");
    assert.equal(installDevice(ua.iphoneChrome), "ios-other");
  });

  it("takes a Mac with a touch screen to be an iPad", () => {
    assert.equal(installDevice(ua.macSafari, 5), "ios-safari");
    assert.equal(installDevice(ua.macSafari, 0), "mac-safari");
  });

  it("knows Android's browsers", () => {
    assert.equal(installDevice(ua.androidChrome), "android-chrome");
    assert.equal(installDevice(ua.androidSamsung), "android-samsung");
    assert.equal(installDevice(ua.androidFirefox), "android-firefox");
  });

  it("knows computer browsers", () => {
    assert.equal(installDevice(ua.windowsEdge), "desktop-chrome");
    assert.equal(installDevice(ua.linuxChrome), "desktop-chrome");
    assert.equal(installDevice(ua.macFirefox), "desktop-firefox");
  });

  it("leaves anything else to the coach", () => {
    assert.equal(installDevice("curl/8.0"), undefined);
  });
});
