/*=====================================================================
ClientUDPHandlerThread.cpp
--------------------------
Copyright Glare Technologies Limited 2023 -
=====================================================================*/
#include "ClientUDPHandlerThread.h"


#include "WorldState.h"
#include "../webserver/LoginHandlers.h"
#include "../shared/Protocol.h"
#include "../shared/ProtocolStructs.h"
#include "../shared/UID.h"
#include "../shared/WorldObject.h"
#include "../shared/MessageUtils.h"
#include "../shared/FileTypes.h"
#include <vec3.h>
#include <ConPrint.h>
#include <Exception.h>
#include <MySocket.h>
#include <PlatformUtils.h>
#include <Networking.h>
#include <opus.h>


ClientUDPHandlerThread::ClientUDPHandlerThread(Reference<UDPSocket> udp_socket_, const std::string& server_hostname_, WorldState* world_state_, glare::AudioEngine* audio_engine_)
:	udp_socket(udp_socket_),
	server_hostname(server_hostname_),
	world_state(world_state_),
	audio_engine(audio_engine_)
{
}


ClientUDPHandlerThread::~ClientUDPHandlerThread()
{
	conPrint("~ClientUDPHandlerThread()");
}


struct AvatarVoiceStreamInfo
{
	Reference<glare::AudioSource> avatar_audio_source;
	OpusDecoder* opus_decoder;
	uint32 sampling_rate;
	uint32 stream_id;
	uint32 next_seq_num_expected;
};


