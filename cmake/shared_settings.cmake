
set(GRAPHICS_DIR "${GLARE_CORE_TRUNK_DIR_ENV}/graphics")
set(graphics
${GRAPHICS_DIR}/AnimationData.cpp
${GRAPHICS_DIR}/AnimationData.h
${GRAPHICS_DIR}/BatchedMesh.cpp
${GRAPHICS_DIR}/BatchedMesh.h
${GRAPHICS_DIR}/BatchedMeshTests.cpp
${GRAPHICS_DIR}/BatchedMeshTests.h
${GRAPHICS_DIR}/bitmap.cpp
${GRAPHICS_DIR}/bitmap.h
${GRAPHICS_DIR}/BoxFilterFunction.cpp
${GRAPHICS_DIR}/BoxFilterFunction.h
${GRAPHICS_DIR}/Colour3.cpp
${GRAPHICS_DIR}/colour3.h
${GRAPHICS_DIR}/Colour3f.cpp
${GRAPHICS_DIR}/Colour4f.cpp
${GRAPHICS_DIR}/Colour4f.h
${GRAPHICS_DIR}/CompressedImage.cpp
${GRAPHICS_DIR}/CompressedImage.h
${GRAPHICS_DIR}/Drawing.cpp
${GRAPHICS_DIR}/Drawing.h
${GRAPHICS_DIR}/DXTCompression.cpp
${GRAPHICS_DIR}/DXTCompression.h
${GRAPHICS_DIR}/EXRDecoder.cpp
${GRAPHICS_DIR}/EXRDecoder.h
${GRAPHICS_DIR}/FilterFunction.cpp
${GRAPHICS_DIR}/FilterFunction.h
${GRAPHICS_DIR}/FFTPlan.cpp
${GRAPHICS_DIR}/FFTPlan.h
${GRAPHICS_DIR}/FormatDecoderGLTF.cpp
${GRAPHICS_DIR}/FormatDecoderGLTF.h
${GRAPHICS_DIR}/formatdecoderobj.cpp
${GRAPHICS_DIR}/formatdecoderobj.h
${GRAPHICS_DIR}/FormatDecoderSTL.cpp
${GRAPHICS_DIR}/FormatDecoderSTL.h
${GRAPHICS_DIR}/FormatDecoderVox.cpp
${GRAPHICS_DIR}/FormatDecoderVox.h
${GRAPHICS_DIR}/GaussianFilterFunction.cpp
${GRAPHICS_DIR}/GaussianFilterFunction.h
${GRAPHICS_DIR}/GaussianImageFilter.cpp
${GRAPHICS_DIR}/GaussianImageFilter.h
${GRAPHICS_DIR}/GifDecoder.cpp
${GRAPHICS_DIR}/GifDecoder.h
${GRAPHICS_DIR}/GridNoise.cpp
${GRAPHICS_DIR}/GridNoise.h
${GRAPHICS_DIR}/image.cpp
${GRAPHICS_DIR}/image.h
${GRAPHICS_DIR}/Image4f.cpp
${GRAPHICS_DIR}/Image4f.h
${GRAPHICS_DIR}/ImageFilter.cpp
${GRAPHICS_DIR}/ImageFilter.h
${GRAPHICS_DIR}/ImageMap.cpp
${GRAPHICS_DIR}/ImageMap.h
${GRAPHICS_DIR}/ImageMapSequence.h
${GRAPHICS_DIR}/ImageMapTests.cpp
${GRAPHICS_DIR}/ImageMapTests.h
${GRAPHICS_DIR}/imformatdecoder.cpp
${GRAPHICS_DIR}/imformatdecoder.h
${GRAPHICS_DIR}/jpegdecoder.cpp
${GRAPHICS_DIR}/jpegdecoder.h
${GRAPHICS_DIR}/KTXDecoder.cpp
${GRAPHICS_DIR}/KTXDecoder.h
${GRAPHICS_DIR}/Map2D.cpp
${GRAPHICS_DIR}/Map2D.h
${GRAPHICS_DIR}/MeshSimplification.cpp
${GRAPHICS_DIR}/MeshSimplification.h
${GRAPHICS_DIR}/SRGBUtils.cpp
${GRAPHICS_DIR}/SRGBUtils.h
${GRAPHICS_DIR}/NonZeroMipMap.cpp
${GRAPHICS_DIR}/NonZeroMipMap.h
${GRAPHICS_DIR}/PerlinNoise.cpp
${GRAPHICS_DIR}/PerlinNoise.h
${GRAPHICS_DIR}/PNGDecoder.cpp
${GRAPHICS_DIR}/PNGDecoder.h
${GRAPHICS_DIR}/Voronoi.cpp
${GRAPHICS_DIR}/Voronoi.h
${GRAPHICS_DIR}/TextureProcessing.cpp
${GRAPHICS_DIR}/TextureProcessing.h
${GRAPHICS_DIR}/TextureProcessingTests.cpp
${GRAPHICS_DIR}/TextureProcessingTests.h
${GRAPHICS_DIR}/TextureData.h
${GRAPHICS_DIR}/SRGBUtils.cpp
${GRAPHICS_DIR}/SRGBUtils.h
)

