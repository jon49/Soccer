import { Updated } from "./db.js"
import db from "./global-model.js"
import { required } from "./validation.js"

const dataUrlPathname = "/api/collections/data/records",
    usersUrlPathname = "/api/collections/users"

export default {
    async getLatestData(lastUpdated: string, page: number = 1, previousData: ResponseData | null = null) : Promise<ResponseData> {
        let user = await required(await getUser(), "User is not logged in.")
        let url = new URL(dataUrlPathname, self.location.origin)
        addSearchParams(url, {
            filter: `(updated > '${lastUpdated}')`,
            fields: "id,updated,value",
            skipTotal: "true",
            page: ""+page,
            perPage: "500" })
        let response = await fetch(url, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${user?.token}`,
                "Accept": "application/json"
            }
        })

        let data = await response.json()

        if (response.status == 200 && response.headers.get("Content-Type")?.includes("application/json")) {
            if (data.items.length == 500) {
                return this.getLatestData(lastUpdated, page + 1, {
                    items: previousData?.items.concat(data.items) ?? data.items,
                    page: page + 1,
                    perPage: 500
                })
            }
            return data
        }

        return Promise.reject(data)
    },

    async upsertData(data: PostData) {
        let user = await required(await getUser(), "User is not logged in.")
        let url = new URL(dataUrlPathname, self.location.origin)
        addSearchParams(url, {
            fields: "id,updated,value",
            skipTotal: "true" })
        let response = await fetch(url, {
            method: data.updated ? "PATCH" : "POST",
            body: JSON.stringify(data),
            headers: {
                "Authorization": `Bearer ${user.token}`,
                "Content-Type": "application/json"
            }
        })

        let responseData : UpdatedDataResponse = await response.json()

        if (response.status == 200 && response.headers.get("Content-Type")?.includes("application/json")) {
            let updated = {
                ...responseData,
                value: { ...responseData.value, updated: responseData.updated }
            }
            return updated
        }

        return Promise.reject(responseData)
    },

    async signIn(identity: string, password: string)
        : Promise<{ token: string, record: { verified: boolean, id: string } }> {
        let url = new URL(`${usersUrlPathname}/auth-with-password`, self.location.origin)
        addSearchParams(url, { fields: "token,record.verified,record.id" })

        let response = await fetch(url, {
            method: "POST",
            body: JSON.stringify({ identity, password }),
            headers: { "Content-Type": "application/json" }
        })

        return getData(response)
    },

    async register(email: string, password: string, passwordConfirm: string)
        : Promise<{ id: string }> {
        let url = new URL(`${usersUrlPathname}/records`, self.location.origin)
        addSearchParams(url, { fields: "id" })

        let response = await fetch(url, {
            method: "POST",
            body: JSON.stringify({ email, password, passwordConfirm }),
            headers: { "Content-Type": "application/json" }
        })

        return getData(response)
    }
}

async function getData(response: Response) {
    let data : any
    if (response.headers.get("Content-Type")?.includes("application/json")) {
        data = await response.json()
    } else {
        data = await response.text()
        return Promise.reject(data)
    }

    if (data && response.status == 200) {
        return data
    }

    return Promise.reject(data)
}

function addSearchParams(url: URL, search: Record<string, string>) {
    for (let [key, value] of Object.entries(search)) {
        url.searchParams.set(key, value)
    }
}

function getUser() {
    return db.credentials()
}

export interface ResponseData {
    items: {
        id: string
        updated: string
        value: any } []
    page: number,
    perPage: number
}

export interface UpdatedDataResponse {
    id: string,
    updated: string,
    value: any
}

interface PostData {
    id: string
    value: Updated
    updated?: string
    userId: string
}