void ClientUDPHandlerThread::doRun()
{
	PlatformUtils::setCurrentThreadNameIfTestsEnabled("ClientUDPHandlerThread");

	std::unordered_map<uint32, AvatarVoiceStreamInfo> avatar_stream_info; // Map from avatar UID to AvatarVoiceStreamInfo for that avatar.

	try
	{
		// This DNS lookup has already been done in ClientThread, but it should be cached, so we can efficiently do it again here.
		const std::vector<IPAddress> server_ips = Networking::doDNSLookup(server_hostname);
		const IPAddress server_ip_addr = server_ips[0];

		std::vector<uint8> packet_buf(4096);
		std::vector<float> pcm_buffer(480);

		while(die == 0)
		{
			IPAddress sender_ip_addr;
			int sender_port;
			const size_t packet_len = udp_socket->readPacket(packet_buf.data(), packet_buf.size(), sender_ip_addr, sender_port);

			// conPrint("ClientUDPHandlerThread: Received packet of length " + toString(packet_len) + " from " + sender_ip_addr.toString() + ", port " + toString(sender_port));

			// See if the local avatar list has changed.
			if(world_state->avatars_changed)
			{
				Lock lock(world_state->mutex);

				for(auto it = world_state->avatars.begin(); it != world_state->avatars.end(); ++it)
				{
					Avatar* av = it->second.ptr();

					// If there is an avatar not in our avatar_stream_info map, that has an audio source, add it to our map.
					// If we are already have stream info, but stream IDs differ: this indicates a new stream has been created.  We need to reset the expected next sequence number.  We will also recreate the Opus decoder in this case.
					bool create_stream_info = false; // Should we (re)create stream info for this avatar?
					if(av->audio_source.nonNull())
					{
						auto info_res = avatar_stream_info.find((uint32)av->uid.value());
						if(info_res == avatar_stream_info.end())
							create_stream_info = true;
						else // Else if we already have stream info for this avatar:
						{
							AvatarVoiceStreamInfo& stream_info = info_res->second;
							if(stream_info.stream_id != av->audio_stream_id) // But the stream ID is different:
							{
								if(stream_info.opus_decoder)
								{
									conPrint("Stream ID changed, destroying existing Opus decoder.");
									opus_decoder_destroy(stream_info.opus_decoder);
								}
								create_stream_info = true;
							}
						}
					}

					if(create_stream_info)
					{
						const uint32 sampling_rate = av->audio_stream_sampling_rate;

						conPrint("Creating Opus decoder for avatar, sampling_rate: " + toString(sampling_rate));

						int opus_error = 0;
						OpusDecoder* opus_decoder = opus_decoder_create(
							sampling_rate, // sampling rate
							1, // channels
							&opus_error
						);
						if(opus_error != OPUS_OK)
							throw glare::Exception("opus_decoder_create failed.");

						avatar_stream_info[(uint32)av->uid.value()] = AvatarVoiceStreamInfo({av->audio_source, opus_decoder, sampling_rate, /*stream_id=*/av->audio_stream_id, /*next_seq_num_expected=*/0});
					}
				}

				for(auto it = avatar_stream_info.begin(); it != avatar_stream_info.end();)
				{
					const UID avatar_uid(it->first);

					bool remove = false;
					auto res = world_state->avatars.find(avatar_uid);
					if(res == world_state->avatars.end()) // If the avatar no longer exists:
						remove = true;
					else
					{
						Avatar* avatar = res->second.ptr();
						if(avatar->audio_source.isNull()) // If the avatar audio source has been removed:
							remove = true;
					}

					if(remove)
					{
						conPrint("Destroying Opus decoder for avatar");
						opus_decoder_destroy(it->second.opus_decoder);
						it = avatar_stream_info.erase(it); // Remove from our stream info map
					}
					else
						++it;
				}

				world_state->avatars_changed = 0;
			}


			if(sender_ip_addr == server_ip_addr)
			{
				if(packet_len >= 4)
				{
					uint32 type;
					std::memcpy(&type, packet_buf.data(), 4);
					if(type == 1) // If packet has voice type:
					{
						if(packet_len >= 12)
						{
							uint32 avatar_id;
							std::memcpy(&avatar_id, packet_buf.data() + 4, 4);

							// Lookup VoiceChatStreamInfo from avatar_id
							auto res = avatar_stream_info.find(avatar_id);
							if(res != avatar_stream_info.end())
							{
								AvatarVoiceStreamInfo* stream_info = &res->second;

								uint32 rcvd_seq_num;
								std::memcpy(&rcvd_seq_num, packet_buf.data() + 8, 4);

								//conPrint("Received voice packet for avatar (UID: " + toString(avatar_id) + ", seq num: " + toString(rcvd_seq_num) + ")");

								if(rcvd_seq_num < stream_info->next_seq_num_expected)
								{
									// Discard packet
									conPrint("Discarding packet.");
								}
								else // else seq_num >= next_seq_num_expected
								{
									/*
									while(next_seq_num_expected < rcvd_seq_num)
									{
										conPrint("Packet was missed, doing loss concealment...");
										// We received a packet with a sequence number (rcvd_seq_num) greater than the one we were expecting (next_seq_num_expected).  Treat the packets with sequence number < rcvd_seq_num as lost.
										// Tell Opus we had a missing packet.
										// "Lost packets can be replaced with loss concealment by calling the decoder with a null pointer and zero length for the missing packet."  https://opus-codec.org/docs/opus_api-1.3.1/group__opus__decoder.html

										// "For the PLC and FEC cases, frame_size must be a multiple of 2.5 ms."
										// at 48000 hz, 1 sample = 1 / 48000 s^-1 = 2.08333 e-5 s
										// samples per 2.5 ms = 0.0025 s / 2.08333 e-5 s = 120
										const int num_samples_decoded = opus_decode_float(stream_info->opus_decoder, NULL, 0, pcm_buffer.data(), 480,//(int)pcm_buffer.size(), 
											0 // decode_fec
										);
										if(num_samples_decoded < 0)
										{
											conPrint("Opus decoding failed: " + toString(num_samples_decoded));
										}
										next_seq_num_expected++;
									}
									assert(rcvd_seq_num == next_seq_num_expected);
									*/

									// Decode opus packet into pcm_buffer
									const size_t packet_header_size_B = 12;
									const size_t opus_packet_len = packet_len - packet_header_size_B;
									const int num_samples_decoded = opus_decode_float(stream_info->opus_decoder, packet_buf.data() + packet_header_size_B, (int32)opus_packet_len, pcm_buffer.data(), (int)pcm_buffer.size(), 
										0 // decode_fec
									);
									if(num_samples_decoded < 0)
										conPrint("Opus decoding failed: " + toString(num_samples_decoded));
									else
									{
										// We are using 10ms frames, so expect sampling_rate * 0.01 samples.
										if(num_samples_decoded != (int)stream_info->sampling_rate / 100)
											conPrint("Unexpected number of samples");
										else
										{
											// Get max abs value in decoded buffer
											float max_val = 0;
											for(int i=0; i<num_samples_decoded; ++i)
												max_val = myMax(max_val, std::fabs(pcm_buffer[i]));
											//printVar(max_val);

											// Append to audio source buffer
											Lock lock(audio_engine->mutex);

											// If too much data is queued up for this audio source:
											if(stream_info->avatar_audio_source->buffer.size() > 4096) // 4096 samples ~= 85 ms at 48 khz
											{
												// Pop all but 2048 items from the buffer.
												const size_t num_samples_to_remove = stream_info->avatar_audio_source->buffer.size() - 2048;
												conPrint("Audio source buffer too full, removing " + toString(num_samples_to_remove) + " samples");

												stream_info->avatar_audio_source->buffer.popFrontNItems(num_samples_to_remove);
											}

											stream_info->avatar_audio_source->buffer.pushBackNItems(pcm_buffer.data(), num_samples_decoded);

											stream_info->avatar_audio_source->smoothed_cur_level = myMax(stream_info->avatar_audio_source->smoothed_cur_level * 0.95f, max_val);
										}

										// conPrint("ClientUDPHandlerThread: decoded " + toString(num_samples_decoded) + " samples.");

										stream_info->next_seq_num_expected++;
									}
								}
							}
							else
							{
								// conPrint("Received voice packet for avatar without streaming context. UID: " + toString(avatar_id));
							}
						}
					}
				}
			}
		}
	}
	catch(MySocketExcep& e)
	{
		if(e.excepType() == MySocketExcep::ExcepType_BlockingCallCancelled)
		{
			// This is expected when we close the socket from asyncProcedure().
			conPrint("ClientUDPHandlerThread: caught expected ExcepType_BlockingCallCancelled");
		}
		else
			conPrint("ClientUDPHandlerThread: MySocketExcep: " + e.what());
	}
	catch(glare::Exception& e)
	{
		conPrint("ClientUDPHandlerThread: glare::Exception: " + e.what());
	}
	catch(std::bad_alloc&)
	{
		conPrint("ClientUDPHandlerThread: Caught std::bad_alloc.");
	}

	// Destroy Opus decoders
	for(auto it = avatar_stream_info.begin(); it != avatar_stream_info.end(); ++it)
		opus_decoder_destroy(it->second.opus_decoder);

	udp_socket = NULL;
}


