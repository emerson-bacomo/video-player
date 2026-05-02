#!/bin/bash

# ==============================================================================
# 📝 FFmpeg ANDROID CROSS-COMPILATION DEPLOYMENT SCRIPT
# ==============================================================================
# 
# PRE-REQUISITES:
# 0. Android NDK: 
#    Ensure the Android NDK is installed. Verify that the 'ANDROID_NDK_ROOT' 
#    path below matches your local installation directory.
#
# 1. Dependency Requirement (x264):
#    CRITICAL: You must successfully complete the x264 build process first.
#    Ensure that the 'X264_INSTALL_ROOT' environment variable in this script 
#    exactly matches the installation path used in your x264 build script.
#
# 2. Source Acquisition (Git):
#    Execute 'git clone https://github.com/FFmpeg/FFmpeg.git FFmpeg'
#    within '/c/ffmpeg-src-build/'. If using a custom path, update the 
#    'ROOT_DIR' variable accordingly.
#
# USAGE INSTRUCTIONS:
# 1. Environment: Launch "MSYS2 MINGW64".
#    (Note: Standard MSYS, CMD, or PowerShell are NOT compatible).
# 2. Preparation: Copy the entire script block provided below.
# 3. Execution: Right-click in the MINGW64 terminal to "Paste," 
#    then press [Enter] to begin the build.
#
# ==============================================================================

# =========================================================
# 1. PATHS & ENVIRONMENT SETUP
# =========================================================
# The path to your Android NDK. Use Windows-style paths here as Clang needs them.
export ANDROID_NDK_ROOT="C:/Users/User/AppData/Local/Android/Sdk/ndk/29.0.14206865"

# Define the host toolchain (Windows x86_64). This contains the compilers (clang, etc.)
export TOOLCHAIN="$ANDROID_NDK_ROOT/toolchains/llvm/prebuilt/windows-x86_64"

# Set the PATH. Important: $TOOLCHAIN/bin must come first to ensure we use NDK tools,
# followed by MSYS2 paths (/mingw64/bin) for standard Linux-like utilities.
export PATH="$TOOLCHAIN/bin:/mingw64/bin:/usr/bin:$PATH"

# Root directory of the FFmpeg source code (UNIX-style path for MSYS2 navigation)
ROOT_DIR="/c/ffmpeg-src-build/FFmpeg"

# Root directory where x264 was previously built and installed for Android
X264_INSTALL_ROOT="/c/ffmpeg-src-build/x264/install-android"

# Minimum Android API level supported (API 24 = Android 7.0)
API=24

# =========================================================
# 2. ABI (ARCHITECTURE) CONFIGURATION
# =========================================================
# Format: "Android_ABI | Toolchain_Triple | FFmpeg_Arch | FFmpeg_CPU"
ABIS=(
  "arm64-v8a|aarch64-linux-android|aarch64|armv8-a"     # Modern 64-bit ARM
  "armeabi-v7a|armv7a-linux-androideabi|arm|armv7-a"    # Older 32-bit ARM
  "x86|i686-linux-android|x86|i686"                     # 32-bit Intel (Emulators)
  "x86_64|x86_64-linux-android|x86_64|x86-64"           # 64-bit Intel (Emulators)
)

