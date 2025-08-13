/*=====================================================================
ScreenshotHandlers.cpp
----------------------
Copyright Glare Technologies Limited 2021 -
=====================================================================*/
#include "ScreenshotHandlers.h"


#include "RequestInfo.h"
#include "RequestInfo.h"
#include "Response.h"
#include "WebsiteExcep.h"
#include "Escaping.h"
#include "ResponseUtils.h"
#include "WebServerResponseUtils.h"
#include "LoginHandlers.h"
#include "../server/ServerWorldState.h"
#include <ConPrint.h>
#include <Exception.h>
#include <Lock.h>
#include <StringUtils.h>
#include <PlatformUtils.h>
#include <ConPrint.h>
#include <Parser.h>
#include <MemMappedFile.h>


namespace ScreenshotHandlers
{


void handleScreenshotRequest(ServerAllWorldsState& world_state, WebDataStore& datastore, const web::RequestInfo& request, web::ReplyInfo& reply_info) // Shows order details
{
	try
	{
		// Parse screenshot id from request path
		Parser parser(request.path);
		if(!parser.parseString("/screenshot/"))
			throw glare::Exception("Failed to parse /screenshot/");

		uint32 screenshot_id;
		if(!parser.parseUnsignedInt(screenshot_id))
			throw glare::Exception("Failed to parse screenshot_id");

		// Get screenshot local path
		std::string local_path;
		{ // lock scope
			Lock lock(world_state.mutex);

			auto res = world_state.screenshots.find(screenshot_id);
			if(res == world_state.screenshots.end())
				throw glare::Exception("Couldn't find screenshot");

			local_path = res->second->local_path;
		} // end lock scope


		try
		{
			MemMappedFile file(local_path); // Load screenshot file
			
			const std::string content_type = web::ResponseUtils::getContentTypeForPath(local_path);

			// Send it to client
			web::ResponseUtils::writeHTTPOKHeaderAndDataWithCacheMaxAge(reply_info, file.fileData(), file.fileSize(), content_type, 3600*24*14); // cache max age = 2 weeks
		}
		catch(glare::Exception&)
		{
			web::ResponseUtils::writeHTTPOKHeaderAndData(reply_info, "Failed to load file '" + local_path + "'.");
		}
	}
	catch(glare::Exception& e)
	{
		web::ResponseUtils::writeHTTPOKHeaderAndData(reply_info, "Error: " + e.what());
	}
}


void handleMapTileRequest(ServerAllWorldsState& world_state, WebDataStore& datastore, const web::RequestInfo& request, web::ReplyInfo& reply_info) // Shows order details
{
	try
	{
		const int x = request.getURLIntParam("x");
		const int y = -request.getURLIntParam("y") - 1; // NOTE: negated for y-down in leaflet.js, -1 to fix offset also.
		const int z = request.getURLIntParam("z");

		// Get screenshot local path
		std::string local_path;
		{ // lock scope
			Lock lock(world_state.mutex);

			auto res = world_state.map_tile_info.info.find(Vec3<int>(x, y, z));
			if(res == world_state.map_tile_info.info.end())
				throw glare::Exception("Couldn't find map tile");

			const TileInfo& info = res->second;
			if(info.cur_tile_screenshot.nonNull() && info.cur_tile_screenshot->state == Screenshot::ScreenshotState_done)
				local_path = info.cur_tile_screenshot->local_path;
			else if(info.prev_tile_screenshot.nonNull() && info.prev_tile_screenshot->state == Screenshot::ScreenshotState_done)
				local_path = info.prev_tile_screenshot->local_path;
			else
				throw glare::Exception("Map tile screenshot not done.");
		} // end lock scope


		try
		{
			MemMappedFile file(local_path); // Load screenshot file
			
			const std::string content_type = web::ResponseUtils::getContentTypeForPath(local_path);

			// Send it to client
			web::ResponseUtils::writeHTTPOKHeaderAndDataWithCacheMaxAge(reply_info, file.fileData(), file.fileSize(), content_type, 3600*24*14); // cache max age = 2 weeks
		}
		catch(glare::Exception&)
		{
			web::ResponseUtils::writeHTTPOKHeaderAndData(reply_info, "Failed to load file '" + local_path + "'.");
		}
	}
	catch(glare::Exception& e)
	{
		web::ResponseUtils::writeHTTPNotFoundHeaderAndData(reply_info, "Error: " + e.what());
	}
}

} // end namespace ScreenshotHandlers
