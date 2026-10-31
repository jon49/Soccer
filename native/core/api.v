module core

import net.http
import json2
import encoding.base64
import rand

// HTTP calls to TrailBase. They are plain functions with no Store access so
// the GUI can run them on a worker thread; the results are applied to the
// Store on the UI thread.
//
//   POST   /api/auth/v1/{login,register,refresh,logout,reset_password/request}
//   DELETE /api/auth/v1/delete                  delete the account
//   POST   /api/data/soccer                     sync (see sync.v)
//   POST   /api/spaces/soccer                   share a team
//   GET    /api/spaces/soccer/{space}/members
//   DELETE /api/spaces/soccer/{space}/members/{user|me}
//   POST   /api/spaces/soccer/{space}/invites
//   GET    /api/invites/soccer/{code}
//   POST   /api/invites/soccer/{code}/accept
//   POST   /api/records/v1/pages               publish the schedule

pub const app_name = 'soccer'

// ApiResult is a response, or a message for the user. new_auth_token is set
// when the auth token expired and was refreshed during the call.
pub struct ApiResult {
pub:
	ok             bool
	status         int
	json           json2.Any = json2.null
	message        string
	new_auth_token string
}

const offline_message = 'You appear to be offline. Connect to the internet and try again.'

fn http_request(method http.Method, url string, body string, bearer string) !http.Response {
	mut header := http.new_header(key: .content_type, value: 'application/json')
	if bearer != '' {
		header.add(.authorization, 'Bearer ${bearer}')
	}
	return http.fetch(
		url:         url
		method:      method
		header:      header
		data:        body
		user_agent:  'soccer-native'
		validate:    url.starts_with('https://')
		max_retries: 1
	)
}

// auth_request makes an authenticated call, refreshing the auth token once
// when the server says it is stale.
pub fn auth_request(method http.Method, server string, path string, body string, auth AuthTokens) ApiResult {
	if !auth.logged_in() {
		return ApiResult{
			status:  401
			message: 'You need to log in first.'
		}
	}
	mut res := http_request(method, server + path, body, auth.auth_token) or {
		return ApiResult{
			status:  0
			message: offline_message
		}
	}
	mut new_token := ''
	if res.status_code == 401 && auth.refresh_token != '' {
		if token := refresh_auth_token(server, auth.refresh_token) {
			new_token = token
			res = http_request(method, server + path, body, token) or {
				return ApiResult{
					status:         0
					message:        offline_message
					new_auth_token: new_token
				}
			}
		}
	}
	if res.status_code >= 200 && res.status_code < 300 {
		return ApiResult{
			ok:             true
			status:         res.status_code
			json:           decode_json(res.body)
			new_auth_token: new_token
		}
	}
	message := match res.status_code {
		401 { 'You need to log in first.' }
		404 { 'Not found.' }
		else { 'Something went wrong (status ${res.status_code}).' }
	}
	return ApiResult{
		status:         res.status_code
		message:        message
		new_auth_token: new_token
	}
}

fn refresh_auth_token(server string, refresh_token string) ?string {
	body := json2.Any({
		'refresh_token': json2.Any(refresh_token)
	})
	res := http_request(.post, server + '/api/auth/v1/refresh', body.json_str(), '') or {
		return none
	}
	if res.status_code != 200 {
		return none
	}
	token := any_str(field(as_map(decode_json(res.body)), 'auth_token'))
	return if token == '' { none } else { token }
}

// ---- accounts ----

fn friendly_status(status int) string {
	if status == 429 {
		return 'Too many attempts. Please wait a minute and try again.'
	}
	if status >= 500 {
		return 'The server is temporarily unavailable. Please try again in a moment.'
	}
	return 'Something went wrong (error ${status}). Please try again.'
}

// server_message is the error message TrailBase sent, if any.
fn server_message(res http.Response) string {
	m := as_map(decode_json(res.body))
	msg := any_str(field(m, 'message'))
	if msg != '' {
		return msg
	}
	return any_str(field(m, 'error'))
}

pub fn login(server string, email string, password string) !AuthTokens {
	body := json2.Any({
		'email':    json2.Any(email)
		'password': password
	})
	res := http_request(.post, server + '/api/auth/v1/login', body.json_str(), '') or {
		return error('Network error. Please try again.')
	}
	match res.status_code {
		200 {}
		400, 401 {
			return error('Invalid email or password.')
		}
		403 {
			msg := server_message(res)
			return error(if msg != '' {
				msg
			} else {
				'Verify your email address first: check your email for the link.'
			})
		}
		else {
			return error(friendly_status(res.status_code))
		}
	}
	m := as_map(decode_json(res.body))
	tokens := AuthTokens{
		email:         email
		auth_token:    any_str(field(m, 'auth_token'))
		refresh_token: any_str(field(m, 'refresh_token'))
		csrf_token:    any_str(field(m, 'csrf_token'))
	}
	if tokens.auth_token == '' {
		return error('The server did not return a login token.')
	}
	return tokens
}

