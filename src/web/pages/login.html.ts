import { validateObject } from "promise-validation"
import { PostHandlers, Route } from "../server/route.js"
import { createString50 } from "../server/validation.js"
import api from "../server/api.js"
import db from "../server/global-model.js"
import layout from "./_layout.html.js"
import html from "html-template-tag-stream"
import { searchParams } from "../server/utils.js"

let location = "/web"

function render() {
    return html`
    <form method="post">
        <div>
            <label for="email">Email</label>
            <input type="email" name="email" id="email" required>
        </div>
        <div>
            <label for="password">Password</label>
            <input type="password" name="password" id="password" required>
        </div>
        <button type="submit">Login</button>
    </form>
    <p>First time user? <a href="/web/login?handler=register">Register here.</a></p>`
}

function registerView() {
    return html`
    <form id=register-form method=post action="?handler=register">
        <div>
            <label for="email">Email</label>
            <input type="email" name="email" id="email" required>
        </div>
        <div>
            <label for="password">Password</label>
            <input type="password" name="password" id="password" required>
        </div>
        <div>
            <label for="passwordConfirm">Confirm Password</label>
            <input type="password" name="passwordConfirm" id="passwordConfirm" required>
        </div>
        <button>Register</button>
    </form>
    <p>Already registered? <a href="/web/login">Login here.</a></p>

<script>
    document.getElementById("register-form")
    .addEventListener("change", e => {
        if (!e.target.name.includes("assword")) {
            return
        }
        let form = e.target.form
        let password = form.password
        let confirm = form.passwordConfirm
        if (password.value === confirm.value) {
            confirm.setCustomValidity('')
        } else {
            confirm.setCustomValidity('Passwords do not match.')
        }
    })
</script>`
}

const loginDataValidator = {
    email: createString50("email"),
    password: createString50("password"),
}

const registerDataValidator = {
    email: createString50("Email"),
    password: createString50("Password"),
    passwordConfirm: createString50("Confirm Password")
}

const postHandlers : PostHandlers = {
    async post({ data }) {
        let { email, password } = await validateObject(data, loginDataValidator)
        let credentials = await api.signIn(email, password)
        await db.setCredentials(credentials)
        return Response.redirect(location)
    },

    async register({ data }) {
        let { email, password, passwordConfirm } = await validateObject(data, registerDataValidator)
        let registered = await api.register(email, password, passwordConfirm)
        if (!registered.id) {
            return Promise.reject("Could not register user.")
        }
        let credentials = await api.signIn(email, password)
        await db.setCredentials(credentials)
        return Response.redirect(location)
    }
}

const route : Route = {
    route: /login\/$/,
    get: (req) => {
        location = req.referrer || "/web"
        let query = searchParams<{ handler?: string }>(req)
        return query.handler === "register"
            ? layout(req, {
                title: "Register",
                main: registerView()
            })
        : layout(req, {
            title: "Login",
            main: render(),
        })
    },
    post: postHandlers,
}

export default route

