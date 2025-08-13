/*=====================================================================
LoadTextureTask.h
-----------------
Copyright Glare Technologies Limited 2019 -
=====================================================================*/
#pragma once


#include "OpenGLTexture.h"
#include <Task.h>
#include <ThreadMessage.h>
#include <ThreadSafeQueue.h>
#include <string>
class OpenGLEngine;
class TextureServer;
class TextureData;
class Map2D;


class TextureLoadedThreadMessage : public ThreadMessage
{
public:
	std::string tex_path;
	std::string tex_key;
	TextureParams tex_params;
	Reference<TextureData> texture_data;
	
	Reference<Map2D> terrain_map; // Non-null iff we are loading a terrain map (e.g. is_terrain_map is true)
};


/*=====================================================================
LoadTextureTask
---------------

=====================================================================*/
class LoadTextureTask : public glare::Task
{
public:
	LoadTextureTask(const Reference<OpenGLEngine>& opengl_engine_, TextureServer* texture_server_, ThreadSafeQueue<Reference<ThreadMessage> >* result_msg_queue_, const std::string& path_, 
		const TextureParams& tex_params, bool is_terrain_map);

	virtual void run(size_t thread_index);

	Reference<OpenGLEngine> opengl_engine;
	TextureServer* texture_server;
	ThreadSafeQueue<Reference<ThreadMessage> >* result_msg_queue;
	std::string path;
	TextureParams tex_params;
	bool is_terrain_map;
};
