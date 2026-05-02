#!/bin/bash

# ==============================================================================
# 📝 x264 ANDROID CROSS-COMPILATION DEPLOYMENT SCRIPT
# ==============================================================================
# 
# PRE-REQUISITES:
# 0. Android NDK: 
#    Ensure the Android NDK is installed via Android Studio or standalone.
#    Verify that the 'ANDROID_NDK_ROOT' path below matches your local disk.
#
# 1. Source Acquisition:
#    Execute 'git clone https://code.videolan.org/videolan/x264.git x264' 
#    within the '/c/ffmpeg-src-build' directory. If using a custom path, 
#    update the 'ROOT_DIR' variable accordingly.
#
# USAGE INSTRUCTIONS:
# 1. Environment: Launch "MSYS2 MINGW64". 
#    (Note: Standard MSYS, CMD, or PowerShell are NOT compatible).
# 2. Preparation: Copy the entire script block provided below.
# 3. Execution: Right-click in the MINGW64 terminal to "Paste," 
#    then press [Enter] to begin the build.
#
# ==============================================================================

# --- 1. CORE ENVIRONMENT SETTINGS ---
# Set the location of your Android NDK (Windows-style path)
export ANDROID_NDK_ROOT="C:/Users/User/AppData/Local/Android/Sdk/ndk/29.0.14206865"
# Set the path to the NDK's internal LLVM toolchain (Windows-style)
export TOOLCHAIN_PATH="$ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/windows-x86_64"
# Set target Android API level (24 = Android 7.0+)
export API=24

# Set the root directory where the x264 source code is located
ROOT_DIR="/c/ffmpeg-src-build/x264"
# Set the directory where the compiled libraries will be saved
FINAL_INSTALL_DIR="$ROOT_DIR/install-android"

# Move the terminal into the x264 source directory
cd "$ROOT_DIR"

# --- 2. ABI CONFIGURATION ARRAY ---
# This list contains the 4 architectures Android uses: arm64, armv7, x86, and x64
# Format: "ABI_NAME | HOST_TRIPLE | CLANG_PREFIX"
ABIS=(
    "arm64-v8a|aarch64-linux-android|aarch64-linux-android"     # 64-bit ARM
    "armeabi-v7a|arm-linux-androideabi|armv7a-linux-androideabi" # 32-bit ARM
    "x86|i686-linux-android|i686-linux-android"                  # 32-bit Intel
    "x86_64|x86_64-linux-android|x86_64-linux-android"           # 64-bit Intel
)

# --- 3. THE BUILD LOOP ---
# Start looping through each architecture defined in the array
for entry in "${ABIS[@]}"; do
    # Split the "entry" string using the "|" character into variables
    IFS="|" read -r ABI HOST CLANG_PREFIX <<< "$entry"
    
    echo "============================================"
    echo " 🚀 BUILDING x264 FOR ABI: $ABI"
    echo "============================================"

    # Define a temporary folder name for building this specific ABI
    BUILD_DIR="build-$ABI"
    # Define the specific install folder for this ABI
    ABI_INSTALL_DIR="$FINAL_INSTALL_DIR/$ABI"

    # Clean up any previous failed build data to start fresh
    make distclean 2>/dev/null || true
    # Remove any existing build directory for this ABI
    rm -rf "$BUILD_DIR"
    # Create the build directory
    mkdir -p "$BUILD_DIR"
    # Move into the build directory
    cd "$BUILD_DIR"

    # --- 4. TOOLCHAIN SETUP ---
    # Tell x264 to use the NDK's Clang C compiler for this architecture
    export CC="$TOOLCHAIN_PATH/bin/${CLANG_PREFIX}${API}-clang"
    # Tell x264 to use the NDK's Clang C++ compiler
    export CXX="$TOOLCHAIN_PATH/bin/${CLANG_PREFIX}${API}-clang++"
    # Tell x264 to use the NDK's 'ar' tool for creating library archives
    export AR="$TOOLCHAIN_PATH/bin/llvm-ar.exe"
    # Tell x264 to use the NDK's 'ranlib' for indexing the library
    export RANLIB="$TOOLCHAIN_PATH/bin/llvm-ranlib.exe"
    # Tell x264 to use the NDK's 'strip' to remove debug symbols (reduces size)
    export STRIP="$TOOLCHAIN_PATH/bin/llvm-strip.exe"

    # --- 5. CONFIGURE ---
    # Create a variable for extra settings (used for architecture specific fixes)
    EXTRA_FLAGS=""
    # 32-bit Intel (x86) assembly often crashes on Windows/NDK, so we disable it
    if [[ "$ABI" == "x86" ]]; then
        EXTRA_FLAGS="--disable-asm"
    fi

    # Run the x264 configuration script to prepare for compilation
    ../configure \
        --host="$HOST" \
        --sysroot="$TOOLCHAIN_PATH/sysroot" \
        --prefix="$ABI_INSTALL_DIR" \
        --enable-static \
        --enable-pic \
        --disable-cli \
        --disable-opencl \
        --extra-cflags="-fPIC" \
        $EXTRA_FLAGS

    # --- 6. BUILD & INSTALL ---
    # Compile the code using 8 CPU threads for speed
    make -j8
    # Copy the finished .a (static library) and .h (headers) to the install folder
    make install

    # Move back to the root directory so we can start the next ABI
    cd "$ROOT_DIR"
done

echo "============================================"
echo " 🎉 x264 BUILD COMPLETE FOR ALL ARCHITECTURES!"
echo "============================================"