set(MESHOPTIMIZER_DIR "${GLARE_CORE_TRUNK_DIR_ENV}/meshoptimizer/src")

set(meshoptimizer
${MESHOPTIMIZER_DIR}/allocator.cpp
${MESHOPTIMIZER_DIR}/meshoptimizer.h
${MESHOPTIMIZER_DIR}/allocator.cpp
${MESHOPTIMIZER_DIR}/clusterizer.cpp
${MESHOPTIMIZER_DIR}/indexcodec.cpp
${MESHOPTIMIZER_DIR}/indexgenerator.cpp
${MESHOPTIMIZER_DIR}/overdrawanalyzer.cpp
${MESHOPTIMIZER_DIR}/overdrawoptimizer.cpp
${MESHOPTIMIZER_DIR}/simplifier.cpp
${MESHOPTIMIZER_DIR}/spatialorder.cpp
${MESHOPTIMIZER_DIR}/stripifier.cpp
${MESHOPTIMIZER_DIR}/vcacheanalyzer.cpp
${MESHOPTIMIZER_DIR}/vcacheoptimizer.cpp
${MESHOPTIMIZER_DIR}/vertexcodec.cpp
${MESHOPTIMIZER_DIR}/vertexfilter.cpp
${MESHOPTIMIZER_DIR}/vfetchanalyzer.cpp
${MESHOPTIMIZER_DIR}/vfetchoptimizer.cpp   
)



