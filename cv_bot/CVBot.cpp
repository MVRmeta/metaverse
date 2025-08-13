/*=====================================================================
CVBot.h
-------
Copyright Glare Technologies Limited 2019 -
=====================================================================*/



#include "CryptoVoxelsLoader.h"
#include "../shared/Protocol.h"
#include "../shared/ResourceManager.h"
#include "../gui_client/ClientThread.h"
#include <networking/Networking.h>
#include <networking/TLSSocket.h>
#include <PlatformUtils.h>
#include <Clock.h>
#include <ConPrint.h>
#include <OpenSSL.h>
#include <JSONParser.h>
#include <PoolAllocator.h>
#include <Exception.h>
#include <tls.h>
#include <IndigoXMLDoc.h>
#include <XMLParseUtils.h>


const int server_port = 7600;


struct CVBotConfig
{
	std::string cv_bot_password;
};


static CVBotConfig parseCVBotConfig(const std::string& config_path)
{
	IndigoXMLDoc doc(config_path);
	pugi::xml_node root_elem = doc.getRootElement();

	CVBotConfig config;
	config.cv_bot_password = XMLParseUtils::parseString(root_elem, "cv_bot_password");
	return config;
}


int main(int argc, char* argv[])
{
	try
	{
		Clock::init();
		Networking::createInstance();
		PlatformUtils::ignoreUnixSignals();
		OpenSSL::init();
		TLSSocket::initTLS();

		const CVBotConfig config = parseCVBotConfig(PlatformUtils::getAppDataDirectory("Cyberspace") + "/cv_bot_config.xml");

		ThreadSafeQueue<Reference<ThreadMessage> > msg_queue;

		Reference<WorldState> world_state = new WorldState();


		// Create and init TLS client config
		struct tls_config* client_tls_config = tls_config_new();
		if(!client_tls_config)
			throw glare::Exception("Failed to initialise TLS (tls_config_new failed)");
		tls_config_insecure_noverifycert(client_tls_config); // TODO: Fix this, check cert etc..
		tls_config_insecure_noverifyname(client_tls_config);

		Reference<glare::PoolAllocator> world_ob_pool_allocator = new glare::PoolAllocator(sizeof(WorldObject), 64);

		Reference<ClientThread> client_thread = new ClientThread(
			&msg_queue,
			"substrata.info",
			//"localhost",
			server_port, // port
			"sdfsdf", // avatar URL
			"cryptovoxels", // world name
			client_tls_config,
			world_ob_pool_allocator
		);
		client_thread->world_state = world_state;

		ThreadManager client_thread_manager;
		client_thread_manager.addThread(client_thread);

		const std::string appdata_path = PlatformUtils::getOrCreateAppDataDirectory("Cyberspace");
		const std::string resources_dir = appdata_path + "/resources";
		conPrint("resources_dir: " + resources_dir);
		Reference<ResourceManager> resource_manager = new ResourceManager(resources_dir);


		// Make LogInMessage packet and enqueue to send
		{
			// TODO: do length prefix stuff

			SocketBufferOutStream packet(SocketBufferOutStream::DontUseNetworkByteOrder);
			packet.writeUInt32(Protocol::LogInMessage);
			packet.writeStringLengthFirst("cryptovoxels"); // Username
			packet.writeStringLengthFirst(config.cv_bot_password); // Password

			client_thread->enqueueDataToSend(packet.buf);
		}

		// Send GetAllObjects msg
		{
			SocketBufferOutStream packet(SocketBufferOutStream::DontUseNetworkByteOrder);
			packet.writeUInt32(Protocol::GetAllObjects);
			client_thread->enqueueDataToSend(packet.buf);
		}

		// Wait until we have received all object data.
		conPrint("Waiting for initial data to be received");
		while(!client_thread->all_objects_received)
		{
			PlatformUtils::Sleep(100);
			conPrintStr(".");
		}

		conPrint("Received objects.  world_state->objects.size(): " + toString(world_state->objects.size()));

		conPrint("===================== Loading CryptoVoxels data =====================");
		CryptoVoxelsLoader::loadCryptoVoxelsData(*world_state, client_thread, resource_manager);
		conPrint("===================== Done Loading CryptoVoxels data. =====================");

		while(1)
		{
			PlatformUtils::Sleep(10);

			// Check messages back from queue
			//conPrint("world_state->objects.size(): " + toString(world_state->objects.size()));
		}
		return 0;
	}
	catch(glare::Exception& e)
	{
		stdErrPrint(e.what());
		return 1;
	}
}
