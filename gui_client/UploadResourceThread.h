/*=====================================================================
UploadResourceThread.h
-------------------
Copyright Glare Technologies Limited 2016 -
Generated at 2016-01-16 22:59:23 +1300
=====================================================================*/
#pragma once


#include "WorldState.h"
#include <MessageableThread.h>
#include <Platform.h>
#include <MyThread.h>
#include <EventFD.h>
#include <ThreadManager.h>
#include <MySocket.h>
#include <set>
#include <string>
class WorkUnit;
class PrintOutput;
class ThreadMessageSink;
class Server;
struct tls_config;


/*=====================================================================
UploadResourceThread
-------------------
Uploads a single file to the server.
=====================================================================*/
class UploadResourceThread : public MessageableThread
{
public:
	UploadResourceThread(ThreadSafeQueue<Reference<ThreadMessage> >* out_msg_queue, const std::string& local_path, const std::string& resource_URL, const std::string& hostname, int port,
		const std::string& username, const std::string& password, struct tls_config* config, glare::AtomicInt* num_resources_uploading);
	virtual ~UploadResourceThread();

	virtual void doRun();

private:
	//ThreadSafeQueue<Reference<ThreadMessage> >* out_msg_queue;
	std::string local_path, resource_URL;
	std::string hostname;
	std::string username, password;
	int port;
	struct tls_config* config;
	glare::AtomicInt* num_resources_uploading;
};
