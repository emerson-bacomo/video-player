cmake_minimum_required(VERSION 3.10.2)

project(expo-ffmpeg)

# Header search paths
set(FFMPEG_INCLUDE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/include)
include_directories(${FFMPEG_INCLUDE_DIR})

# Prebuilt libraries path
set(FFMPEG_LIBS_DIR ${CMAKE_CURRENT_SOURCE_DIR}/libs/${ANDROID_ABI})

# Import FFmpeg libraries
add_library(avcodec SHARED IMPORTED)
set_target_properties(avcodec PROPERTIES IMPORTED_LOCATION ${FFMPEG_LIBS_DIR}/libavcodec.so)

add_library(avformat SHARED IMPORTED)
set_target_properties(avformat PROPERTIES IMPORTED_LOCATION ${FFMPEG_LIBS_DIR}/libavformat.so)

add_library(avutil SHARED IMPORTED)
set_target_properties(avutil PROPERTIES IMPORTED_LOCATION ${FFMPEG_LIBS_DIR}/libavutil.so)

add_library(swscale SHARED IMPORTED)
set_target_properties(swscale PROPERTIES IMPORTED_LOCATION ${FFMPEG_LIBS_DIR}/libswscale.so)

# Add our module source
add_library(expo-ffmpeg SHARED
    ../common/cpp/ExpoFFmpegModule.cpp
    ../common/cpp/ThumbnailGenerator.cpp
    ../common/cpp/VideoClipper.cpp
)

# Link libraries
target_link_libraries(expo-ffmpeg
    avcodec
    avformat
    avutil
    swscale
    log # Android log library
)
