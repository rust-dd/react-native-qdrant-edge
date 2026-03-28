project(NitroQdrantEdge)
cmake_minimum_required(VERSION 3.9.0)

set (PACKAGE_NAME NitroQdrantEdge)
set (CMAKE_VERBOSE_MAKEFILE ON)
set (CMAKE_CXX_STANDARD 20)

# Define C++ library and add all sources
add_library(${PACKAGE_NAME} SHARED
        src/main/cpp/cpp-adapter.cpp
)

# Add Nitrogen specs :)
include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/NitroQdrantEdge+autolinking.cmake)

# Set up local includes
include_directories(
        "src/main/cpp"
        "../cpp"
)

# Link the Rust static library
set(RUST_LIB_DIR "${CMAKE_SOURCE_DIR}/src/main/jniLibs/${ANDROID_ABI}")
add_library(qdrant_edge_ffi STATIC IMPORTED)
set_target_properties(qdrant_edge_ffi PROPERTIES
        IMPORTED_LOCATION "${RUST_LIB_DIR}/libqdrant_edge_ffi.a"
)

find_library(LOG_LIB log)

# Link all libraries together
target_link_libraries(
        ${PACKAGE_NAME}
        ${LOG_LIB}
        android
        qdrant_edge_ffi
)