// register creates an account. TrailBase requires email verification before
// login works, so this does not log in.
pub fn register(server string, email string, password string, password_repeat string) ! {
	body := json2.Any({
		'email':           json2.Any(email)
		'password':        password
		'password_repeat': password_repeat
	})
	res := http_request(.post, server + '/api/auth/v1/register', body.json_str(), '') or {
		return error('Network error. Please try again.')
	}
	if res.status_code < 200 || res.status_code >= 300 {
		msg := server_message(res)
		return error(if msg != '' { msg } else { friendly_status(res.status_code) })
	}
}

pub fn request_password_reset(server string, email string) ! {
	body := json2.Any({
		'email': json2.Any(email)
	})
	res := http_request(.post, server + '/api/auth/v1/reset_password/request', body.json_str(),
		'') or { return error('Network error. Please try again.') }
	if res.status_code < 200 || res.status_code >= 300 {
		msg := server_message(res)
		return error(if msg != '' { msg } else { friendly_status(res.status_code) })
	}
}

// logout ends the session on the server. Failures are ignored, since the
// tokens are dropped locally either way.
pub fn logout(server string, refresh_token string) {
	if refresh_token == '' {
		return
	}
	body := json2.Any({
		'refresh_token': json2.Any(refresh_token)
	})
	http_request(.post, server + '/api/auth/v1/logout', body.json_str(), '') or {}
}

// delete_account deletes the caller's account. The server then deletes the
// data it synced; teams shared with other coaches stay with them.
pub fn delete_account(server string, auth AuthTokens) ApiResult {
	return auth_request(.delete, server, '/api/auth/v1/delete', '', auth)
}

// ---- sharing ----

fn spaces_path() string {
	return '/api/spaces/${app_name}'
}

pub fn space_create(server string, auth AuthTokens) ApiResult {
	return auth_request(.post, server, spaces_path(), '', auth)
}

pub fn space_members(server string, auth AuthTokens, space string) ApiResult {
	return auth_request(.get, server, '${spaces_path()}/${space}/members', '', auth)
}

// space_member_remove: `user` is a member's id, or "me" to leave. Removing
// the last member deletes the space and all its data.
pub fn space_member_remove(server string, auth AuthTokens, space string, user string) ApiResult {
	return auth_request(.delete, server, '${spaces_path()}/${space}/members/${user}', '',
		auth)
}

pub fn space_invite_create(server string, auth AuthTokens, space string) ApiResult {
	return auth_request(.post, server, '${spaces_path()}/${space}/invites', '', auth)
}

pub fn invite_preview(server string, auth AuthTokens, code string) ApiResult {
	return auth_request(.get, server, '/api/invites/${app_name}/${code}', '', auth)
}

pub fn invite_accept(server string, auth AuthTokens, code string) ApiResult {
	return auth_request(.post, server, '/api/invites/${app_name}/${code}/accept', '', auth)
}

pub fn invite_url(server string, code string) string {
	return '${server}/web/join/?code=${code}'
}

// invite_code finds the code in a pasted invite link, or takes the text as
// the code itself.
pub fn invite_code(text string) ?string {
	mut t := text.trim_space()
	if i := t.index('code=') {
		t = t[i + 5..]
		j := t.index_any('&#')
		if j >= 0 {
			t = t[..j]
		}
	}
	t = t.trim_space()
	if t.len == 36 && t.bytes().all(it.is_hex_digit() || it == `-`) {
		return t.to_lower()
	}
	return none
}

pub struct SpaceMember {
pub:
	user  string
	email string
	me    bool
}

pub fn members_from(res ApiResult) []SpaceMember {
	return any_arr(field(as_map(res.json), 'members')).map(fn (x json2.Any) SpaceMember {
		m := as_map(x)
		return SpaceMember{any_str(field(m, 'user')), any_str(field(m, 'email')), any_bool(field(m,
			'me'))}
	})
}

// ---- the published schedule ----

pub fn schedule_url(server string, guid string) string {
	return '${server}/api/pages/${app_name}/${guid}?t=${now_ms()}'
}

pub fn new_uuid() string {
	return rand.uuid_v4()
}

// publish_schedule uploads the page. Reusing the guid overwrites it, so
// the link never changes across republishes.
pub fn publish_schedule(server string, auth AuthTokens, guid string, team_id string, html string) ApiResult {
	mut body := {
		'id':   json2.Any(guid)
		'app':  app_name
		'html': json2.Any({
			'filename':     json2.Any('schedule.html')
			'content_type': 'text/html'
			'data':         base64.encode_str(html)
		})
	}
	// Any member of a shared team's space may publish or overwrite its page.
	if is_shared_team(team_id) {
		body['space'] = team_id
	}
	mut res := auth_request(.post, server, '/api/records/v1/pages', json2.Any(body).json_str(),
		auth)
	if res.ok {
		return res
	}
	message := match res.status {
		0 {
			"Could not publish the schedule — you appear to be offline. Try again once you're connected."
		}
		403 {
			if is_shared_team(team_id) {
				'Could not publish the schedule: it was first published before this team was shared. Ask the coach who shared it to republish it once.'
			} else {
				"Only the app owner can publish a schedule for a team that isn't shared."
			}
		}
		else {
			'Failed to publish schedule (status ${res.status}).'
		}
	}
	return ApiResult{
		...res
		message: message
	}
}
