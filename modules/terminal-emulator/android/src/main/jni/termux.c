#include <jni.h>
#include <android/log.h>

#define LOG_TAG "termux-jni"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

JNIEXPORT jint JNICALL
Java_com_termux_terminal_JNI_testJni(JNIEnv *env, jclass clazz) {
    LOGI("JNI test: libtermux.so loaded successfully");
    return 42;
}
