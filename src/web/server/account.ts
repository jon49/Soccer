// Deleting the coach's account. TrailBase's `DELETE /api/auth/v1/delete`
// removes the account and its sessions, and ImageBase's triggers remove the
// data it synced (see ../ImageBase README, "Deleting an account"). Teams
// shared with other coaches stay with them.
import { clear } from "idb-keyval";
import { authFetch } from "./api-client.js";
import * as globalDb from "./global-model.js";

const {
  syncQueue: { afterSync },
} = self.sw;

const DELETE_URL = "/api/auth/v1/delete";

// clearDevice deletes everything this device holds, keeping only the theme.
async function clearDevice() {
  let { theme } = await globalDb.settings();
  await clear();
  if (theme) await globalDb.setTheme(theme);
}

// deleteLocalData deletes everything on this device, logging it out, but
// leaves the account and what it synced on the server. Like deleteAccount,
// it waits for a sync in flight so that sync can't write data back.
export function deleteLocalData(): Promise<void> {
  return afterSync(clearDevice);
}

// deleteAccount deletes the account on the server and then everything this
// device holds, keeping only the theme. It waits for a sync in flight, from
// any page, so that sync can't write data back afterwards. Returns the
// server's status (0 when offline).
export function deleteAccount(): Promise<number> {
  return afterSync(async () => {
    let res = await authFetch(DELETE_URL, { method: "DELETE" });
    if (!res.ok) return res.status;
    await clearDevice();
    return res.status;
  });
}