set(UTILS_DIR "${GLARE_CORE_TRUNK_DIR_ENV}/utils")
set(utils
${UTILS_DIR}/AESEncryption.cpp
${UTILS_DIR}/AESEncryption.h
${UTILS_DIR}/AllocatorVectorUnitTests.cpp
${UTILS_DIR}/AllocatorVectorUnitTests.h
${UTILS_DIR}/AllocatorVector.h
${UTILS_DIR}/ArenaAllocator.cpp
${UTILS_DIR}/ArenaAllocator.h
${UTILS_DIR}/ArgumentParser.cpp
${UTILS_DIR}/ArgumentParser.h
${UTILS_DIR}/Array2D.h
${UTILS_DIR}/Array3D.h
${UTILS_DIR}/ArrayRef.h
${UTILS_DIR}/Base64.cpp
${UTILS_DIR}/Base64.h
${UTILS_DIR}/BestFitAllocator.cpp
${UTILS_DIR}/BestFitAllocator.h
${UTILS_DIR}/BitField.cpp
${UTILS_DIR}/BitField.h
${UTILS_DIR}/BitUtils.cpp
${UTILS_DIR}/BitUtils.h
${UTILS_DIR}/BufferInStream.cpp
${UTILS_DIR}/BufferInStream.h
${UTILS_DIR}/BufferOutStream.cpp
${UTILS_DIR}/BufferOutStream.h
${UTILS_DIR}/BumpAllocator.cpp
${UTILS_DIR}/BumpAllocator.h
${UTILS_DIR}/CircularBuffer.cpp
${UTILS_DIR}/CircularBuffer.h
${UTILS_DIR}/Checksum.cpp
${UTILS_DIR}/Checksum.h
${UTILS_DIR}/Clock.cpp
${UTILS_DIR}/Clock.h
${UTILS_DIR}/Condition.cpp
${UTILS_DIR}/Condition.h
${UTILS_DIR}/ConPrint.cpp
${UTILS_DIR}/ConPrint.h
${UTILS_DIR}/ContainerUtils.h
${UTILS_DIR}/CryptoRNG.cpp
${UTILS_DIR}/CryptoRNG.h
${UTILS_DIR}/CycleTimer.cpp
${UTILS_DIR}/CycleTimer.h
${UTILS_DIR}/EventFD.cpp
${UTILS_DIR}/EventFD.h
${UTILS_DIR}/Exception.cpp
${UTILS_DIR}/Exception.h
${UTILS_DIR}/FastIterMap.cpp
${UTILS_DIR}/FastIterMap.h
${UTILS_DIR}/FileChecksum.cpp
${UTILS_DIR}/FileChecksum.h
${UTILS_DIR}/FileHandle.cpp
${UTILS_DIR}/FileHandle.h
${UTILS_DIR}/FileInStream.cpp
${UTILS_DIR}/FileInStream.h
${UTILS_DIR}/FileOutStream.cpp
${UTILS_DIR}/FileOutStream.h
${UTILS_DIR}/FileUtils.cpp
${UTILS_DIR}/FileUtils.h
${UTILS_DIR}/IncludeWindows.h
${UTILS_DIR}/AtomicInt.cpp
${UTILS_DIR}/AtomicInt.h
${UTILS_DIR}/IndigoXMLDoc.cpp
${UTILS_DIR}/IndigoXMLDoc.h
${UTILS_DIR}/InStream.cpp
${UTILS_DIR}/InStream.h
${UTILS_DIR}/JSONParser.cpp
${UTILS_DIR}/JSONParser.h
${UTILS_DIR}/KillThreadMessage.cpp
${UTILS_DIR}/KillThreadMessage.h
${UTILS_DIR}/Keccak256.cpp
${UTILS_DIR}/Keccak256.h
${UTILS_DIR}/LinearIterSet.cpp
${UTILS_DIR}/LinearIterSet.h
${UTILS_DIR}/Lock.cpp
${UTILS_DIR}/Lock.h
${UTILS_DIR}/Maybe.h
${UTILS_DIR}/MemAlloc.cpp
${UTILS_DIR}/MemAlloc.h
${UTILS_DIR}/MemMappedFile.cpp
${UTILS_DIR}/MemMappedFile.h
${UTILS_DIR}/MessageableThread.cpp
${UTILS_DIR}/MessageableThread.h
${UTILS_DIR}/Mutex.cpp
${UTILS_DIR}/Mutex.h
${UTILS_DIR}/MyThread.cpp
${UTILS_DIR}/MyThread.h
${UTILS_DIR}/NameMap.cpp
${UTILS_DIR}/NameMap.h
${UTILS_DIR}/Numeric.cpp
${UTILS_DIR}/Numeric.h
${UTILS_DIR}/OutStream.cpp
${UTILS_DIR}/OutStream.h
${UTILS_DIR}/OpenSSL.cpp
${UTILS_DIR}/OpenSSL.h
${UTILS_DIR}/Parser.cpp
${UTILS_DIR}/Parser.h
${UTILS_DIR}/Platform.h
${UTILS_DIR}/PlatformUtils.cpp
${UTILS_DIR}/PlatformUtils.h
${UTILS_DIR}/Plotter.cpp
${UTILS_DIR}/Plotter.h
${UTILS_DIR}/PoolAllocator.cpp
${UTILS_DIR}/PoolAllocator.h
${UTILS_DIR}/PoolMap.cpp
${UTILS_DIR}/PoolMap.h
${UTILS_DIR}/GlareProcess.cpp
${UTILS_DIR}/GlareProcess.h
${UTILS_DIR}/RandomAccessInStream.h
${UTILS_DIR}/RefCounted.h
${UTILS_DIR}/Reference.h
${UTILS_DIR}/ReferenceTest.cpp
${UTILS_DIR}/ReferenceTest.h
${UTILS_DIR}/SHA256.cpp
${UTILS_DIR}/SHA256.h
${UTILS_DIR}/SmallArray.cpp
${UTILS_DIR}/SmallArray.h
${UTILS_DIR}/SmallVector.cpp
${UTILS_DIR}/SmallVector.h
${UTILS_DIR}/SocketBufferOutStream.cpp
${UTILS_DIR}/SocketBufferOutStream.h
${UTILS_DIR}/Sort.cpp
${UTILS_DIR}/Sort.h
${UTILS_DIR}/StandardPrintOutput.cpp
${UTILS_DIR}/StandardPrintOutput.h
${UTILS_DIR}/StreamUtils.cpp
${UTILS_DIR}/StreamUtils.h
${UTILS_DIR}/StringUtils.cpp
${UTILS_DIR}/StringUtils.h
${UTILS_DIR}/string_view.cpp
${UTILS_DIR}/string_view.h
${UTILS_DIR}/Task.cpp
${UTILS_DIR}/Task.h
${UTILS_DIR}/TaskManager.cpp
${UTILS_DIR}/TaskManager.h
${UTILS_DIR}/TaskRunnerThread.cpp
${UTILS_DIR}/TaskRunnerThread.h
${UTILS_DIR}/TaskTests.cpp
${UTILS_DIR}/TaskTests.h
${UTILS_DIR}/ThreadManager.cpp
${UTILS_DIR}/ThreadManager.h
${UTILS_DIR}/ThreadMessage.cpp
${UTILS_DIR}/ThreadMessage.h
${UTILS_DIR}/ThreadMessageSink.cpp
${UTILS_DIR}/ThreadMessageSink.h
${UTILS_DIR}/ThreadSafeQueue.h
${UTILS_DIR}/ThreadSafeRefCounted.h
${UTILS_DIR}/ThreadTests.cpp
${UTILS_DIR}/ThreadTests.h
${UTILS_DIR}/Timer.cpp
${UTILS_DIR}/Timer.h
${UTILS_DIR}/UTF8Utils.cpp
${UTILS_DIR}/UTF8Utils.h
${UTILS_DIR}/Vector.cpp
${UTILS_DIR}/Vector.h
${UTILS_DIR}/VectorUnitTests.cpp
${UTILS_DIR}/VectorUnitTests.h
${UTILS_DIR}/VRef.h
${UTILS_DIR}/XMLParseUtils.cpp
${UTILS_DIR}/XMLParseUtils.h
${UTILS_DIR}/TestUtils.cpp
${UTILS_DIR}/TestUtils.h
${UTILS_DIR}/ManagerWithCache.cpp
${UTILS_DIR}/ManagerWithCache.h
${UTILS_DIR}/Database.cpp
${UTILS_DIR}/Database.h
${UTILS_DIR}/DatabaseTests.cpp
${UTILS_DIR}/DatabaseTests.h
${UTILS_DIR}/BufferViewInStream.cpp
${UTILS_DIR}/BufferViewInStream.h
${UTILS_DIR}/HashSet.cpp
${UTILS_DIR}/HashSet.h
${UTILS_DIR}/HashSetIterators.h
${UTILS_DIR}/HashMap.cpp
${UTILS_DIR}/HashMap.h
${UTILS_DIR}/HashMapIterators.h
${UTILS_DIR}/HashMapInsertOnly2.cpp
${UTILS_DIR}/HashMapInsertOnly2.h
${UTILS_DIR}/HashMapInsertOnly2Iterators.h
${UTILS_DIR}/RuntimeCheck.cpp
${UTILS_DIR}/RuntimeCheck.h
${UTILS_DIR}/GeneralMemAllocator.cpp
${UTILS_DIR}/GeneralMemAllocator.h
${UTILS_DIR}/TopologicalSort.cpp
${UTILS_DIR}/TopologicalSort.h
)


