/*=====================================================================
MicReadThread.cpp
-----------------
Copyright Glare Technologies Limited 2023 -
=====================================================================*/
#include "MicReadThread.h"


#include "../gui_client/ThreadMessages.h"
#include <utils/ConPrint.h>
#include <utils/StringUtils.h>
#include <utils/PlatformUtils.h>
#include <utils/ComObHandle.h>
#include <utils/ContainerUtils.h>
#include <utils/RuntimeCheck.h>
#include <utils/Timer.h>
#include <utils/CryptoRNG.h>
#include <networking/UDPSocket.h>
#include <networking/Networking.h>
#if defined(_WIN32)
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <Mmreg.h>
#include <devpkey.h>
#include <Functiondiscoverykeys_devpkey.h>
#include <mfapi.h>
#endif
#include "../audio/AudioResampler.h"
#include "../rtaudio/RtAudio.h"
#include <opus.h>


#if defined(_WIN32)
#define USE_RT_AUDIO 0
#else
#define USE_RT_AUDIO 1
#endif


#if defined(_WIN32)
static inline void throwOnError(HRESULT hres)
{
	if(FAILED(hres))
		throw glare::Exception("Error: " + PlatformUtils::COMErrorString(hres));
}
#endif


namespace glare
{


MicReadThread::MicReadThread(ThreadSafeQueue<Reference<ThreadMessage> >* out_msg_queue_, Reference<UDPSocket> udp_socket_, UID client_avatar_uid_, const std::string& server_hostname_, int server_port_, 
	const std::string& input_device_name_, float input_vol_scale_factor_, MicReadStatus* mic_read_status_)
:	out_msg_queue(out_msg_queue_), udp_socket(udp_socket_), client_avatar_uid(client_avatar_uid_), server_hostname(server_hostname_), server_port(server_port_), 
	input_device_name(input_device_name_), input_vol_scale_factor(input_vol_scale_factor_), mic_read_status(mic_read_status_)
{
}


MicReadThread::~MicReadThread()
{
}


#if USE_RT_AUDIO
static int rtAudioCallback(void* output_buffer, void* input_buffer, unsigned int n_buffer_frames, double stream_time, RtAudioStreamStatus status, void* user_data)
{
	MicReadThread* mic_read_thread = (MicReadThread*)user_data;

	// The RTAudio input stream is created with RTAUDIO_FLOAT32 and nChannels = 1, so input_buffer should just be an array of uninterleaved floats.
	{
		Lock lock(mic_read_thread->buffer_mutex);

		ContainerUtils::append(mic_read_thread->callback_buffer, /*data=*/(const float*)input_buffer, /*size=*/n_buffer_frames);
	}

	return 0;
}
#endif


void MicReadThread::doRun()
{
	PlatformUtils::setCurrentThreadNameIfTestsEnabled("MicReadThread");

	conPrint("MicReadThread started...");


	try
	{
#if defined(_WIN32) && !USE_RT_AUDIO
		//----------------------------- Initialise loopback or microphone Audio capture ------------------------------------
		// See https://learn.microsoft.com/en-us/windows/win32/coreaudio/capturing-a-stream

		const bool capture_loopback = false; // if false, capture microphone

		ComObHandle<IMMDeviceEnumerator> enumerator;
		HRESULT hr = CoCreateInstance(
			__uuidof(MMDeviceEnumerator),
			NULL,
			CLSCTX_ALL, 
			__uuidof(IMMDeviceEnumerator),
			(void**)&enumerator.ptr);
		throwOnError(hr);

		ComObHandle<IMMDevice> device;
		if(input_device_name == "Default")
		{
			hr = enumerator->GetDefaultAudioEndpoint(
				eCapture, // dataFlow
				eConsole, 
				&device.ptr);
			throwOnError(hr);
		}
		else
		{
			// Iterate over endpoints, get ID of endpoint whose name matches input_device_name.

			ComObHandle<IMMDeviceCollection> collection;
			hr = enumerator->EnumAudioEndpoints(
				capture_loopback ? eRender : eCapture, DEVICE_STATE_ACTIVE,
				&collection.ptr);
			throwOnError(hr);

			UINT count;
			hr = collection->GetCount(&count);
			throwOnError(hr);

			std::wstring use_device_id;
			for(UINT i = 0; i < count; i++)
			{
				// Get pointer to endpoint number i.
				ComObHandle<IMMDevice> endpoint;
				hr = collection->Item(i, &endpoint.ptr);
				throwOnError(hr);

				// Get the endpoint ID string.
				LPWSTR endpoint_id = NULL;
				hr = endpoint->GetId(&endpoint_id);
				throwOnError(hr);

				ComObHandle<IPropertyStore> props;
				hr = endpoint->OpenPropertyStore(STGM_READ, &props.ptr);
				throwOnError(hr);

				// Get the endpoint's friendly-name property.
				PROPVARIANT endpoint_name;
				PropVariantInit(&endpoint_name); // Initialize container for property value.
				hr = props->GetValue(PKEY_Device_FriendlyName, &endpoint_name); 
				throwOnError(hr);

				// conPrint("Audio endpoint " + toString(i) + ": \"" + StringUtils::WToUTF8String(endpoint_name.pwszVal) + "\" (" + StringUtils::WToUTF8String(endpoint_id) + ")");

				if(input_device_name == StringUtils::WToUTF8String(endpoint_name.pwszVal))
					use_device_id = endpoint_id;

				CoTaskMemFree(endpoint_id);
				PropVariantClear(&endpoint_name);
			}

			if(use_device_id.empty())
				throw glare::Exception("Could not find device '" + input_device_name + "' (it may have been removed)");

			hr = enumerator->GetDevice(use_device_id.c_str(), &device.ptr);
			throwOnError(hr);
		}

		// Get friendly name of the device we chose
		std::string selected_dev_name;
		{
			ComObHandle<IPropertyStore> props;
			hr = device->OpenPropertyStore(STGM_READ, &props.ptr);
			throwOnError(hr);

			PROPVARIANT endpoint_name;
			PropVariantInit(&endpoint_name); // Initialize container for property value.
			hr = props->GetValue(PKEY_Device_FriendlyName, &endpoint_name); // Get the endpoint's friendly-name property.
			throwOnError(hr);

			selected_dev_name = StringUtils::WToUTF8String(endpoint_name.pwszVal);

			PropVariantClear(&endpoint_name);
		}

		out_msg_queue->enqueue(new LogMessage("Chose audio input device: '" + selected_dev_name + "'."));

		ComObHandle<IAudioClient> audio_client;
		hr = device->Activate(
			__uuidof(IAudioClient), 
			CLSCTX_ALL,
			NULL, 
			(void**)&audio_client.ptr);
		throwOnError(hr);

		WAVEFORMATEXTENSIBLE* mix_format = NULL;
		hr = audio_client->GetMixFormat((WAVEFORMATEX**)&mix_format);
		throwOnError(hr);

		if(mix_format->Format.wFormatTag != WAVE_FORMAT_EXTENSIBLE)
			throw glare::Exception("wFormatTag was not WAVE_FORMAT_EXTENSIBLE");

		WAVEFORMATEXTENSIBLE format;
		std::memcpy(&format, mix_format, sizeof(WAVEFORMATEXTENSIBLE));

		const REFERENCE_TIME hnsRequestedDuration = 10000000; // REFERENCE_TIME time units per second

		hr = audio_client->Initialize(
			AUDCLNT_SHAREMODE_SHARED,
			capture_loopback ? AUDCLNT_STREAMFLAGS_LOOPBACK : 0, // streamflags - note the needed AUDCLNT_STREAMFLAGS_LOOPBACK
			hnsRequestedDuration,
			0,
			(WAVEFORMATEX*)&format,
			NULL);
		throwOnError(hr);

		// Currently we only handle float formats
		if(format.SubFormat != MFAudioFormat_Float)
			throw glare::Exception("Subformat was not MFAudioFormat_Float");

		if(format.Format.wBitsPerSample != 32)
			throw glare::Exception("wBitsPerSample was not 32");

		const uint32 capture_sampling_rate = format.Format.nSamplesPerSec;
		const uint32 num_channels = format.Format.nChannels;

		ComObHandle<IAudioCaptureClient> capture_client;
		hr = audio_client->GetService(
			__uuidof(IAudioCaptureClient),
			(void**)&capture_client.ptr);
		if(hr == AUDCLNT_E_WRONG_ENDPOINT_TYPE)
			conPrint("ERROR: AUDCLNT_E_WRONG_ENDPOINT_TYPE");
		throwOnError(hr);

		out_msg_queue->enqueue(new LogMessage("Starting listening on device: '" + selected_dev_name + "', capture sampling rate: " + toString(capture_sampling_rate) + " hz, num channels: " + toString(num_channels) + 
			", input_vol_scale_factor: " + doubleToStringNDecimalPlaces(input_vol_scale_factor, 2)));

		hr = audio_client->Start();  // Start recording.
		throwOnError(hr);

		//----------------------------------------------------------------------------------------------------------------------

#else

		//--------------------------------- Use RTAudio to do the audio capture ------------------------------------------------
#if _WIN32
		const RtAudio::Api rtaudio_api = RtAudio::WINDOWS_DS;
#elif defined(OSX)
		const RtAudio::Api rtaudio_api = RtAudio::MACOSX_CORE;
#else // else linux:
		const RtAudio::Api rtaudio_api = RtAudio::LINUX_PULSE;
#endif

		RtAudio audio(rtaudio_api);

		unsigned int use_device_id = 0;
		if(input_device_name == "Default")
		{
			use_device_id = audio.getDefaultInputDevice();
		}
		else
		{
			const std::vector<unsigned int> device_ids = audio.getDeviceIds();

			for(size_t i=0; i<device_ids.size(); ++i)
			{
				const RtAudio::DeviceInfo info = audio.getDeviceInfo(device_ids[i]);
				if((info.inputChannels > 0) && info.name == input_device_name)
					use_device_id = device_ids[i];
			}
		}

		if(use_device_id == 0)
			throw glare::Exception("Could not find device '" + input_device_name + "' (it may have been removed)");

		const std::string selected_dev_name = audio.getDeviceInfo(use_device_id).name;
		out_msg_queue->enqueue(new LogMessage("Chose audio input device: '" + selected_dev_name + "'."));

		unsigned int desired_sample_rate = 48000;

		RtAudio::StreamParameters parameters;
		parameters.deviceId = use_device_id;
		parameters.nChannels = 1;
		parameters.firstChannel = 0;
		unsigned int buffer_frames = 256; // 256 sample frames. NOTE: might be changed by openStream() below.

		RtAudio::StreamOptions stream_options;
		stream_options.flags = RTAUDIO_MINIMIZE_LATENCY;

		RtAudioErrorType rtaudio_res = audio.openStream(/*outputParameters=*/NULL, /*input parameters=*/&parameters, RTAUDIO_FLOAT32, desired_sample_rate, &buffer_frames, rtAudioCallback, /*userdata=*/this, &stream_options);
		if(rtaudio_res != RTAUDIO_NO_ERROR)
			throw glare::Exception("Error opening audio stream: code: " + toString((int)rtaudio_res));

		const unsigned int capture_sampling_rate = audio.getStreamSampleRate(); // Get actual sample rate used.

		out_msg_queue->enqueue(new LogMessage("Starting listening on device: '" + selected_dev_name + "', capture sampling rate: " + toString(capture_sampling_rate) + " hz, num channels: 1"));

		rtaudio_res = audio.startStream();
		if(rtaudio_res != RTAUDIO_NO_ERROR)
			throw glare::Exception("Error opening audio stream: code: " + toString((int)rtaudio_res));
		//----------------------------------------------------------------------------------------------------------------------
#endif

		//-------------------------------------- Opus init --------------------------------------------------
		uint32 opus_sampling_rate = capture_sampling_rate;
		if(!((opus_sampling_rate == 8000) || (opus_sampling_rate == 12000) || (opus_sampling_rate == 16000) || (opus_sampling_rate == 24000) ||(opus_sampling_rate == 48000))) // Sampling rates Opus encoder supports.
			opus_sampling_rate = 48000; // We will resample to 48000 hz.

		int opus_error = 0;
		OpusEncoder* opus_encoder = opus_encoder_create(
			opus_sampling_rate, // sampling rate
			1, // channels
			OPUS_APPLICATION_VOIP, // application
			&opus_error
		);
		if(opus_error != OPUS_OK)
			throw glare::Exception("opus_encoder_create failed.");


		//const int ret = opus_encoder_ctl(opus_encoder, OPUS_SET_BITRATE(512000));
		//if(ret != OPUS_OK)
		//	throw glare::Exception("opus_encoder_ctl failed.");
		//-------------------------------------- End Opus init --------------------------------------------------

		uint32 stream_id;
#if defined(EMSCRIPTEN)
		stream_id = 0; // TEMP HACK
#else
		CryptoRNG::getRandomBytes((uint8*)&stream_id, sizeof(stream_id));
#endif

		out_msg_queue->enqueue(new AudioStreamToServerStartedMessage(opus_sampling_rate, /*flags=*/0, /*stream_id=*/stream_id));

		//-------------------------------------- UDP socket init --------------------------------------------------

		const std::vector<IPAddress> server_ips = Networking::doDNSLookup(server_hostname);
		const IPAddress server_ip = server_ips[0];


		std::vector<uint8> encoded_data(100000);

		std::vector<float> pcm_buffer;
		const size_t max_pcm_buffer_size = 48000;

		js::Vector<float, 16> resampled_pcm_buffer;
		glare::AudioResampler resampler;
		js::Vector<float, 16> temp_resampling_buf;

		std::vector<uint8> packet;

		uint32 seq_num = 0;

		Timer time_since_last_stream_to_server_msg_sent;

		//------------------------ Process audio output stream ------------------------
		while(die == 0) // Keep reading audio until we are told to quit
		{
			PlatformUtils::Sleep(2);

			// Poll for messages
			{
				Lock lock(this->getMessageQueue().getMutex());
				if(this->getMessageQueue().unlockedNonEmpty())
				{
					ThreadMessageRef msg = this->getMessageQueue().unlockedDequeue();
					if(msg.isType<InputVolumeScaleChangedMessage>())
					{
						InputVolumeScaleChangedMessage* vol_msg = msg.downcastToPtr<InputVolumeScaleChangedMessage>();
						this->input_vol_scale_factor = vol_msg->input_vol_scale_factor;
					}
				}
			}

			if(time_since_last_stream_to_server_msg_sent.elapsed() > 2.0)
			{
				// Re-send, in case other clients connect
				out_msg_queue->enqueue(new AudioStreamToServerStartedMessage(opus_sampling_rate, /*flags=*/1, /*stream_id=*/stream_id)); // set renew bit in flags
				time_since_last_stream_to_server_msg_sent.reset();
			}


			while(die == 0) // Loop while there is data to be read immediately:
			{
				const size_t write_index = pcm_buffer.size(); // New data will be appended at this position in pcm_buffer.

#if defined(_WIN32) && !USE_RT_AUDIO
				//Timer timer;
				// Get the available data in the shared buffer.
				BYTE* p_data;
				uint32 num_frames_available;
				DWORD flags;
				hr = capture_client->GetBuffer(
					&p_data,
					&num_frames_available,
					&flags, NULL, NULL);

				//conPrint("GetBuffer took " + timer.elapsedString());

				if(hr == AUDCLNT_S_BUFFER_EMPTY)
				{
					//conPrint("AUDCLNT_S_BUFFER_EMPTY");
					break;
				}
				throwOnError(hr);

				//printVar(num_frames_available);

				const int frames_to_copy = myMin((int)max_pcm_buffer_size - (int)pcm_buffer.size(), (int)num_frames_available);
				pcm_buffer.resize(pcm_buffer.size() + frames_to_copy);
				assert(pcm_buffer.size() <= max_pcm_buffer_size);

				if(flags & AUDCLNT_BUFFERFLAGS_SILENT)
				{
					//conPrint("Silent");

					for(int i=0; i<frames_to_copy; i++)
						pcm_buffer[write_index + i] = 0.f;
				}
				else
				{
					// Copy the available capture data to the audio sink.
					// Mix multiple channel audio data to a single channel.
					const float* const src_data = (const float*)p_data;

					if(num_channels == 1)
					{
						for(int i=0; i<frames_to_copy; i++)
							pcm_buffer[write_index + i] = src_data[i];
					}
					else if(num_channels == 2)
					{
						for(int i=0; i<frames_to_copy; i++)
						{
							const float left  = src_data[i*2 + 0];
							const float right = src_data[i*2 + 1];
							const float mixed = (left + right) * 0.5f;
							pcm_buffer[write_index + i] = mixed;
						}
					}
					else
					{
						for(int i=0; i<frames_to_copy; i++)
						{
							float sum = 0;
							for(uint32 c=0; c<num_channels; ++c)
							{
								sum += src_data[i*num_channels + c];
							}
							pcm_buffer[write_index + i] = sum * (1.f / num_channels);
						}
					}
				}
#else
				{
					Lock lock(buffer_mutex);

					if(callback_buffer.empty())
						break;

					const int frames_to_copy = myMin((int)max_pcm_buffer_size - (int)pcm_buffer.size(), (int)callback_buffer.size());
					runtimeCheck(frames_to_copy >= 0);
					pcm_buffer.resize(pcm_buffer.size() + frames_to_copy);
					assert(pcm_buffer.size() <= max_pcm_buffer_size);

					for(int i=0; i<frames_to_copy; i++)
						pcm_buffer[write_index + i] = callback_buffer[i];

					//removeNItemsFromFront(callback_buffer, frames_to_copy);
					callback_buffer.clear();
				}
#endif

				// Apply input_vol_scale_factor to newly captured data, get max abs value in pcm_buffer
				float max_val = 0;
				for(size_t i=write_index; i<pcm_buffer.size(); ++i)
				{
					pcm_buffer[i] = myClamp(pcm_buffer[i] * input_vol_scale_factor, -1.f, 1.f);
					max_val = myMax(max_val, std::fabs(pcm_buffer[i]));
				}

				// Set current level in mic_read_status (used for showing volume indicator in UI)
				{
					Lock lock(mic_read_status->mutex);
					const float smoothed_max = myMax(max_val, 0.95f * mic_read_status->cur_level);
					mic_read_status->cur_level = smoothed_max;
				}

				// "To encode a frame, opus_encode() or opus_encode_float() must be called with exactly one frame (2.5, 5, 10, 20, 40 or 60 ms) of audio data:"
				// We will use 10ms frames.
				const size_t opus_samples_per_frame = opus_sampling_rate / 100;
				
				// While there is enough data in pcm_buffer, keep looping doing the following:
				// Resample to Opus sample rate if needed, feed frame to Opus to encode, then send UDP packet with encoded data to server.
				size_t cur_i = 0; // Samples [0, cur_i) in pcm_buffer have been processed already.
				while(1)
				{
					// Work out how many source samples we need for passing into Opus
					size_t capture_samples_for_frame;
					if(opus_sampling_rate == capture_sampling_rate) // If we don't need to resample (capture sample rate is same as Opus encoding rate):
						capture_samples_for_frame = opus_samples_per_frame;
					else
						capture_samples_for_frame = resampler.numSrcSamplesNeeded(opus_samples_per_frame);

					const size_t remaining_in_buffer = pcm_buffer.size() - cur_i;
					if(remaining_in_buffer < capture_samples_for_frame) // If not enough samples left in pcm_buffer, break
						break;

					if(opus_sampling_rate != capture_sampling_rate)
					{
						// Resample
						resampled_pcm_buffer.resizeNoCopy(opus_samples_per_frame);

						resampler.resample(/*dest samples=*/resampled_pcm_buffer.data(), /*dest samples size=*/opus_samples_per_frame, /*src samples=*/&pcm_buffer[cur_i], /*src samples size=*/capture_samples_for_frame, temp_resampling_buf);
					}

					// Encode the PCM data with Opus.  Writes to encoded_data.
					const opus_int32 encoded_B = opus_encode_float(
						opus_encoder,
						(opus_sampling_rate == capture_sampling_rate) ? &pcm_buffer[cur_i] : resampled_pcm_buffer.data(),
						(int)opus_samples_per_frame, // frame size (in samples)
						encoded_data.data(), // output data
						(opus_int32)encoded_data.size() // max_data_bytes
					);
					//printVar(encoded_B);
					if(encoded_B < 0)
						throw glare::Exception("opus_encode failed: " + toString(encoded_B));

					cur_i += capture_samples_for_frame;

					// Form packet
					const size_t header_size_B = sizeof(uint32) * 3;
					packet.resize(header_size_B + encoded_B);

					// Write packet type (1 = voice)
					const uint32 packet_type = 1;
					std::memcpy(packet.data(), &packet_type, sizeof(uint32));

					// Write client UID
					const uint32 client_avatar_uid_uint32 = (uint32)client_avatar_uid.value();
					std::memcpy(packet.data() + 4, &client_avatar_uid_uint32, sizeof(uint32));

					// Write sequence number
					std::memcpy(packet.data() + 8, &seq_num, sizeof(uint32));
					seq_num++;

					if(encoded_B > 0)
						std::memcpy(packet.data() + header_size_B, encoded_data.data(), encoded_B);

					// Send packet to server
					udp_socket->sendPacket(packet.data(), packet.size(), server_ip, server_port);
				}

				// Remove first cur_i samples from pcm_buffer, copy remaining data to front of buffer
				ContainerUtils::removeNItemsFromFront(pcm_buffer, cur_i);

#if defined(_WIN32) && !USE_RT_AUDIO
				hr = capture_client->ReleaseBuffer(num_frames_available);
				throwOnError(hr);
#endif
			}
		}

		opus_encoder_destroy(opus_encoder);

#if USE_RT_AUDIO
		if(audio.isStreamOpen())
		{
			if(audio.isStreamRunning())
				audio.stopStream();

			audio.closeStream();
		}
#endif
	}
	catch(glare::Exception& e)
	{
		conPrint("MicReadThread::doRun() Excep: " + e.what());
		out_msg_queue->enqueue(new LogMessage("MicReadThread: " + e.what()));
	}

	{
		Lock lock(mic_read_status->mutex);
		mic_read_status->cur_level = 0;
	}

	out_msg_queue->enqueue(new AudioStreamToServerEndedMessage());

	conPrint("MicReadThread finished.");
}


} // end namespace glare
