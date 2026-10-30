// Text input and screen insets on Android, between VActivity.java and the
// app's frame loop (platform_android.c.v). They arrive on Android's UI thread
// and wait here until the next frame takes them.

#include <jni.h>
#include <pthread.h>
#include <string.h>
#include <android/input.h>
#include <android/keycodes.h>
#include <android/native_activity.h>

// soccer_key_code stands in for AKeyEvent_getKeyCode in sokol_app.h (see the
// #flag in platform_android.c.v), which ends the app on Back. With Back
// hidden the event goes on to VActivity.onBackPressed, and from there to the
// app, which goes back a screen.
int32_t soccer_real_key_code(const AInputEvent *e) __asm__("AKeyEvent_getKeyCode");

int32_t soccer_key_code(const AInputEvent *e) {
	int32_t code = soccer_real_key_code(e);
	return code == AKEYCODE_BACK ? AKEYCODE_UNKNOWN : code;
}

#define SOCCER_KEYS_MAX 1024

static pthread_mutex_t soccer_keys_mu = PTHREAD_MUTEX_INITIALIZER;
static int soccer_keys[SOCCER_KEYS_MAX];
static int soccer_keys_len = 0;
static void *soccer_keys_ctx = 0;

// soccer_keys_wake (V) asks gg for a frame; without input it draws none.
void soccer_keys_wake(void *ctx);

static void soccer_keys_set_ctx(void *ctx) {
	pthread_mutex_lock(&soccer_keys_mu);
	soccer_keys_ctx = ctx;
	pthread_mutex_unlock(&soccer_keys_mu);
}

JNIEXPORT void JNICALL Java_io_v_android_VActivity_nativeKey(JNIEnv *env, jclass cls, jint code) {
	(void)env;
	(void)cls;
	pthread_mutex_lock(&soccer_keys_mu);
	if (soccer_keys_len < SOCCER_KEYS_MAX) {
		soccer_keys[soccer_keys_len++] = code;
	}
	void *ctx = soccer_keys_ctx;
	pthread_mutex_unlock(&soccer_keys_mu);
	if (ctx) {
		soccer_keys_wake(ctx);
	}
}

// The screen edges the system covers, in pixels: the status bar, and the
// navigation bar or the keyboard. VActivity.java reports them on each layout.
static int soccer_inset_top = 0;
static int soccer_inset_bottom = 0;

JNIEXPORT void JNICALL Java_io_v_android_VActivity_nativeInsets(JNIEnv *env, jclass cls, jint top, jint bottom) {
	(void)env;
	(void)cls;
	pthread_mutex_lock(&soccer_keys_mu);
	soccer_inset_top = top;
	soccer_inset_bottom = bottom;
	void *ctx = soccer_keys_ctx;
	pthread_mutex_unlock(&soccer_keys_mu);
	if (ctx) {
		soccer_keys_wake(ctx);
	}
}

static void soccer_insets(int *top, int *bottom) {
	pthread_mutex_lock(&soccer_keys_mu);
	*top = soccer_inset_top;
	*bottom = soccer_inset_bottom;
	pthread_mutex_unlock(&soccer_keys_mu);
}

// soccer_keys_take moves up to max queued keys into out and returns how many.
static int soccer_keys_take(int *out, int max) {
	pthread_mutex_lock(&soccer_keys_mu);
	int n = soccer_keys_len < max ? soccer_keys_len : max;
	memcpy(out, soccer_keys, n * sizeof(int));
	memmove(soccer_keys, soccer_keys + n, (soccer_keys_len - n) * sizeof(int));
	soccer_keys_len -= n;
	pthread_mutex_unlock(&soccer_keys_mu);
	return n;
}

// soccer_jni_begin gets the native thread a JNIEnv, attaching it to the VM
// if need be; soccer_jni_end undoes that.
static JNIEnv *soccer_jni_begin(ANativeActivity *activity, int *attached) {
	JavaVM *vm = activity->vm;
	JNIEnv *env = 0;
	*attached = 0;
	if ((*vm)->GetEnv(vm, (void **)&env, JNI_VERSION_1_6) == JNI_EDETACHED) {
		if ((*vm)->AttachCurrentThread(vm, &env, 0) != JNI_OK) {
			return 0;
		}
		*attached = 1;
	}
	return env;
}

static void soccer_jni_end(ANativeActivity *activity, JNIEnv *env, int attached) {
	if ((*env)->ExceptionCheck(env)) {
		(*env)->ExceptionDescribe(env);
		(*env)->ExceptionClear(env);
	}
	if (attached) {
		(*activity->vm)->DetachCurrentThread(activity->vm);
	}
}

// soccer_move_task_to_back puts the app in the background.
static void soccer_move_task_to_back(ANativeActivity *activity) {
	int attached;
	JNIEnv *env = soccer_jni_begin(activity, &attached);
	if (!env) {
		return;
	}
	jclass cls = (*env)->GetObjectClass(env, activity->clazz);
	jmethodID move = (*env)->GetMethodID(env, cls, "moveTaskToBack", "(Z)Z");
	if (move) {
		(*env)->CallBooleanMethod(env, activity->clazz, move, JNI_TRUE);
	}
	(*env)->DeleteLocalRef(env, cls);
	soccer_jni_end(activity, env, attached);
}

// soccer_show_keyboard calls VActivity.showKeyboard from the native thread.
static void soccer_show_keyboard(ANativeActivity *activity, int show, int kind, const char *before, int len) {
	int attached;
	JNIEnv *env = soccer_jni_begin(activity, &attached);
	if (!env) {
		return;
	}
	jclass cls = (*env)->GetObjectClass(env, activity->clazz);
	jmethodID show_keyboard = (*env)->GetMethodID(env, cls, "showKeyboard", "(ZI[B)V");
	if (show_keyboard) {
		jbyteArray bytes = (*env)->NewByteArray(env, len);
		(*env)->SetByteArrayRegion(env, bytes, 0, len, (const jbyte *)before);
		(*env)->CallVoidMethod(env, activity->clazz, show_keyboard, (jboolean)(show != 0), (jint)kind, bytes);
		(*env)->DeleteLocalRef(env, bytes);
	}
	(*env)->DeleteLocalRef(env, cls);
	soccer_jni_end(activity, env, attached);
}