# Since we using Jolt for now, don't need a lot of this physics stuff.
set(PHYSICS_DIR "${GLARE_CORE_TRUNK_DIR_ENV}/physics")
set(physics
#${PHYSICS_DIR}/BVH.cpp
#${PHYSICS_DIR}/BVH.h
#${PHYSICS_DIR}/BVHBuilder.cpp
#${PHYSICS_DIR}/BVHBuilder.h
#${PHYSICS_DIR}/BVHBuilderTests.cpp
#${PHYSICS_DIR}/BVHBuilderTests.h
${PHYSICS_DIR}/jscol_aabbox.cpp
${PHYSICS_DIR}/jscol_aabbox.h
#${PHYSICS_DIR}/jscol_boundingsphere.h
#${PHYSICS_DIR}/jscol_Tree.cpp
#${PHYSICS_DIR}/jscol_Tree.h
#${PHYSICS_DIR}/jscol_triangle.cpp
#${PHYSICS_DIR}/jscol_triangle.h
#${PHYSICS_DIR}/MollerTrumboreTri.cpp
#${PHYSICS_DIR}/MollerTrumboreTri.h
#${PHYSICS_DIR}/BinningBVHBuilder.cpp
#${PHYSICS_DIR}/BinningBVHBuilder.h
#${PHYSICS_DIR}/NonBinningBVHBuilder.cpp
#${PHYSICS_DIR}/NonBinningBVHBuilder.h
#${PHYSICS_DIR}/SBVHBuilder.cpp
#${PHYSICS_DIR}/SBVHBuilder.h
#${PHYSICS_DIR}/SmallBVH.cpp
#${PHYSICS_DIR}/SmallBVH.h
)