// This executes in the ClientUDPHandlerThread.
// We call closesocket() on the UDP socket.  This results in the blocking recvfrom() call returning with WSAEINTR ('blocking operation was interrupted by a call to WSACancelBlockingCall')
#if defined(_WIN32)
static void asyncProcedure(uint64 data)
{
	ClientUDPHandlerThread* udp_handler_thread = (ClientUDPHandlerThread*)data;
	if(udp_handler_thread->udp_socket.nonNull())
		udp_handler_thread->udp_socket->closeSocket();

	udp_handler_thread->decRefCount();
}
#endif


void ClientUDPHandlerThread::kill()
{
	die = 1;
	
#if defined(_WIN32)
	this->incRefCount();
	QueueUserAPC(asyncProcedure, this->getHandle(), /*data=*/(ULONG_PTR)this);
#else
	// Send a (zero-length) packet to our own socket, so that it returns from the blocking readPacket() call.
	// After that the thread will terminate gracefully since 'die' is set.
	// This approach seems to be needed since simply closing the socket from this thread doesn't seem to interupt the recvfrom() call on Mac.
	try
	{
		udp_socket->sendPacket(NULL, 0, IPAddress("127.0.0.1"), udp_socket->getThisEndPort());
	}
	catch(glare::Exception& e)
	{
		conPrint("ClientUDPHandlerThread: Sending packet to own socket failed: " + e.what());
	}
#endif
}
