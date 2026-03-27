package com.termux.terminal;

public class JNI {
    static {
        System.loadLibrary("termux");
    }

    public static native int testJni();
}