set(maths
${GLARE_CORE_TRUNK_DIR_ENV}/maths/LineSegment4f.h
${GLARE_CORE_TRUNK_DIR_ENV}/maths/CheckedMaths.cpp
${GLARE_CORE_TRUNK_DIR_ENV}/maths/CheckedMaths.h
${GLARE_CORE_TRUNK_DIR_ENV}/maths/mathstypes.cpp
${GLARE_CORE_TRUNK_DIR_ENV}/maths/mathstypes.h
${GLARE_CORE_TRUNK_DIR_ENV}/maths/Matrix2.cpp
${GLARE_CORE_TRUNK_DIR_ENV}/maths/Matrix2.h
${GLARE_CORE_TRUNK_DIR_ENV}/maths/matrix3.cpp
${GLARE_CORE_TRUNK_DIR_ENV}/maths/matrix3.h
${GLARE_CORE_TRUNK_DIR_ENV}/maths/Matrix4f.cpp
${GLARE_CORE_TRUNK_DIR_ENV}/maths/Matrix4f.h
${GLARE_CORE_TRUNK_DIR_ENV}/maths/PCG32.h
${GLARE_CORE_TRUNK_DIR_ENV}/maths/plane.cpp
${GLARE_CORE_TRUNK_DIR_ENV}/maths/plane.h
${GLARE_CORE_TRUNK_DIR_ENV}/maths/Quat.cpp
${GLARE_CORE_TRUNK_DIR_ENV}/maths/Quat.h
${GLARE_CORE_TRUNK_DIR_ENV}/maths/SSE.cpp
${GLARE_CORE_TRUNK_DIR_ENV}/maths/SSE.h
${GLARE_CORE_TRUNK_DIR_ENV}/maths/vec2.cpp
${GLARE_CORE_TRUNK_DIR_ENV}/maths/vec2.h
${GLARE_CORE_TRUNK_DIR_ENV}/maths/vec3.cpp
${GLARE_CORE_TRUNK_DIR_ENV}/maths/vec3.h
${GLARE_CORE_TRUNK_DIR_ENV}/maths/Vec4f.cpp
${GLARE_CORE_TRUNK_DIR_ENV}/maths/Vec4f.h
${GLARE_CORE_TRUNK_DIR_ENV}/maths/Vec4i.cpp
${GLARE_CORE_TRUNK_DIR_ENV}/maths/Vec4i.h
)

FILE(GLOB networking "${GLARE_CORE_TRUNK_DIR_ENV}/networking/*.cpp" "${GLARE_CORE_TRUNK_DIR_ENV}/networking/*.h")
FILE(GLOB scripts "../scripts/*.rb")
FILE(GLOB double_conversion "${GLARE_CORE_TRUNK_DIR_ENV}/double-conversion/*.cc" "${GLARE_CORE_TRUNK_DIR_ENV}/double-conversion/*.h")
FILE(GLOB xxhash "${GLARE_CORE_TRUNK_DIR_ENV}/xxHash-r39/*.c"  "${GLARE_CORE_TRUNK_DIR_ENV}/xxHash-r39/*.h")


set(simpleraytracer
${GLARE_CORE_TRUNK_DIR_ENV}/simpleraytracer/geometry.h
${GLARE_CORE_TRUNK_DIR_ENV}/simpleraytracer/raymesh.cpp 
${GLARE_CORE_TRUNK_DIR_ENV}/simpleraytracer/raymesh.h
${GLARE_CORE_TRUNK_DIR_ENV}/simpleraytracer/hitinfo.h
)

set(fft2d "../libs/fft2d/fft4f2d.c")


set(video 
${GLARE_CORE_TRUNK_DIR_ENV}/video/VideoReader.cpp
${GLARE_CORE_TRUNK_DIR_ENV}/video/VideoReader.h
)

