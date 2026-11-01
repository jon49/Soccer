export const API_PORT = 4010;
export const APP_PORT = 8010;
export const DEPOT = new URL("./.depot/", import.meta.url).pathname;

// e2e/phone: the dev server the phone reaches through `adb reverse`, and the
// local port forwarded to the phone's Chrome remote debugging.
export const PHONE_APP_PORT = 8012;
export const PHONE_DEVTOOLS_PORT = 9223;
