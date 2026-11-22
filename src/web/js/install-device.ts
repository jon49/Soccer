// Which of the Install page's how-tos fits this browser, from its user agent.
// iPadOS Safari says it is a Mac, so a "Mac" with a touch screen is an iPad.

export type InstallDevice =
  | "ios-safari"
  | "ios-other"
  | "android-chrome"
  | "android-samsung"
  | "android-firefox"
  | "desktop-chrome"
  | "mac-safari"
  | "desktop-firefox";

export function installDevice(ua: string, maxTouchPoints = 0): InstallDevice | undefined {
  let ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? "ios-other" : "ios-safari";
  if (/Android/.test(ua)) {
    if (/SamsungBrowser/.test(ua)) return "android-samsung";
    if (/Firefox/.test(ua)) return "android-firefox";
    return "android-chrome";
  }
  if (/Firefox/.test(ua)) return "desktop-firefox";
  if (/Chrome|Chromium|Edg\//.test(ua)) return "desktop-chrome";
  if (/Macintosh/.test(ua) && /Safari/.test(ua)) return "mac-safari";
  return;
}
