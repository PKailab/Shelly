cmake_minimum_required(VERSION 3.18.1)
project(termux)

add_library(termux SHARED src/main/jni/termux.c)
target_link_libraries(termux log)
