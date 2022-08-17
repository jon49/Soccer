interface Value<T> {
    value: T
}
interface String_ extends Value<string> {
}
export interface String100 extends String_ {}
export interface String50 extends String_ {}
export interface PositiveWholeNumber extends Value<number> {}
export interface IdNumber extends Value<number> {}
export type TableType = string
export interface IDType<T extends TableType> extends Value<number> { 
    _id: T
}

// class PositiveWholeNumber_ {
//     readonly value: number
//     constructor (value: number) {
//         this.value = value
//     }
// }

// class IdNumber_ {
//     readonly value: number
//     constructor (value: number) {
//         this.value = value
//     }
// }

const notFalsey = async (error: string, val: string | undefined) =>
    !val ? Promise.reject([error]) : val

const maxLength = async (error: string, val: string, maxLength: number) =>
    (val.length > maxLength)
        ? Promise.reject([error])
    : val

const createString = async (name: string, maxLength_: number, val?: string | undefined) => {
    const trimmed = await notFalsey(`"${name}" is required.`, val?.trim())
    const s = await maxLength(`'${name}' must be less than ${maxLength_} characters.`, trimmed, maxLength_)
    return s
}

// const isInteger = (val: number) => val === (val|0)

// export const createPositiveWholeNumber = (name: string, val: number) : Promise<PositiveWholeNumber>  => {
//     if (val < 0) return Promise.reject([`'${name}' must be 0 or greater. But was given '${val}'.`])
//     if (!isInteger(val)) return Promise.reject([`${name} must be a whole number. But was given '${val}' and was expecting '${val|0}'.`])
//     return Promise.resolve(new PositiveWholeNumber_(val))
// }

// export const createIdNumber = (name: string, val: number) : Promise<IdNumber> => {
//     if (!isInteger(val)) return Promise.reject([`${name} must be a whole number. But was given '${val}' and was expecting '${val|0}'.`])
//     if (val < 1) return Promise.reject([`'${name}' must be 1 or greater. But was given '${val}'.`])
//     return Promise.resolve(new IdNumber_(val))
// }

export const createString25 =
    (name: string) =>
    (val: string | undefined) =>
        createString(name, 25, val)

export const createString50 =
    (name: string) =>
    (val: string | undefined) =>
        createString(name, 50, val)

export function createCheckbox(val: string | undefined) {
    return Promise.resolve(val === "on")
}

type Nullable<T> = T | undefined | null
export async function required<T>(o: Nullable<T>, message: string): Promise<T> {
    if (!o) return Promise.reject(message)
    return o
}

export function optional<T>(validator: (val: T | undefined) => Promise<T>) {
    return async (val: T | undefined) => {
        if (val) {
            return validator(val)
        }
        return void 0
    }
}

class Assert {
    isFalse(value: boolean, message: string) {
        return !value ? void 0 : Promise.reject({message})
    }
    // isNil(value: any, message: string) {
    //     return value === null || value === undefined ? void 0 : Promise.reject({message})
    // }
    // isNotNil<T>(value: T, message: string) {
    //     return value !== null && value !== void 0 ? void 0 : Promise.reject({message})
    // }
}
export const assert = new Assert()

export async function requiredAsync<T>(oTask: Promise<Nullable<T>>, message?: string) {
    let [result] = await validate([required(await oTask, message ?? "Oops! Something happened which shouldn't have! (requiredAsync)")])
    return result
}

export async function validate<T extends readonly unknown[] | readonly [unknown]>(promises: T):
    Promise<{ -readonly [P in keyof T]: T[P] extends PromiseLike<infer U> ? U : T[P] }> {
    // @ts-ignore
    const result = await Promise.allSettled(<any[]><unknown>promises)
    const failed: string[] = []
    for (const item of result) {
        if (item.status === "rejected") failed.push(item.reason)
    }
    if (failed.length > 0) return Promise.reject({message: failed})
    return <any>result.map(x => {
        if (x.status === "fulfilled") {
            return x.value
        }
        throw new Error("All items should already be resolved")
    })
}

type Unwrap<T> =
	T extends Promise<infer U> ? U :
	T extends (...args: any) => Promise<infer U> ? U :
	T extends (...args: any) => infer U ? U :
	T

export async function validateObject<T extends any, S extends { [Key in keyof T]: (value: T[Key] | undefined) => Promise<any> }>(original: T, validator: S) {
    let validatorKeys = Object.keys(validator)
    let validations = new Array(validatorKeys.length)
    let i = 0
    for (let validatorKey of validatorKeys) {
        // @ts-ignore
        validations[i++] = validator[validatorKey](original[validatorKey])
    }
    let xs = await validate(validations)
    i = 0
    let o = <any>{}
    for (let validatorKey of validatorKeys) {
        o[validatorKey] = xs[i++]
    }
    return <{ [Key in keyof S]: Unwrap<S[Key]> }>o
}
