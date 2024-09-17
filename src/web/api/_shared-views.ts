import html from "html-template-tag-stream"
import { when } from "@jon49/sw/utils.js"
import type { Theme } from "../server/db.js"

const defaultTheme = "⛅",
    lightTheme = "&#127774;",
    darkTheme = "&#127762;"

export function themeView(theme: Theme | undefined) {
    let image = theme === "light"
        ? lightTheme
    : theme === "dark"
        ? darkTheme
    : defaultTheme
    return html`<button class="bg">$${image}</button>`
}


export function syncCountView(count: number) {
    return html`&#128259; ${when(count, count => html`(${count})`)}`
}


