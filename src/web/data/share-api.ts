// Sharing a team with other coaches: the calls to the server. A shared team
// is an ImageBase "space" (see ../ImageBase): a set of users who all sync the
// same rows as equals. The team's id *is* the space id, so its keys never
// collide with anyone's personal teams. The local side of sharing is in
// repo-share.ts.
import { authFetch } from "../app/worker.js";
import { OFFLINE_STATUS } from "./api-client.js";

const APP = "soccer";

export type ApiResult<T> = { ok: true; json: T } | { ok: false; status: number; message: string };

async function api<T>(method: "GET" | "POST" | "DELETE", path: string): Promise<ApiResult<T>> {
  let res = await authFetch(path, { method, headers: { "Content-Type": "application/json" } });
  if (res.ok) return { ok: true, json: await res.json() };
  let message =
    res.status === OFFLINE_STATUS
      ? "You appear to be offline. Connect to the internet and try again."
      : res.status === 401
        ? "You need to log in first."
        : res.status === 404
          ? "Not found."
          : `Something went wrong (status ${res.status}).`;
  return { ok: false, status: res.status, message };
}

export interface SpaceMember {
  user: string;
  email: string;
  joined: number;
  me: boolean;
}

export interface Invite {
  code: string;
  expires: number;
}

export interface InvitePreview {
  space: string;
  invitedBy: string;
  expires: number;
  member: boolean;
}

const spaces = `/api/spaces/${APP}`;
const invites = `/api/invites/${APP}`;
const seg = encodeURIComponent;

export const spaceCreate = () => api<{ space: string }>("POST", spaces);

export const spaceMembers = (space: string) =>
  api<{ members: SpaceMember[] }>("GET", `${spaces}/${seg(space)}/members`);

// `user` is a member's `user` or "me" to leave. Removing the last member
// deletes the space and all its data.
export const spaceMemberRemove = (space: string, user: string) =>
  api<{}>("DELETE", `${spaces}/${seg(space)}/members/${seg(user)}`);

export const spaceInviteCreate = (space: string) =>
  api<Invite>("POST", `${spaces}/${seg(space)}/invites`);

export const invitePreview = (code: string) => api<InvitePreview>("GET", `${invites}/${seg(code)}`);

export const inviteAccept = (code: string) =>
  api<{ space: string }>("POST", `${invites}/${seg(code)}/accept`);

export function inviteUrl(code: string): string {
  return `${self.location.origin}/web/join/?code=${seg(code)}`;
}