# =========================================================
# 3. MAIN BUILD LOOP
# =========================================================
for ITEM in "${ABIS[@]}"; do
  # Parse the pipe-delimited string into individual variables
  IFS="|" read -r ABI HOST ARCH CPU <<< "$ITEM"

  echo "----------------------------------------------------"
  echo " Processing ABI: $ABI"
  echo "----------------------------------------------------"

  # Build Directory: Where temporary object files (.o) are stored
  BUILD_DIR="$ROOT_DIR/build-android/$ABI"
  
  # Install Directory: Where final .so and headers are copied
  # cygpath -m converts /c/... to C:/... (Mixed Mode) for Windows compatibility
  INSTALL_DIR=$(cygpath -m "$ROOT_DIR/install-android/$ABI")

  # Path to the pre-built x264 library for this specific ABI
  X264_PATH="$X264_INSTALL_ROOT/$ABI"
  X264_PATH_MIXED=$(cygpath -m "$X264_PATH")

  # Basic sanity check: Ensure x264 exists before trying to link it
  if [[ ! -f "$X264_PATH/lib/libx264.a" && ! -f "$X264_PATH/lib/libx264.so" ]]; then
      echo "❌ Missing x264 binary for ABI: $ABI"
      exit 1
  fi

  # =========================================================
  # 4. PKG-CONFIG SETUP (Linking x264)
  # =========================================================
  # We reset standard pkg-config variables to ensure it only looks at our Android x264
  unset PKG_CONFIG_PATH
  export PKG_CONFIG_PATH=""
  export PKG_CONFIG_LIBDIR="$X264_PATH_MIXED/lib/pkgconfig"
  export PKG_CONFIG="pkg-config"

  # Verify if pkg-config can actually see the x264 metadata
  pkg-config --modversion x264 >/dev/null || {
      echo "❌ pkg-config failed for x264 ($ABI). Check your .pc file paths!"
      exit 1
  }

  echo "✅ x264 detected via pkg-config"

  # Clean and create fresh build directories
  rm -rf "$BUILD_DIR"
  mkdir -p "$BUILD_DIR"
  cd "$BUILD_DIR"
  
  # =========================================================
  # 5. TOOLCHAIN DEFINITIONS
  # =========================================================
  # We use the Clang wrapper scripts provided by the NDK. 
  # Note: No .exe suffix for CC/CXX as they are shell scripts in modern NDKs.
  export CC="$TOOLCHAIN/bin/${HOST}${API}-clang"
  export CXX="$TOOLCHAIN/bin/${HOST}${API}-clang++"
  export AR="$TOOLCHAIN/bin/llvm-ar.exe"
  export NM="$TOOLCHAIN/bin/llvm-nm.exe"
  export RANLIB="$TOOLCHAIN/bin/llvm-ranlib.exe"
  export STRIP="$TOOLCHAIN/bin/llvm-strip.exe"

  # Workaround for x86 (32-bit Intel) assembly issues often found in FFmpeg/NDK
  EXTRA_FLAGS=""
  if [[ "$ABI" == "x86" ]]; then
      EXTRA_FLAGS="--disable-asm --disable-x86asm"
  fi

  # =========================================================
  # 6. FFMPEG CONFIGURE FLAGS
  # =========================================================
  FFMPEG_FLAGS=(
      $EXTRA_FLAGS
      --cross-prefix="$TOOLCHAIN/bin/llvm-" # Prefix for internal tool calls
      --prefix="$INSTALL_DIR"               # Final output location
      --target-os=android                   # Target OS
      --arch="$ARCH"                        # Architecture (e.g., aarch64)
      --cpu="$CPU"                          # Specific CPU optimization
      --enable-cross-compile                # Required for building on Windows for Android
      --enable-shared                       # Build .so files (required for Android JNI)
      --disable-static                      # Don't build .a files (saves space)
      --disable-doc                         # Don't waste time building documentation
      --disable-programs                    # Don't build ffmpeg.exe (only need libraries)
      --enable-jni                          # Enable Android JNI support
      --enable-mediacodec                   # Enable Android hardware acceleration
      --enable-pic                          # Position Independent Code (required for shared libs)
      --cc="$CC"                            # C Compiler
      --cxx="$CXX"                          # C++ Compiler
      --ar="$AR"                            # Archive tool
      --nm="$NM"                            # Symbol inspector
      --ranlib="$RANLIB"                    # Library indexer
      --strip="$STRIP"                      # Removes debug symbols (reduces file size)
      --enable-libx264                      # Include H.264 encoding support
      --enable-encoder=libx264              # Enable the specific x264 encoder
      --enable-gpl                          # Required to use x264 (GPL license)
      --pkg-config="pkg-config"             # Use MSYS2 pkg-config to find x264
      --pkg-config-flags="--static"         # Pull in dependency libs like -lm
      --extra-cflags="-I$X264_PATH_MIXED/include -fPIC -O3" # Headers and optimization
      --extra-ldflags="-L$X264_PATH_MIXED/lib -Wl,-rpath-link,$X264_PATH_MIXED/lib -Wl,--as-needed" # Libraries
  )

  # --- x86 SPECIFIC WORKAROUNDS ---
  if [[ "$ABI" == "x86" ]]; then
      echo "⚠️ Applying x86-specific safety flags..."
      
      FFMPEG_FLAGS+=(
          "--disable-asm"            # Disable hand-written assembly to prevent "Text Relocation" errors common in Android x86
          "--disable-x86asm"         # Disable the x86-optimized SIMD assembly (YASM/NASM code)
          "--disable-inline-asm"     # Disable C-style inline assembly to ensure the compiler only produces pure, position-independent C code
      )
  fi

  # --- x86_64 SPECIFIC WORKAROUNDS ---
  if [[ "$ABI" == "x86_64" ]]; then
      echo "⚠️ Applying x86_64-specific safety flags..."
      FFMPEG_FLAGS+=(
          "--disable-x86asm"         # Helps prevent text-relocation issues in 64-bit too
      )
  fi

  LOG_FILE="$BUILD_DIR/build.log"

  # =========================================================
  # 7. EXECUTION (CONFIGURE & MAKE)
  # =========================================================
  echo "Configuring FFmpeg for $ABI..."

  # PIPESTATUS[0] captures the exit code of 'configure', even if 'tee' succeeds.
  ../../configure "${FFMPEG_FLAGS[@]}" 2>&1 | tee "$LOG_FILE"

  if [ "${PIPESTATUS[0]}" -ne 0 ]; then
      echo "❌ Configure failed! See $BUILD_DIR/ffbuild/config.log"
      exit 1
  fi

  # Double-check that the linker actually accepted x264
  grep -q "libx264" ffbuild/config.log || {
      echo "❌ x264 NOT detected by linker! Check config.log"
      exit 1
  }

  echo "✅ Configuration successful. Starting build..."

  # Build using 4 CPU cores. Output is shown live and appended to log.
  make -j4 2>&1 | tee -a "$LOG_FILE"
  
  if [ "${PIPESTATUS[0]}" -ne 0 ]; then
      echo "❌ Build failed! Check the log for compiler errors."
      exit 1
  fi
  
  echo "✅ Build complete. Installing to $INSTALL_DIR"
  
  # Copy the .so files and headers to the installation directory
  make install | tee -a "$LOG_FILE"
  
  # Return to the root folder to start the next ABI loop
  cd "$ROOT_DIR"
done

echo "===================================================="
echo " All ABIs processed successfully!"
echo "===================================================="