if(WIN32)
set(video 
${video}
${GLARE_CORE_TRUNK_DIR_ENV}/video/WMFVideoReader.cpp
${GLARE_CORE_TRUNK_DIR_ENV}/video/WMFVideoReader.h
${GLARE_CORE_TRUNK_DIR_ENV}/video/WMFVideoReaderCallback.cpp
${GLARE_CORE_TRUNK_DIR_ENV}/video/WMFVideoReaderCallback.h
)
endif()



set(indigo_src
${GLARE_CORE_TRUNK_DIR_ENV}/indigo/UVUnwrapper.cpp
${GLARE_CORE_TRUNK_DIR_ENV}/indigo/UVUnwrapper.h
)

set(dll_src
${GLARE_CORE_TRUNK_DIR_ENV}/dll/IndigoMesh.cpp
${GLARE_CORE_TRUNK_DIR_ENV}/dll/include/IndigoMesh.h
${GLARE_CORE_TRUNK_DIR_ENV}/dll/IndigoAllocation.cpp
${GLARE_CORE_TRUNK_DIR_ENV}/dll/include/IndigoAllocation.h
)

include_directories(${GLARE_CORE_TRUNK_DIR_ENV}/dll)
include_directories(${GLARE_CORE_TRUNK_DIR_ENV}/dll/include)




set(basisu_dir ../basis_universal)
set(basisu_files
${basisu_dir}/encoder/basisu_backend.cpp
${basisu_dir}/encoder/basisu_backend.h
${basisu_dir}/encoder/basisu_basis_file.cpp
${basisu_dir}/encoder/basisu_basis_file.h
${basisu_dir}/encoder/basisu_bc7enc.cpp
${basisu_dir}/encoder/basisu_bc7enc.h
${basisu_dir}/encoder/basisu_comp.cpp
${basisu_dir}/encoder/basisu_comp.h
${basisu_dir}/encoder/basisu_enc.cpp
${basisu_dir}/encoder/basisu_enc.h
${basisu_dir}/encoder/basisu_etc.cpp
${basisu_dir}/encoder/basisu_etc.h
${basisu_dir}/encoder/basisu_frontend.cpp
${basisu_dir}/encoder/basisu_frontend.h
${basisu_dir}/encoder/basisu_gpu_texture.cpp
${basisu_dir}/encoder/basisu_gpu_texture.h
${basisu_dir}/encoder/basisu_kernels_imp.h
${basisu_dir}/encoder/basisu_kernels_sse.cpp
${basisu_dir}/encoder/basisu_miniz.h
${basisu_dir}/encoder/basisu_opencl.cpp
${basisu_dir}/encoder/basisu_opencl.h
${basisu_dir}/encoder/basisu_pvrtc1_4.cpp
${basisu_dir}/encoder/basisu_pvrtc1_4.h
${basisu_dir}/encoder/basisu_resampler.cpp
${basisu_dir}/encoder/basisu_resampler.h
${basisu_dir}/encoder/basisu_resampler_filters.h
${basisu_dir}/encoder/basisu_resample_filters.cpp
${basisu_dir}/encoder/basisu_ssim.cpp
${basisu_dir}/encoder/basisu_ssim.h
${basisu_dir}/encoder/basisu_uastc_enc.cpp
${basisu_dir}/encoder/basisu_uastc_enc.h

${basisu_dir}/transcoder/basisu_transcoder.cpp
)


# Add natvis file
if(WIN32)
set(natvis_files ${GLARE_CORE_TRUNK_DIR_ENV}/glare-core.natvis)
endif()


SOURCE_GROUP(graphics FILES ${graphics})
SOURCE_GROUP(indigo FILES ${indigo_src})
SOURCE_GROUP(maths FILES ${maths})
SOURCE_GROUP(networking FILES ${networking})
SOURCE_GROUP(physics FILES ${physics})
SOURCE_GROUP(simpleraytracer FILES ${simpleraytracer})
SOURCE_GROUP(utils FILES ${utils})
SOURCE_GROUP(scripts FILES ${scripts})
SOURCE_GROUP(double_conversion FILES ${double_conversion})
SOURCE_GROUP(dll FILES ${dll_src})
SOURCE_GROUP(fft2d FILES ${fft2d})
SOURCE_GROUP(xxhash FILES ${xxhash})
SOURCE_GROUP(meshoptimizer FILES ${meshoptimizer})
