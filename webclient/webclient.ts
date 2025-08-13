/*=====================================================================
webclient.ts
------------
Copyright Glare Technologies Limited 2023 -
=====================================================================*/


import * as THREE from './build/three.module.js';
import { KTX2Loader } from './examples/jsm/loaders/KTX2Loader.js';
import { EXRLoader } from './examples/jsm/loaders/EXRLoader.js';
import { BufferIn, readDouble, readStringFromStream, readUInt32 } from './bufferin.js';
import { BufferOut } from './bufferout.js';
import * as downloadqueue from './downloadqueue.js';
import BVH, { Triangles, createIndex } from './physics/bvh.js';
import PhysicsWorld from './physics/world.js';
import CameraController from './cameraController.js';
import { ScalarVal, WorldMaterial } from './worldmaterial.js';
import {
	Colour3f,
	readParcelIDFromStream,
	readUIDFromStream,
	readUserIDFromStream,
	readVec3dFromStream,
	readVec3fFromStream,
	Vec3d,
	Vec3f,
	writeUID
} from './types.js';
import { Avatar } from './avatar.js';
import { decRefCount, RefCountWrapper, removeDotAndExtension, toUTF8Array } from './utils.js';
import { Parcel, readParcelFromNetworkStreamGivenID } from './parcel.js';
import {
	MESH_LOADED,
	MESH_LOADING,
	MESH_NOT_LOADED,
	readWorldObjectFromNetworkStreamGivenUID,
	WorldObject,
	getLODModelURLForLevel,
	getBVHKey
} from './worldobject.js';
import { ProximityLoader } from './proximityloader.js';
import { buildBatchedMesh, buildVoxelMesh } from './loader/MeshBuilder.js';
import MeshLoader from './loader/MeshLoader.js';
import { BMesh, BMESH_TYPE, LoaderError, MeshLoaderResponse, VoxelMesh } from './loader/message.js';
import { LoadItemQueue, LoadItemQueueItem } from './loaditemqueue.js';
import { floatMod, clamp } from './maths/functions.js';
import { CustomStandardMaterial } from './shaderMaterial.js';

const ws = new WebSocket('wss://' + window.location.host, 'substrata-protocol');
ws.binaryType = 'arraybuffer'; // Change binary type from "blob" to "arraybuffer"

const load_item_queue = new LoadItemQueue();

// Half the number of 'CPUs' or 2 workers
const mesh_loader = new MeshLoader(load_item_queue, Math.floor((navigator.hardwareConcurrency ?? 4) / 2));

mesh_loader.onmessage = (resp: MeshLoaderResponse) => {
	// Build the returned BVH from the transferred buffers...
	let bvh: BVH;
	if (resp.bvh != null) {
		const triangles = new Triangles(
			new Float32Array(resp.bvh.triPositionBuffer),
			createIndex(resp.bvh.indexType, resp.bvh.triIndexBuffer),
			3 // The stride is always 3 because it was created in the worker for this instance
		);
		bvh = new BVH(triangles, {
			index: new Uint32Array(resp.bvh.bvhIndexBuffer),
			nodeCount: resp.bvh.nodeCount,
			aabbBuffer: new Float32Array(resp.bvh.aabbBuffer),
			dataBuffer: new Uint32Array(resp.bvh.dataBuffer)
		});
	}

	if(resp.bMesh != null)
		addBatchedMeshToScene(resp.bMesh, bvh);
	else if(resp.voxelMesh != null)
		addVoxelMeshToScene(resp.voxelMesh, bvh);
	else
		console.log('Error, expected bMesh or voxelMesh');
};

mesh_loader.onerror = (err: LoaderError) => {
	console.error('err:', err.message);
	if(err.type === BMESH_TYPE) { // BMesh errors are always type 1
		if(loading_model_URL_set.has(err?.url)) {
			loading_model_URL_set.delete(err?.url);
		}

		if(loading_model_URL_to_world_ob_map.has(err?.url)) {
			loading_model_URL_to_world_ob_map.delete(err?.url);
		}

		num_resources_downloading--;
	}
};

const texture_loader = new THREE.TextureLoader();
const USE_KTX_TEXTURES = true;


const physics_world = new PhysicsWorld();

const STATE_INITIAL = 0;
const STATE_READ_HELLO_RESPONSE = 1;
const STATE_READ_PROTOCOL_RESPONSE = 2;
const STATE_READ_SERVER_PROTOCOL_VERSION = 3;
const STATE_READ_CLIENT_AVATAR_UID = 4;

let protocol_state = 0;

const CyberspaceProtocolVersion = 38;
const CyberspaceHello = 1357924680;
const ClientProtocolOK = 10000;
const ClientProtocolTooOld = 10001;
const ClientProtocolTooNew = 10002;

const AvatarCreated = 1000;
const AvatarDestroyed = 1001;
const AvatarTransformUpdate = 1002;
const AvatarFullUpdate = 1003;
const CreateAvatar = 1004;
const AvatarIsHere = 1005;

const ChatMessageID = 2000;

const QueryObjects = 3020; // Client wants to query objects in certain grid cells
const ObjectInitialSend = 3021;
const QueryObjectsInAABB = 3022;
const ParcelCreated = 3100;

const LogInMessage = 8000;
const LoggedInMessageID = 8003;

const TimeSyncMessage = 9000;




function toString(x: any) {
	return x.toString();
}


function writeStringToWebSocket(ws: WebSocket, str: string)
{
	const utf8_array = toUTF8Array(str);

	ws.send(new Uint32Array([utf8_array.length]));
	ws.send(new Uint8Array(utf8_array));
}


ws.onopen = function () {
	console.log('onopen()');

	ws.send(new Uint32Array([CyberspaceHello]));

	ws.send(new Uint32Array([CyberspaceProtocolVersion]));

	const ConnectionTypeUpdates = 500;
	ws.send(new Uint32Array([ConnectionTypeUpdates]));

	writeStringToWebSocket(ws, world); // World to connect to

	const aabb = proximity_loader.setCameraPosForNewConnection(cam_controller.positionV3);
	// console.log("Initial query AABB: " + aabb.toString());

	// Send QueryObjectsInAABB for initial volume around camera to server
	{
		const buffer_out = new BufferOut();
		buffer_out.writeUInt32(QueryObjectsInAABB);
		buffer_out.writeUInt32(0); // message length - to be updated.

		// Write camera position
		buffer_out.writeDouble(cam_controller.position[0]);
		buffer_out.writeDouble(cam_controller.position[1]);
		buffer_out.writeDouble(cam_controller.position[2]);

		buffer_out.writeFloat(aabb[0]);
		buffer_out.writeFloat(aabb[1]);
		buffer_out.writeFloat(aabb[2]);
		buffer_out.writeFloat(aabb[3]);
		buffer_out.writeFloat(aabb[4]);
		buffer_out.writeFloat(aabb[5]);

		buffer_out.updateMessageLengthField();
		buffer_out.writeToWebSocket(ws);
	}
};



const MAX_OB_LOAD_DISTANCE_FROM_CAM = 1000;
const LOAD_EVERYTHING_DIST = 150.0; // Show every object, no matter how big, within a certain distance.


const parcels = new Map<number, Parcel>();
const world_objects = new Map<bigint, WorldObject>();
const avatars = new Map<bigint, Avatar>();
let client_avatar_uid: bigint = null;

//Log the messages that are returned from the server
ws.onmessage = function (event: MessageEvent) {
	//console.log("onmessage()");
	//console.log("From Server:" + event.data + ", event.data.byteLength: " + event.data.byteLength);

	let z = 0;
	const buffer = new BufferIn(event.data);
	while (!buffer.endOfStream()) {

		//console.log("Reading, buffer.read_index: " + buffer.read_index);

		if (protocol_state == STATE_INITIAL) {
			// Read hello_response
			const hello_response: number = readUInt32(buffer);
			if (hello_response != CyberspaceHello)
				throw 'hello_response was invalid: ' + hello_response.toString();

			//console.log("Read hello_response from server.");
			protocol_state = STATE_READ_HELLO_RESPONSE;
		}
		else if (protocol_state == STATE_READ_HELLO_RESPONSE) {
			// Read protocol_response
			const protocol_response: number = readUInt32(buffer);
			if (protocol_response == ClientProtocolOK) { }
			else if (protocol_response == ClientProtocolTooOld) {
				throw 'client protocol version is too old';
			}
			else if (protocol_response == ClientProtocolTooNew) {
				throw 'client protocol version is too new';
			}
			else
				throw 'protocol_response was invalid: ' + protocol_response.toString();

			//console.log("Read protocol_response from server.");
			protocol_state = STATE_READ_PROTOCOL_RESPONSE;
		}
		else if (protocol_state == STATE_READ_PROTOCOL_RESPONSE) {
			// Read server protocol version
			let server_protocol_version = readUInt32(buffer);

			console.log("Read server_protocol_version from server: " + server_protocol_version.toString());

			protocol_state = STATE_READ_SERVER_PROTOCOL_VERSION;
		}
		else if (protocol_state == STATE_READ_SERVER_PROTOCOL_VERSION) {

			// Read client_avatar_uid
			client_avatar_uid = readUIDFromStream(buffer);
			client_avatar.uid = client_avatar_uid;

			//console.log("Read client_avatar_uid from server: " + client_avatar_uid);
			protocol_state = STATE_READ_CLIENT_AVATAR_UID;
		}
		else if (protocol_state == STATE_READ_CLIENT_AVATAR_UID) {

			const msg_start_read_index = buffer.getReadIndex();
			const msg_type = readUInt32(buffer);
			const msg_len = readUInt32(buffer);
			// console.log("Read msg_type: " + msg_type + ", len: " + msg_len);

			if (msg_type == TimeSyncMessage) {
				const global_time = readDouble(buffer);
				//console.log("Read TimeSyncMessage with global time: " + global_time);
			}
			else if (msg_type == ParcelCreated) {
				const parcel_id = readParcelIDFromStream(buffer);
				//console.log("parcel_id: ", parcel_id);
				const parcel = readParcelFromNetworkStreamGivenID(buffer);
				parcel.parcel_id = parcel_id;

				parcels.set(parcel_id, parcel);

				//console.log("Read ParcelCreated msg, parcel_id: " + parcel_id);

				//addParcelGraphics(parcel)
			}
			else if (msg_type == ObjectInitialSend) {
				// console.log("received ObjectInitialSend...");

				const object_uid: bigint = readUIDFromStream(buffer);

				const world_ob: WorldObject = readWorldObjectFromNetworkStreamGivenUID(buffer);
				world_ob.uid = object_uid;

				// When a client moves and a new cell comes into proximity, a QueryObjects message is sent to the server.
				// The server replies with ObjectInitialSend messages.
				// This means that the client may already have the object inserted, when moving back into a cell previously in proximity.
				// We want to make sure not to add the object twice or load it into the graphics engine twice.
				if (!world_objects.has(object_uid)) {

					// let dist_from_cam = toThreeVector3(world_ob.pos).distanceTo(camera.position);
					const dist_from_cam = toThreeVector3(world_ob.pos).distanceTo(cam_controller.positionV3);

					let new_in_proximity = false;
					if (dist_from_cam > LOAD_EVERYTHING_DIST) { // If further than x metres away:

						const proj_len = world_ob.AABBLongestLength() / dist_from_cam;
						new_in_proximity = proj_len > 0.05;
					}
					else {
						new_in_proximity = true;
					}


					world_ob.in_proximity = new_in_proximity;
					world_ob.current_lod_level = world_ob.getLODLevel(cam_controller.positionV3);
					if (world_ob.in_proximity) {
						loadModelForObject(world_ob);
					}

					world_objects.set(object_uid, world_ob);
					//console.log("Read ObjectInitialSend msg, object_uid: " + object_uid);
				}
			}
			else if (msg_type == ChatMessageID) {
				const name = readStringFromStream(buffer);
				const msg = readStringFromStream(buffer);

				console.log('Chat message: ' + name + ': ' + msg);

				appendChatMessage(name + ': ' + msg);
			}
			else if (msg_type == AvatarCreated) {

				const avatar = new Avatar();
				avatar.readFromStream(buffer);

				avatars.set(avatar.uid, avatar);

				console.log('Avatar ' + avatar.name + ' joined');

				appendChatMessage(avatar.name + ' joined');

				updateOnlineUsersList();

				if (avatar.uid != client_avatar_uid) {
					loadModelForAvatar(avatar);
				}
			}
			else if (msg_type == AvatarIsHere) {

				const avatar = new Avatar();
				avatar.readFromStream(buffer);

				avatars.set(avatar.uid, avatar);

				console.log('Avatar ' + avatar.name + ' is here');

				appendChatMessage(avatar.name + ' is here');

				updateOnlineUsersList();

				if (avatar.uid != client_avatar_uid) {
					loadModelForAvatar(avatar);
				}
			}
			else if (msg_type == AvatarDestroyed) {
				const avatar_uid = readUIDFromStream(buffer);

				const avatar = avatars.get(avatar_uid);
				avatars.delete(avatar_uid);

				if (avatar) {

					appendChatMessage(avatar.name + ' left.');
					console.log('Avatar ' + avatar.name + ' left');

					// Remove avatar mesh
					scene.remove(avatar.mesh);
				}

				updateOnlineUsersList();
			}
			else if (msg_type == AvatarTransformUpdate) {

				const avatar_uid = readUIDFromStream(buffer);
				const pos = readVec3dFromStream(buffer);
				const rotation = readVec3fFromStream(buffer);
				const anim_state = buffer.readUInt32();


				const avatar = avatars.get(avatar_uid);
				if (avatar) {
					avatar.pos = pos;
					avatar.rotation = rotation;
					avatar.anim_state = anim_state;
				}
			}
			else if (msg_type == AvatarFullUpdate) {

				console.log('AvatarFullUpdate');

				const avatar_uid = readUIDFromStream(buffer);
				const avatar = avatars.get(avatar_uid);
				if (avatar) {
					avatar.readFromStreamGivenUID(buffer);
				}
				else {
					const avatar = new Avatar();
					avatar.readFromStreamGivenUID(buffer);
				}

				//avatars.set(avatar.uid, avatar);

				if (avatar.uid != client_avatar_uid) {// && avatar.mesh_state != MESH_LOADED) {

					loadModelForAvatar(avatar);
				}
			}
			else if (msg_type == LoggedInMessageID) {

				const logged_in_user_id = readUserIDFromStream(buffer);
				const logged_in_username = buffer.readStringLengthFirst();
				client_avatar.avatar_settings.readFromStream(buffer);

				console.log('Logged in as ' + logged_in_username);

				// Send create avatar message now that we have our avatar settings.
				const av_buf = new BufferOut();
				av_buf.writeUInt32(CreateAvatar);
				av_buf.writeUInt32(0); // will be updated with length
				client_avatar.writeToStream(av_buf);
				av_buf.updateMessageLengthField();
				av_buf.writeToWebSocket(ws);
			}
			else {
				// Unhandled message type, ignore it.
				// console.log("Unhandled message type " + msg_type);
			}

			// Advance past any remaining, unread data in the message.
			if(msg_start_read_index + msg_len > buffer.getReadIndex()) {
				buffer.setReadIndex(msg_start_read_index + msg_len);
			}
		}
		else
			throw 'invalid protocol_state';

		z++;
		if (z > 100000) {
			throw 'oh no, infinite loop!';
		}
	}
};

// Fired when a connection with a WebSocket is closed,
ws.onclose = function (event: CloseEvent) {
	console.log('WebSocket onclose()', event);
};

// Fired when a connection with a WebSocket has been closed because of an error,
ws.onerror = function (event: Event) {
	console.error('WebSocket error observed:', event);
};


function appendChatMessage(msg: string) {
	const node = document.createElement('div');
	node.textContent = msg;
	document.getElementById('chatmessages').appendChild(node);

	document.getElementById('chatmessages').scrollTop = document.getElementById('chatmessages').scrollHeight;
}


function onChatSubmitted(event: Event) {
	console.log('Chat submitted');

	//let msg = event.target.elements.chat_message.value;
	const msg = (<HTMLInputElement>document.getElementById('chat_message')).value;
	console.log('msg: ' + msg);


	const buffer_out = new BufferOut();
	buffer_out.writeUInt32(ChatMessageID);
	buffer_out.writeUInt32(0); // will be updated with length
	buffer_out.writeStringLengthFirst(msg); // message
	buffer_out.updateMessageLengthField();
	buffer_out.writeToWebSocket(ws);


	// log.textContent = `Form Submitted! Time stamp: ${event.timeStamp}`;
	event.preventDefault();

	//document.getElementById('chat_message').textContent = ""; // Clear chat box
	(<HTMLFormElement>document.getElementById('chatform')).reset(); // Clear chat box
}

const form = document.getElementById('form');
document.getElementById('chatform').addEventListener('submit', onChatSubmitted);


//document.getElementById("chat_message").addEventListener("keyup", function (event) {
//    console.log("keyup");
//    event.preventDefault();
//    if (event.keyCode === 13) {
//        onChatSubmitted(event);
//    }
//});



function loadModelForAvatar(avatar: Avatar) {

	const default_model_url = 'xbot_glb_3242545562312850498.bmesh';

	if (avatar.avatar_settings.model_url.length == 0) {

		avatar.avatar_settings.model_url = default_model_url;
		avatar.avatar_settings.materials = Array(2);

		avatar.avatar_settings.materials[0] = new WorldMaterial();
		avatar.avatar_settings.materials[0].setDefaults();
		avatar.avatar_settings.materials[0].colour_rgb = new Colour3f(0.5, 0.6, 0.7);
		avatar.avatar_settings.materials[0].metallic_fraction = new ScalarVal(0.5, '');
		avatar.avatar_settings.materials[0].roughness = new ScalarVal(0.3, '');

		avatar.avatar_settings.materials[1] = new WorldMaterial();
		avatar.avatar_settings.materials[1].setDefaults();
		avatar.avatar_settings.materials[1].colour_rgb = new Colour3f(0.8, 0.8, 0.8);
		avatar.avatar_settings.materials[1].roughness = new ScalarVal(0.0, '');

		const EYE_HEIGHT = 1.67;

		const to_z_up = new THREE.Matrix4();
		to_z_up.set(
			1, 0, 0, 0,
			0, 0, -1, 0,
			0, 1, 0, 0,
			0, 0, 0, 1
		);
		const trans = new THREE.Matrix4().makeTranslation(0, 0, -EYE_HEIGHT);
		const product = new THREE.Matrix4().multiplyMatrices(trans, to_z_up);
		avatar.avatar_settings.pre_ob_to_world_matrix = product.toArray(); // returns in column-major format, which we want.
	}
	console.log('Loading avatar model: ' + avatar.avatar_settings.model_url);
	const ob_lod_level = 0;
	const model_lod_level = 0;
	const world_axis = new Vec3f(0, 0, 1);
	const angle = 0;
	const ob_aabb_longest_len = 2;

	loadModelAndAddToScene(avatar, avatar.avatar_settings.model_url, ob_aabb_longest_len, ob_lod_level, model_lod_level, avatar.avatar_settings.materials, avatar.pos, new Vec3f(1, 1, 1), world_axis, angle);
}


function updateOnlineUsersList() {

	//document.getElementById("onlineuserslist").textContent = ""; // clear div
	//
	//for (const avatar of avatars.values()) {
	//    let node = document.createElement("div");
	//    node.textContent = avatar.name;
	//    document.getElementById("onlineuserslist").appendChild(node);
	//}
}


function toThreeVector3(v: Vec3f | Vec3d): THREE.Vector3 {
	return new THREE.Vector3(v.x, v.y, v.z);
}


class GeomInfo {
	geometry: THREE.BufferGeometry;
	triangles: Triangles;
	use_count = 0; /// Number of world objects and avatars using this geometry.
}
const url_to_geom_map = new Map<string, GeomInfo>(); // Map from model_url to 3.js geometry object and triangle list

const loading_model_URL_set = new Set<string>(); // set of URLS of models that we are currently loading/downloading.


//const url_to_texture_map = new Map<string, THREE.Texture>(); // Map from texture url to 3.js Texture object
const url_to_texture_map = new Map<string, RefCountWrapper<THREE.Texture>>(); // Map from texture url to wrapped 3.js Texture object

const loading_texture_URL_set = new Set<string>(); // Set of URL for textures that are being loaded.


const loading_model_URL_to_world_ob_map = new Map<string, Set<any>>(); // Map from a URL of a loading model to a set of WorldObjects or Avatars using that model.

const loading_texture_URL_to_materials_map = new Map<string, Array<[WorldMaterial, THREE.Material]>>(); // Map from a URL of a loading texture to a list of [world material, three material] pairs using that texture.

const flip_y_matrix = new THREE.Matrix3();
flip_y_matrix.set(1, 0, 0, 0, -1, 0, 0, 0, 1);


// Sets fields of a three.js material from a Substrata WorldMaterial.
// If the world material has a texture, will start downloading it, by enqueuing an item onto the download queue, if the texture is not already downloaded or downloading.
// three_mat has type THREE.Material and probably THREE.MeshStandardMaterial
function setThreeJSMaterial(three_mat: THREE.Material, world_mat: WorldMaterial, ob_pos: Vec3d, ob_aabb_longest_len: number, ob_lod_level: number) {
	three_mat.color = new THREE.Color(world_mat.colour_rgb.r, world_mat.colour_rgb.g, world_mat.colour_rgb.b);
	three_mat.color.convertSRGBToLinear();
	three_mat.metalness = world_mat.metallic_fraction.val;
	three_mat.roughness = world_mat.roughness.val;

	three_mat.side = THREE.DoubleSide; // Enable backface rendering as well.

	// This should use the shader derivatives to calculate the normal (but will still need work)
	// three_mat.flatShading = true;
	three_mat.flatShading = false;

	three_mat.opacity = (world_mat.opacity.val < 1.0) ? 0.3 : 1.0;
	three_mat.transparent = world_mat.opacity.val < 1.0;

	three_mat.envMap = env_tex;
	three_mat.envMapIntensity = ENV_TEX_INTENSITY;

	if (world_mat.opacity.val < 1.0) {
		// Try and make this look vaguely like the native engine transparent shader, which has quite desaturated colours for transparent mats.
		three_mat.color.r = 0.6 + three_mat.color.r * 0.4;
		three_mat.color.g = 0.6 + three_mat.color.g * 0.4;
		three_mat.color.b = 0.6 + three_mat.color.b * 0.4;
	}

	//console.log("world_mat.colour_texture_url:" + world_mat.colour_texture_url);
	if (world_mat.colour_texture_url.length > 0) {
		// function getLODTextureURLForLevel(world_mat, base_texture_url, level, has_alpha)
		//console.log("world_mat.flags: " + world_mat.flags);
		//console.log("world_mat.colourTexHasAlpha: " + world_mat.colourTexHasAlpha());
		const color_tex_has_alpha = world_mat.colourTexHasAlpha();
		let lod_texture_URL = world_mat.getLODTextureURLForLevel(world_mat.colour_texture_url, ob_lod_level, color_tex_has_alpha);

		if (USE_KTX_TEXTURES)
			lod_texture_URL = removeDotAndExtension(lod_texture_URL) + '.ktx2';
		//console.log('new lod_texture_URL: ' + lod_texture_URL);

		if (color_tex_has_alpha)
			three_mat.alphaTest = 0.5;

		//console.log("setThreeJSMaterial(): lod_texture_URL: " + lod_texture_URL);

		let new_texture = null;
		let new_referenced_texture_URL = null; // Note that this is only set to a non-null value if we increment a reference count on the texture.
		let is_empty_tex = false;
		if (url_to_texture_map.has(lod_texture_URL)) { // This texture has already been loaded, use it:
			// console.log("Using texture '" + lod_texture_URL + "' from url_to_texture_map");
			const entry = url_to_texture_map.get(lod_texture_URL);
			entry.incRef();
			const existing_texture: THREE.Texture = entry.ref; 
			new_texture = existing_texture.clone(); // Clone so that changes to e.g. the tex matrix don't effect this texture applied to other objects.

			new_referenced_texture_URL = lod_texture_URL;
		}
		else { // Else texture has not been loaded:

			// Add this material to the list of materials waiting for the texture
			if (!loading_texture_URL_to_materials_map.has(lod_texture_URL)) // Initialise with empty list if needed
				loading_texture_URL_to_materials_map.set(lod_texture_URL, []);
			loading_texture_URL_to_materials_map.get(lod_texture_URL).push([world_mat, three_mat]);

			if (loading_texture_URL_set.has(lod_texture_URL)) { // Are we already loading the texture?
				// Just wait for the texture to load
			}
			else {
				// We are not currently loading the texture, so start loading it:
				// Enqueue downloading of the texture
				const size_factor = downloadqueue.sizeFactorForAABBWSLongestLen(ob_aabb_longest_len);
				download_queue.enqueueItem(new downloadqueue.DownloadQueueItem(toThreeVector3(ob_pos), size_factor, lod_texture_URL, /*is_texture=*/true));

				loading_texture_URL_set.add(lod_texture_URL); // Add to set of loading textures.
			}

			if(three_mat.map && three_mat.map.image) { // If the current material already has a texture assigned (from a different LOD level)
				// Then just keep existing texture along with its mipmaps etc.
				// console.log("Using existing image as placeholder for  '" + lod_texture_URL + "' ");
			}
			else {
				// console.log("Making new empty texture for  '" + lod_texture_URL + "' ");
				new_texture = new THREE.Texture(); // Create an empty texture so we can set the tex matrix for it below.
				is_empty_tex = true;
				//new_texture.image = placeholder_texture.image; // else use placeholder texture
				//new_texture.mipmaps = placeholder_texture.mipmaps;
			}
		}

		if (new_texture) {
			if (!is_empty_tex)
				new_texture.needsUpdate = true; // Seems to be needed to get the texture to show.

			new_texture.encoding = THREE.sRGBEncoding;
			new_texture.wrapS = THREE.RepeatWrapping;
			new_texture.wrapT = THREE.RepeatWrapping;
			new_texture.flipY = false;

			new_texture.matrixAutoUpdate = false; // Set this to false if you are specifying the uv-transform matrix directly.
			const tex_matrix = new THREE.Matrix3();
			tex_matrix.set(
				world_mat.tex_matrix.x, world_mat.tex_matrix.y, 0,
				world_mat.tex_matrix.z, world_mat.tex_matrix.w, 0,
				0, 0, 1
			);

			new_texture.matrix = tex_matrix.premultiply(flip_y_matrix); // Flip the texture to keep consistency between native and web.

			three_mat.map = new_texture;

			// Decrement ref count for the old texture assigned to this material, if any.
			// Note that we do this after incrementing the ref count for the new texture, so that if they are the same texture, it's not freed.
			if (world_mat.loaded_colour_texture_URL)
				decRefCount(url_to_texture_map, world_mat.loaded_colour_texture_URL);

			world_mat.loaded_colour_texture_URL = new_referenced_texture_URL; // Finally assign the new texture URL, if any.
		}
	}
}


// Starts the process of adding a 3d model to the three.js scene.
// If the 3d model resource is not already loading/downloaded, then it will enqueue the resource URL to be downloaded/loaded onto the download queue,
// and the actual model will be loaded into the three.js scene later.
function loadModelForObject(world_ob: WorldObject) {

	if (true) {

		// Check object is in proximity.  Otherwise we might load objects outside of proximity, for example large objects transitioning from LOD level 1 to LOD level 2 or vice-versa.
		if(!world_ob.in_proximity)
			return;

		//console.log("==================addWorldObjectGraphics (ob uid: " + world_ob.uid + ")=========================")

		const ob_lod_level = world_ob.getLODLevel(cam_controller.positionV3);
		const model_lod_level = world_ob.getModelLODLevel(cam_controller.positionV3);
		const aabb_longest_len = world_ob.AABBLongestLength();
		//console.log("model_lod_level: " + model_lod_level);

		// If we have a model loaded, that is not the placeholder model, and it has the correct LOD level, we don't need to do anything.
		if (world_ob.mesh && (world_ob.loaded_model_lod_level == model_lod_level) && (world_ob.loaded_lod_level == ob_lod_level)) {
			// console.log("loadModelForObject(): Currently loaded lod levels are correct, returning...");
			return;
		}
			
		
		if(world_ob.compressed_voxels && (world_ob.compressed_voxels.byteLength > 0)) { // If this is a voxel object:

			const mats_transparent = world_ob.mats.map(e => e.opacity.val < 1.0);

			const copy = new Uint8Array(new ArrayBuffer(world_ob.compressed_voxels.byteLength));
			copy.set(new Uint8Array(world_ob.compressed_voxels));

			const aabb_longest_len = world_ob.AABBLongestLength();
			const centroid = new Float32Array([
				world_ob.cached_centroid_ws_x,
				world_ob.cached_centroid_ws_y,
				world_ob.cached_centroid_ws_z
			]);

			load_item_queue.enqueueItem(new LoadItemQueueItem({
				pos: centroid,
				sizeFactor: aabb_longest_len,
				voxels: {
					uid: world_ob.uid,
					compressedVoxels: copy.buffer,
					mats_transparent,
					ob_lod_level,
					model_lod_level
				}
			}));
		}
		else if(world_ob.model_url !== '') {

			const url = getLODModelURLForLevel(world_ob.model_url, model_lod_level);

			loadModelAndAddToScene(world_ob, url, aabb_longest_len, ob_lod_level, model_lod_level, world_ob.mats, world_ob.pos, world_ob.scale, world_ob.axis, world_ob.angle);
		}
	}
	else {

		// const xspan = world_ob.aabb_ws_max.x - world_ob.aabb_ws_min.x;
		// const yspan = world_ob.aabb_ws_max.y - world_ob.aabb_ws_min.y;
		// const zspan = world_ob.aabb_ws_max.z - world_ob.aabb_ws_min.z;
		// 
		// const geometry = new THREE.BoxGeometry();
		// const material = new CustomStandardMaterial({ color: 0xaaaaaa });
		// 
		// const cube = new THREE.Mesh(geometry, material);
		// cube.position.copy(new THREE.Vector3(world_ob.aabb_ws_min.x + xspan / 2, world_ob.aabb_ws_min.y + yspan / 2, world_ob.aabb_ws_min.z + zspan / 2));
		// cube.scale.copy(new THREE.Vector3(xspan, yspan, zspan));
		// scene.add(cube);
	}
}

function addVoxelMeshToScene (voxelData: VoxelMesh, bvh: BVH): void {
	const uid = voxelData.uid;
	const loaded_ob_lod_level = voxelData.ob_lod_level;
	const loaded_model_lod_level = voxelData.model_lod_level;
	const [geometry, subsample_factor] = buildVoxelMesh(voxelData);

	const world_ob = world_objects.get(uid);
	console.assert(world_ob != null);

	if (world_ob.in_proximity) { // Object may have moved out of proximity to camera by the time the voxel mesh has been built, don't apply it in this case.

		const ob_lod_level = world_ob.getLODLevel(cam_controller.positionV3); // Used for determining which texture LOD level to load
		const ob_model_lod_level = clamp(ob_lod_level, 0, world_ob.max_model_lod_level);

		// Check the object wants this particular LOD level model right now:
		if (ob_model_lod_level == loaded_model_lod_level) {

			const old_mats = world_ob.mesh ? world_ob.mesh.material : null;
			const aabb_longest_len = world_ob.AABBLongestLength();

			const three_mats = [];
			const mat_conf = { geoNormals: true, generateUVs: true };
			for (let i = 0; i < world_ob.mats.length; ++i) {
				const three_mat = old_mats ? old_mats[i] : new CustomStandardMaterial({},mat_conf);
				setThreeJSMaterial(three_mat, world_ob.mats[i], world_ob.pos, aabb_longest_len, ob_lod_level);
				three_mats.push(three_mat);
			}

			removeAndDeleteGLObjectForOb(world_ob, /*remove_and_delete_materials=*/true);
			removeAndDeletePhysicsObjectForOb(world_ob);

			const mesh = new THREE.Mesh(geometry, three_mats);

			const axis = new THREE.Vector3(world_ob.axis.x, world_ob.axis.y, world_ob.axis.z);
			axis.normalize();

			mesh.matrixAutoUpdate = false;

			const rot_matrix = new THREE.Matrix4();
			rot_matrix.makeRotationAxis(axis, world_ob.angle);

			const scale_matrix = new THREE.Matrix4();
			scale_matrix.makeScale(world_ob.scale.x * subsample_factor, world_ob.scale.y * subsample_factor, world_ob.scale.z * subsample_factor);

			const trans_matrix = new THREE.Matrix4();
			trans_matrix.makeTranslation(world_ob.pos.x, world_ob.pos.y, world_ob.pos.z);

			// T R S
			mesh.matrix = to_y_up_matrix.clone();
			mesh.matrix.multiply(trans_matrix);
			mesh.matrix.multiply(rot_matrix);
			mesh.matrix.multiply(scale_matrix);

			scene.add(mesh);

			mesh.castShadow = true;
			mesh.receiveShadow = true;

			world_ob.loaded_lod_level = ob_lod_level;
			world_ob.loaded_model_lod_level = loaded_model_lod_level;
			world_ob.mesh = mesh;
			world_ob.mesh_state = MESH_LOADED;

			world_ob.bvh = bvh;
			registerPhysicsObject(world_ob, bvh, mesh);
		} else {
			// console.log("!!!!!!!!Not applying loaded voxel model, wrong LOD, ob_model_lod_level: " + ob_model_lod_level + ", loaded_model_lod_level: " + loaded_model_lod_level);
		}
	}
}

// Make a THREE.Mesh object, assign it the geometry, and make some three.js materials for it, based on WorldMaterials passed in.
// Old materials are also passed in, which come from the model with a different LOD level.  may be null.
// Returns mesh (THREE.Mesh)
function makeMeshAndAddToScene(geometry: THREE.BufferGeometry, 
	mats: Array<WorldMaterial>, 
	old_mats: Array<WorldMaterial> | null, 
	pos: Vec3d, scale: Vec3f, world_axis: Vec3f, angle: number, ob_aabb_longest_len: number, ob_lod_level: number): THREE.Mesh {

	const use_vert_colours = (geometry.getAttribute('color') !== undefined);

	let three_mats = null;
	if(old_mats) {
		// Just update the old materials (allows using existing textures as placeholders)
		console.assert(old_mats.length === mats.length);
		three_mats = old_mats;
	}
	else {
		const geoNormals = geometry.getAttribute('normal') == null;
		three_mats = [];
		for (let i = 0; i < mats.length; ++i)
			three_mats.push(new CustomStandardMaterial({ vertexColors: use_vert_colours }, { geoNormals } ));
	}

	for (let i = 0; i < mats.length; ++i)
		setThreeJSMaterial(three_mats[i], mats[i], pos, ob_aabb_longest_len, ob_lod_level);

	const mesh = new THREE.Mesh(geometry, three_mats);
	//	mesh.position.copy(new THREE.Vector3(pos.x, pos.y, pos.z));
	//	mesh.scale.copy(new THREE.Vector3(scale.x, scale.y, scale.z));
	//
	const axis = new THREE.Vector3(world_axis.x, world_axis.y, world_axis.z);
	axis.normalize();
	//	const q = new THREE.Quaternion();
	//	q.setFromAxisAngle(axis, angle);
	//	mesh.setRotationFromQuaternion(q);

	mesh.matrixAutoUpdate = false;

	const rot_matrix = new THREE.Matrix4();
	rot_matrix.makeRotationAxis(axis, angle);

	const scale_matrix = new THREE.Matrix4();
	scale_matrix.makeScale(scale.x, scale.y, scale.z);

	const trans_matrix = new THREE.Matrix4();
	trans_matrix.makeTranslation(pos.x, pos.y, pos.z);

	// T R S
	mesh.matrix = to_y_up_matrix.clone();
	mesh.matrix.multiply(trans_matrix);
	mesh.matrix.multiply(rot_matrix);
	mesh.matrix.multiply(scale_matrix);

	scene.add(mesh);

	mesh.castShadow = true;
	mesh.receiveShadow = true;

	return mesh;
}


let num_resources_downloading = 0; // Total number of resources (models + textures) currently being downloaded.


function startDownloadingResource(download_queue_item: downloadqueue.DownloadQueueItem) {

	num_resources_downloading++;

	if (download_queue_item.is_texture) {

		const use_loader = USE_KTX_TEXTURES ? ktx_loader : texture_loader;
		use_loader.load('resource/' + download_queue_item.URL,
			function (texture) { // onLoad callback
				num_resources_downloading--;

				//console.log("Loaded texture '" + download_queue_item.URL + "'.");

				// There should be 1 or more materials that use this texture.
				const waiting_mats = loading_texture_URL_to_materials_map.get(download_queue_item.URL);
				let num_refs_added = 0;
				if (!waiting_mats) {
					console.log('Error: waiting mats was null or false.');
				}
				else {
					// Assign this texture to all materials waiting for it.
					for (let z = 0; z < waiting_mats.length; ++z) {
						const mats_pair = waiting_mats[z];
						const world_mat: WorldMaterial = mats_pair[0];
						const mat: THREE.Material = mats_pair[1];

						//console.log("Assigning texture '" + download_queue_item.URL + "' to waiting material: " + mat);

						console.assert(mat.map);

						const cloned_texture = texture.clone(); // Clone so the same texture isn't applied to multiple objects (needs to have different tex matrices etc.)

						if (mat.map) cloned_texture.matrix = mat.map.matrix.clone(); // Use old/existing texture matrix (set from object state)

						cloned_texture.matrixAutoUpdate = false;
						cloned_texture.encoding = THREE.sRGBEncoding;
						mat.map = cloned_texture;
						mat.map.wrapS = THREE.RepeatWrapping;
						mat.map.wrapT = THREE.RepeatWrapping;
						mat.map.flipY = false;
						mat.map.needsUpdate = true;
						mat.needsUpdate = true;

						world_mat.loaded_colour_texture_URL = download_queue_item.URL;

						num_refs_added++;
					}

					loading_texture_URL_to_materials_map.delete(download_queue_item.URL); // Now that this texture has been downloaded, remove from map
					loading_texture_URL_set.delete(download_queue_item.URL);
				}

				// Add to our loaded texture map
				const ref_counted_tex = new RefCountWrapper(texture);
				ref_counted_tex.setRefCount(num_refs_added);
				url_to_texture_map.set(download_queue_item.URL, ref_counted_tex);
			},
			undefined, // onProgress callback (currently not supported)
			function (err) { // onError callback
				num_resources_downloading--;
			}
		);
	}
	else { // Else it's a model to download:
		// Here we already have the centroid and size factor as part of the download_queue_item...
		const qi = download_queue_item;
		load_item_queue.enqueueItem(new LoadItemQueueItem({
			pos: new Float32Array(qi.pos.toArray()),
			sizeFactor: qi.size_factor,
			bmesh: qi.URL
		}));
	}
}

// Adds a batched mesh model to the scene
function addBatchedMeshToScene (bmeshData: BMesh, bvh: BVH): void {
	const model_url = bmeshData.url;
	const geometry = buildBatchedMesh(bmeshData);

	//console.log("Inserting " + model_url + " into url_to_geom_map");
	const geom_info = new GeomInfo();
	geom_info.geometry = geometry;
	// geom_info.triangles = triangles; // TODO: Build bvh in mesh loader and transfer rather than building separately
	url_to_geom_map.set(model_url, geom_info); // Add to url_to_geom_map

	const loaded_model_lod_level = WorldObject.getLODLevelForURL(model_url);

	// Assign to any waiting world obs or avatars
	const waiting_obs = loading_model_URL_to_world_ob_map.get(model_url);
	if (waiting_obs == null) {
		console.log('Error: waiting obs was null or false:');
		console.log(waiting_obs);
	}
	else {

		for (const world_ob_or_avatar of waiting_obs) {

			if (world_ob_or_avatar instanceof WorldObject) {

				const world_ob = world_ob_or_avatar;

				if (world_ob.in_proximity) { // Object may have moved out of proximity to camera by the time the model has loaded, don't apply it in this case.

					const ob_lod_level = world_ob.getLODLevel(cam_controller.positionV3); // Used for determining which texture LOD level to load
					const ob_model_lod_level = clamp(ob_lod_level, 0, world_ob.max_model_lod_level);

					// Check the object wants this particular LOD level model right now:
					const current_desired_model_LOD_URL = getLODModelURLForLevel(world_ob.model_url, ob_model_lod_level);
					if (current_desired_model_LOD_URL === model_url) {

						geom_info.use_count++; // NOTE: has to go before removeAndDeleteGLAndPhysicsObjectsForOb() in case we are remove and re-assigning the same model.

						const old_mats = world_ob.mesh ? world_ob.mesh.material : null;

						const model_changing = model_url !== world_ob_or_avatar.loaded_mesh_URL;
						if (model_changing)
							removeAndDeletePhysicsObjectForOb(world_ob);
						removeAndDeleteGLObjectForOb(world_ob, /*remove_and_delete_materials=*/false); // If the object had materials before, they will be reassigned to the new mesh, so we don't need to destroy them.

						// console.log("Assigning model '" + model_url + "' to world object: " + world_ob.uid);

						const ob_aabb_longest_len = world_ob.AABBLongestLength();

						const mesh: THREE.Mesh = makeMeshAndAddToScene(geometry, world_ob.mats, old_mats, world_ob.pos, world_ob.scale, world_ob.axis, world_ob.angle, ob_aabb_longest_len, ob_lod_level);

						if (model_changing) {
							world_ob.bvh = bvh;
							registerPhysicsObject(world_ob, bvh, mesh);
						}

						world_ob.loaded_lod_level = ob_lod_level;
						world_ob.loaded_model_lod_level = loaded_model_lod_level;
						world_ob.loaded_mesh_URL = model_url;
						world_ob.mesh = mesh;
						world_ob.mesh_state = MESH_LOADED;
					}
					else {
						// console.log("!!!!!!!!Not applying loaded model, wrong LOD, current_desired_model_LOD_URL: " + current_desired_model_LOD_URL + ", model_url: " + model_url);
					}
				}
			}
			else if (world_ob_or_avatar instanceof Avatar) {

				const avatar = world_ob_or_avatar;
				if (avatar.uid != client_avatar_uid) {
					console.log('Avatar:', avatar);
					const mesh: THREE.Mesh = makeMeshAndAddToScene(geometry, avatar.avatar_settings.materials, /*old mats=*/null, avatar.pos, /*scale=*/new Vec3f(1, 1, 1), /*axis=*/new Vec3f(0, 0, 1),
						/*angle=*/0, /*ob_aabb_longest_len=*/1.0, /*ob_lod_level=*/0);

					geom_info.use_count++;

					//console.log("Loaded mesh '" + model_url + "'.");
					avatar.loaded_mesh_URL = model_url;
					avatar.mesh = mesh;
					avatar.mesh_state = MESH_LOADED;
				}
			}
		}
	}

	loading_model_URL_to_world_ob_map.delete(model_url); // Now that this model has been downloaded, remove from map
	loading_model_URL_set.delete(model_url); // Remove from set of loading model URLs, so it can be downloaded/loaded again later.
	num_resources_downloading--;
}

// Register a new world object with the physics engine
function registerPhysicsObject(obj: WorldObject, bvh: BVH, mesh: THREE.Mesh) {
	const bvh_key = getBVHKey(obj);
	obj.mesh = mesh;
	// Some variables are stored on the worldObject by registerWorldObject
	physics_world.registerWorldObject(bvh_key, obj, bvh);
}






/*
// Build the BVH for a new (unregistered) mesh
function registerPhysicsObject(obj: WorldObject, triangles: Triangles, mesh: THREE.Mesh) {
	const bvh_key = getBVHKey(obj);
	obj.mesh = mesh;
	// Some variables are stored on the worldObject by registerWorldObject
	physics_world.registerWorldObject(bvh_key, obj, triangles);
}
*/
// model_url will have lod level in it, e.g. cube_lod2.bmesh
function loadModelAndAddToScene(world_ob_or_avatar: any, model_url: string, ob_aabb_longest_len: number, ob_lod_level: number, model_lod_level: number, mats: Array<WorldMaterial>, pos: Vec3d, scale: Vec3f, world_axis: Vec3f, angle: number) {

	//console.log("loadModelAndAddToScene(), model_url: " + model_url + ", ob_lod_level: " + ob_lod_level + ", model_lod_level: " + model_lod_level);

	world_ob_or_avatar.mesh_state = MESH_LOADING;

	const geom_info: GeomInfo = url_to_geom_map.get(model_url); // See if we have already loaded this mesh.
	if (geom_info) {
		//console.log("Found already loaded geom for " + model_url);

		const model_changing = model_url !== world_ob_or_avatar.loaded_mesh_URL; // When we transition from LOD level -1 to 0 and vice-versa, model_url will not change.  Detect this to avoid unnecessary BVH rebuilds.

		geom_info.use_count++; // NOTE: has to go before removeAndDeleteGLAndPhysicsObjectsForOb() in case we are remove and re-assigning the same model.

		const old_mats = world_ob_or_avatar.mesh ? world_ob_or_avatar.mesh.material : null;

		if (world_ob_or_avatar instanceof WorldObject) {
			const world_ob = world_ob_or_avatar;
			removeAndDeleteGLObjectForOb(world_ob, /*remove_and_delete_materials=*/false); // If the object had materials before, they have been assigned to the new mesh, so we don't need to destroy them.
			if (model_changing)
				removeAndDeletePhysicsObjectForOb(world_ob);
		}

		// console.log("Assigning already loaded model '" + model_url + "' to world object or avatar: " + world_ob_or_avatar.uid);

		const mesh: THREE.Mesh = makeMeshAndAddToScene(geom_info.geometry, mats, old_mats, pos, scale, world_axis, angle, ob_aabb_longest_len, ob_lod_level);

		if (world_ob_or_avatar instanceof WorldObject) {
			const world_ob = world_ob_or_avatar;
			if (model_changing)
				registerPhysicsObject(world_ob, world_ob.bvh, mesh);
		}
		
		if (world_ob_or_avatar instanceof WorldObject) {
			const world_ob = world_ob_or_avatar;
			world_ob.loaded_lod_level = ob_lod_level;
			world_ob.loaded_model_lod_level = model_lod_level;
		}
		world_ob_or_avatar.loaded_mesh_URL = model_url;
		world_ob_or_avatar.mesh = mesh;
		world_ob_or_avatar.mesh_state = MESH_LOADED;
		return;
	}
	else {
		if (loading_model_URL_set.has(model_url)) {
			//console.log("model is in loading set.");
		}
		else {
			// Else we were not already loading model.
			// Enqueue downloading of the model
			const size_factor = downloadqueue.sizeFactorForAABBWSLongestLen(ob_aabb_longest_len);
			download_queue.enqueueItem(new downloadqueue.DownloadQueueItem(toThreeVector3(pos), size_factor, model_url, /*is_texture=*/false));

			//console.log("Inserting " + model_url + " into loading_model_URL_set");
			loading_model_URL_set.add(model_url);
		}

		// Add this world ob or avatar to the list of objects waiting for the model
		if (!loading_model_URL_to_world_ob_map.has(model_url)) // Initialise with empty list if needed
			loading_model_URL_to_world_ob_map.set(model_url, new Set());

		loading_model_URL_to_world_ob_map.get(model_url).add(world_ob_or_avatar);
	}
}


// Called by ProximityLoader.
function newCellInProximity(cell_x: number, cell_y: number, cell_z: number) {

	// console.log("newCellInProximity(): " + cell_x + ", " + cell_y + ", " + cell_z);

	// NOTE: bit of a race condition here, potential to lose messages if we move the camera far while the websocket is still connecting.  TODO: put messages in a queue or something.
	if (ws && ws.readyState == WebSocket.OPEN) {

		const buffer_out = new BufferOut();
		buffer_out.writeUInt32(QueryObjects);
		buffer_out.writeUInt32(0); // message length - to be updated.

		// Write camera position
		buffer_out.writeDouble(cam_controller.position[0]);
		buffer_out.writeDouble(cam_controller.position[1]);
		buffer_out.writeDouble(cam_controller.position[2]);

		buffer_out.writeUInt32(1); // Num cells to query
		buffer_out.writeInt32(cell_x);
		buffer_out.writeInt32(cell_y);
		buffer_out.writeInt32(cell_z);

		buffer_out.updateMessageLengthField();
		buffer_out.writeToWebSocket(ws);
	}
}


// Parse initial camera location from URL
let initial_pos_x = 1;
let initial_pos_y = 1;
let initial_pos_z = 1.8;
let initial_heading_deg = 90;

const params = new URLSearchParams(document.location.search);
if(params.get('x'))
	initial_pos_x = parseFloat(params.get('x'));
if(params.get('y'))
	initial_pos_y = parseFloat(params.get('y'));
if(params.get('z'))
	initial_pos_z = parseFloat(params.get('z'));
if (params.get('heading'))
	initial_heading_deg = parseFloat(params.get('heading'));

let world = '';
if (params.get('world'))
	world = params.get('world');


const client_avatar = new Avatar();
client_avatar.pos = new Vec3d(initial_pos_x, initial_pos_y, initial_pos_z);


const scene = new THREE.Scene();

// The outlineMaterial and Mesh used to highlight objects
/*
const OUTLINE_SCALE = 1.02;
const outlineMaterial = new THREE.MeshBasicMaterial({ color: 0x0ff7fb, side: THREE.BackSide });
const outlineMesh = new THREE.Mesh(new THREE.BoxGeometry(), outlineMaterial);
outlineMesh.scale.set(OUTLINE_SCALE, OUTLINE_SCALE, OUTLINE_SCALE);
outlineMesh.renderOrder = 0;
outlineMesh.depthTest = false;
outlineMesh.depthWrite = false;
outlineMesh.visible = true;
scene.add(outlineMesh);
*/
const renderer_canvas_elem = document.getElementById('rendercanvas');
const renderer = new THREE.WebGLRenderer({ canvas: renderer_canvas_elem, antialias: true, logarithmicDepthBuffer: THREE.logDepthBuf });
renderer.setSize(window.innerWidth, window.innerHeight);


const ktx_loader = new KTX2Loader()
	.setTranscoderPath( '/webclient/examples/js/libs/basis/' )
	.detectSupport( renderer );


// Use linear tone mapping with a scale less than 1, which seems to be needed to make the sky model look good.
renderer.toneMapping = THREE.LinearToneMapping;
renderer.toneMappingExposure = 0.000000003 * 1.0e9; // 0.000000003 is the tonemapping value from the native rendering, in three we will work with a factor of 10e9 as well since we can't change the background intensity currently.

renderer.outputEncoding = THREE.sRGBEncoding;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const cam_controller = new CameraController(renderer);

cam_controller.position = new Float32Array([initial_pos_x, initial_pos_y, initial_pos_z]);
cam_controller.heading = initial_heading_deg / 180.0 * Math.PI;

// If the initial position is off the ground, then the user may have entered a URL with a location standing on some elevated object.
// We don't want the user to fall through the object before its physics representation has loaded.
// 'Fix' this by making the user fly for a while, hopefully until the object has loaded.
// TODO: improve - turn off flying when we detect nearby objects have loaded?
function turnOffFlyMode() {
	if (physics_world.player.flyMode && !user_manually_toggled_flying) { // If the user has manually turned flying on or off already, don't overwrite the user's choice.
		physics_world.player.flyMode = false;
	}
}
if (initial_pos_z > 2.0) { // If the initial spawn location was off the ground:
	physics_world.player.flyMode = true; // Fly for a while before transitioning to walking mode.
	setTimeout(turnOffFlyMode, 10.0 * 1000.0);
}



const proximity_loader = new ProximityLoader(MAX_OB_LOAD_DISTANCE_FROM_CAM, /*callback_function=*/newCellInProximity);

const sun_phi = 1.0;
const sun_theta = Math.PI / 4;

//===================== Add sun light =====================
const sundir_x = Math.cos(sun_phi) * Math.sin(sun_theta); // In z-up coords
const sundir_y = Math.sin(sun_phi) * Math.sin(sun_theta);
const sundir_z = Math.cos(sun_theta);
const sundir_z_up = new THREE.Vector3(sundir_x, sundir_y, sundir_z);
const sundir_y_up = new THREE.Vector3(sundir_x, sundir_z, -sundir_y); // Convert to y-up
const dirLight = new THREE.DirectionalLight();
dirLight.color = new THREE.Color(1662102582.6479533, 1499657101.1924045, 1314152016.0871031); // See phong_frag_shader.glsl
dirLight.intensity = 3.0e-10; // Not sure what units three.js uses for directional lights.  This value is chosen to roughly match native rendering.
dirLight.position.copy(sundir_y_up);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.top = 20;
dirLight.shadow.camera.bottom = - 20;
dirLight.shadow.camera.left = - 20;
dirLight.shadow.camera.right = 20;

dirLight.shadow.bias = -0.001; // Needed when backfaces are drawn.
//dirLight.shadow.camera.near = 0.1;
//dirLight.shadow.camera.far = 40;

scene.add(dirLight);

// Create a helper to visualise the shadow camera.
//const camera_helper = new THREE.CameraHelper(dirLight.shadow.camera);
//scene.add(camera_helper);


//let from_sun_dir = new THREE.Vector3();
//from_sun_dir.copy(sundir);
//from_sun_dir.negate();

// cascaded shadow maps
//const csm = new CSM({
//    //fade: true,
//    //near: 1,
//    //far: 100,//camera.far,
//    //far: camera.far,
//    //maxFar: 60,
//    //cascades: 4,
//    shadowMapSize: 2048,
//    lightDirection: from_sun_dir,
//    camera: camera,
//    parent: scene,
//    lightIntensity: 0.5
//});

//const csmHelper = new CSMHelper(csm);
//csmHelper.displayFrustum = true;
//csmHelper.displayPlanes = true;
//csmHelper.displayShadowBounds = true;
//scene.add(csmHelper);


//for (let i = 0; i < csm.lights.length; i++) {
//    //csm.lights[i].shadow.camera.near = 1;
//    //csm.lights[i].shadow.camera.far = 2000;
//   // csm.lights[i].shadow.camera.updateProjectionMatrix();
//
//   // csm.lights[i].color = new THREE.Color(1.0, 0.8, 0.8);
//}


//const placeholder_texture = new THREE.TextureLoader().load('./obstacle.png');


// Environment-map based lighting on MeshStandardMaterial doesn't work properly with z-up (it uses y-up when looking up the env map, and can't do rotations to z-up),
// and also the standard environment map rendering doesn't work properly with z-up.
// So for now, convert everything to three's y-up coordinates.
// When 3.js allows z-up / env map rotations, then we can remove this code.
const to_y_up_matrix = new THREE.Matrix4();
to_y_up_matrix.set(
	1, 0, 0, 0,
	0, 0, 1, 0,
	0, -1, 0, 0,
	0, 0, 0, 1);


//===================== Add ground plane quads =====================
// Use multiple quads to improve z fighting.
function addGroundQuads() {

	const plane_w = 200;

	const texture = texture_loader.load('/webclient/obstacle.png');
	texture.encoding = THREE.sRGBEncoding;

	texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;

	texture.matrixAutoUpdate = false;
	texture.matrix.set(
		plane_w, 0, 0,
		0, plane_w, 0,
		0, 0, 1
	);

	const material = new CustomStandardMaterial();

	// @ts-expect-error - incomplete type interface
	material.color = new THREE.Color(0.9, 0.9, 0.9);
	// @ts-expect-error - incomplete type interface
	material.color.convertSRGBToLinear();

	//material.side = THREE.DoubleSide;

	// @ts-expect-error - incomplete type interface
	material.envMap = env_tex;
	// @ts-expect-error - incomplete type interface
	material.envMapIntensity = ENV_TEX_INTENSITY;
	// @ts-expect-error - incomplete type interface
	material.map = texture;

	const half_res = 5;
	for (let x = -half_res; x <= half_res; ++x)
		for (let y = -half_res; y <= half_res; ++y) {

			const geometry = new THREE.PlaneGeometry(plane_w, plane_w); // in x-y axis
			const plane = new THREE.Mesh(geometry, material);

			plane.matrixAutoUpdate = false;

			const trans_matrix = new THREE.Matrix4();
			trans_matrix.makeTranslation(x * plane_w, y * plane_w, 0);

			plane.matrix = to_y_up_matrix.clone();
			plane.matrix.multiply(trans_matrix);

			plane.castShadow = true;
			plane.receiveShadow = true;

			scene.add(plane);
		}
}




const gen = new THREE.PMREMGenerator(renderer);
let env_tex = null;

new EXRLoader().load('/webclient/sky_no_sun.exr', function (texture) {

	texture.mapping = THREE.EquirectangularReflectionMapping; // needed?
	const target: THREE.WebGLRenderTarget = gen.fromEquirectangular(texture);
	env_tex = target.texture;

	scene.background = texture;

	addGroundQuads(); // Add ground quads now that env_tex has been loaded.
});


const ENV_TEX_INTENSITY = 1.0;


const download_queue = new downloadqueue.DownloadQueue();

let is_mouse_down = false;
const keys_down = new Set<string>();

physics_world.scene = scene;
physics_world.player.controller = cam_controller;
physics_world.caster = cam_controller.caster;

function onDocumentMouseDown() {
	is_mouse_down = true;
}

function onDocumentMouseUp() {
	is_mouse_down = false;
}

/*
function highlightObject (obj: THREE.Mesh): void {
	// Use visibility to determine if an object is highlighted or not
	outlineMesh.visible = false;
	outlineMesh.geometry = obj.geometry;
	outlineMesh.position.copy(obj.position);
	outlineMesh.scale.copy(obj.scale);
	outlineMesh.scale.multiplyScalar(OUTLINE_SCALE);
	outlineMesh.rotation.copy(obj.rotation);
	console.log('outline:', outlineMesh);
}

function clearHighlight (): void {
	if(outlineMesh.visible) {
		outlineMesh.visible = false;
		outlineMesh.geometry = null;
	}
}
*/

function onDocumentMouseMove(ev: MouseEvent) {
	const ray = cam_controller.caster.getPickRay(ev.offsetX, ev.offsetY);

	if(ray != null) {
		/*
		const [O, d] = ray;
		const object = physics_world.pickWorldObject(O, d);
		if(object) highlightObject(object.mesh);
		else clearHighlight();
 	  */
	}

	if(is_mouse_down){
		cam_controller.mouseLook(ev.movementX, ev.movementY);
	}
}

function onKeyDown(ev: KeyboardEvent) {
	keys_down.add(ev.code);
}

function onKeyUp(ev: KeyboardEvent) {
	keys_down.delete(ev.code);
}

let user_manually_toggled_flying = false;
function onKeyPress() {
	const player = physics_world.player;
	if(keys_down.has('KeyV')) player.cameraMode = (player.cameraMode + 1) % 2;
	if(keys_down.has('KeyF')) {
		player.flyMode = !player.flyMode;
		user_manually_toggled_flying = true;
	}
	if(keys_down.has('Space')) player.processJump();
}

function onWheel(ev: WheelEvent) {
	cam_controller.handleScroll(-ev.deltaY);
}

function onFocusOut(ev: FocusEvent) {
	// Clear keys-down set, to prevent the issue where we miss the keyup event since the canvas does not have focus, and so the key acts as if it's stuck down.
	keys_down.clear();
}

// See https://stackoverflow.com/a/20434960
window.addEventListener('resize', onWindowResize, false);

function onWindowResize() {
	renderer.setSize(window.innerWidth, window.innerHeight);
	// Enable for High DPI mode
	// renderer.setPixelRatio(window.devicePixelRatio)
}

// Note: If you don't call this and the window is never resized, it will never be called
onWindowResize();

renderer_canvas_elem.addEventListener('mousedown', onDocumentMouseDown, false);
window.addEventListener('mouseup', onDocumentMouseUp, false);
window.addEventListener('mousemove', onDocumentMouseMove, false);
renderer_canvas_elem.addEventListener('keydown', onKeyDown, false);
renderer_canvas_elem.addEventListener('keyup', onKeyUp, false);
renderer_canvas_elem.addEventListener('keypress', onKeyPress, false);
renderer_canvas_elem.addEventListener('focusout', onFocusOut, false);
window.addEventListener('wheel', onWheel, false);

function doCamMovement(dt: number) {
	const run_pressed = keys_down.has('ShiftLeft') || keys_down.has('ShiftRight');

	if(keys_down.has('KeyW') || keys_down.has('ArrowUp')) {
		physics_world.player.processMoveForwards(1, run_pressed);
	}

	if(keys_down.has('KeyS') || keys_down.has('ArrowDown')) {
		physics_world.player.processMoveForwards(-1, run_pressed);
	}

	if(keys_down.has('KeyA')) {
		physics_world.player.processMoveRight(-1, run_pressed);
	}

	if(keys_down.has('KeyD')) {
		physics_world.player.processMoveRight(+1, run_pressed);
	}

	if (keys_down.has('Space')) {
		physics_world.player.processMoveUp(+1, run_pressed);
	}

	if (keys_down.has('KeyC') && !(keys_down.has('ControlLeft') || keys_down.has('ControlRight'))) {
		physics_world.player.processMoveUp(-1., run_pressed);
	}

	if(keys_down.has('ArrowLeft')) {
		const turn_speed = run_pressed ? 3.0 : 1.0;
		cam_controller.heading = cam_controller.heading + (dt * turn_speed);
	}

	if(keys_down.has('ArrowRight')) {
		const turn_speed = run_pressed ? 3.0 : 1.0;
		cam_controller.heading = cam_controller.heading - (dt * turn_speed);
	}

	physics_world.player.processCameraMovement(dt);

	client_avatar.pos.x = cam_controller.firstPersonPos[0];
	client_avatar.pos.y = cam_controller.firstPersonPos[1];
	client_avatar.pos.z = cam_controller.firstPersonPos[2];

	client_avatar.rotation.x = 0;
	client_avatar.rotation.y = cam_controller.pitch;
	client_avatar.rotation.z = cam_controller.heading;
}

function curTimeS(): number {
	return window.performance.now() * 1.0e-3;
}

let cur_time = curTimeS();

let last_update_URL_time = curTimeS();
let last_avatar_update_send_time = curTimeS();
let last_download_queue_sort_time = curTimeS() - 100;
let last_load_item_queue_sort_time = curTimeS() - 100;

let last_update_stats_time = 0;
let last_stats_update_frame_num = 0;
let frame_num = 0;


const stats_doc_elem = document.getElementById('stats');
const loading_status_bar_doc_elem = document.getElementById('loading_status_bar');


function animate() {
	const dt = Math.min(0.1, curTimeS() - cur_time);
	cur_time = curTimeS();

	if (stats_doc_elem && ((cur_time - last_update_stats_time) > 1.0)) {
		const fps = (frame_num - last_stats_update_frame_num) / (cur_time - last_update_stats_time);

		let s = fps.toFixed(1) + ' fps<br/>';
		if (renderer.info) {
			s += 'geometries: ' + renderer.info.memory.geometries.toString() + '<br/>';
			s += 'textures: ' + renderer.info.memory.textures.toString() + '<br/>';
			s += 'num programs: ' + renderer.info.programs.length + '<br/>';
			s += 'render calls: ' + renderer.info.render.calls + '<br/>';
			s += 'render triangles: ' + renderer.info.render.triangles + '<br/>';
		}
		stats_doc_elem.innerHTML = s;

		last_update_stats_time = cur_time;
		last_stats_update_frame_num = frame_num;

		const num_items_loading = load_item_queue.length() + download_queue.length();
		if (num_items_loading > 0) {
			s = 'Loading ' + num_items_loading + ' items';
			loading_status_bar_doc_elem.innerHTML = s;
			loading_status_bar_doc_elem.hidden = false;
		}
		else {
			loading_status_bar_doc_elem.hidden = true;
		}
	}



	requestAnimationFrame(animate);

	doCamMovement(dt);

	proximity_loader.updateCamPos(cam_controller.positionV3);

	{
		// Sort download queue (by distance from camera)
		if (cur_time - last_download_queue_sort_time > 2.0)
		{
			//let sort_start_time = curTimeS();
			download_queue.sortQueue(cam_controller.positionV3);

			//let sort_duration = curTimeS() - sort_start_time;
			//console.log("Sorting download queue took " + (sort_duration * 1.0e3) + " ms (num obs in queue: " + download_queue.items.length + ")");

			last_download_queue_sort_time = cur_time;
		}

		// Sort load_item queue (by distance from camera)
		if (cur_time - last_load_item_queue_sort_time > 0.1) {

			load_item_queue.sortQueue(cam_controller.positionV3);

			last_load_item_queue_sort_time = cur_time;
		}

		mesh_loader.processRequests();

		// If there are less than N resources currently downloading, and there are items in the to-download queue, start downloading some of them.
		const MAX_CONCURRENT_DOWNLOADS = 10;
		if (num_resources_downloading < MAX_CONCURRENT_DOWNLOADS && download_queue.items.length > 0) {

			const num_to_dequeue = Math.min(MAX_CONCURRENT_DOWNLOADS - num_resources_downloading, download_queue.items.length);
			for (let z = 0; z < num_to_dequeue; ++z) {
				const item = download_queue.dequeueItem();
				startDownloadingResource(item);
			}
		}
	}

	// Update shadow map 'camera' so that the shadow map volume is positioned around the camera.
	{
		const sun_right = new THREE.Vector3();
		sun_right.crossVectors(new THREE.Vector3(0, 0, 1), sundir_z_up);
		sun_right.normalize();
		const sun_up = new THREE.Vector3();
		sun_up.crossVectors(sundir_z_up, sun_right);

		const cam_dot_sun_right = sun_right.dot(cam_controller.positionV3); //camera.position);
		const cam_dot_sun_up = sun_up.dot(cam_controller.positionV3); //camera.position);
		const cam_dot_sun = -sundir_z_up.dot(cam_controller.positionV3); //camera.position);

		//console.log("cam_dot_sun_up: " + cam_dot_sun_up);
		//console.log("cam_dot_sun_right: " + cam_dot_sun_right);

		const shadow_half_w = 80;
		dirLight.shadow.camera.top    = cam_dot_sun_up + shadow_half_w;
		dirLight.shadow.camera.bottom = cam_dot_sun_up - shadow_half_w;
		dirLight.shadow.camera.left  = cam_dot_sun_right - shadow_half_w;
		dirLight.shadow.camera.right = cam_dot_sun_right + shadow_half_w;
		dirLight.shadow.camera.near = cam_dot_sun - 100;
		dirLight.shadow.camera.far = cam_dot_sun + 100;
		dirLight.shadow.camera.updateProjectionMatrix();

		//if (camera_helper)
		//    camera_helper.update();

		//csm.update()
		//csm.updateFrustums();
		//csm.update(camera.matrix);
		//csmHelper.update()
	}


	renderer.render(scene, cam_controller.camera);

	// Update URL with current camera position
	if(cur_time > last_update_URL_time + 0.1) {
		let url_path = '/webclient?';
		if (world != '') // Append world if != empty string.
			url_path += 'world=' + encodeURIComponent(world) + '&';
		const P = cam_controller.firstPersonPos;

		const heading = floatMod(cam_controller.heading * 180 / Math.PI, 360.0);

		url_path += 'x=' + P[0].toFixed(1) + '&y=' + P[1].toFixed(1) + '&z=' + P[2].toFixed(1) + '&heading=' + heading.toFixed(0);
		window.history.replaceState('object or string', 'Title', url_path);
		last_update_URL_time = cur_time;
	}


	// Send AvatarTransformUpdate message to server
	if ((client_avatar_uid !== null) &&  cur_time > last_avatar_update_send_time + 0.1) {
		const anim_state = 0;

		const buffer_out = new BufferOut();
		buffer_out.writeUInt32(AvatarTransformUpdate);
		buffer_out.writeUInt32(0); // will be updated with length
		writeUID(buffer_out, client_avatar_uid);
		client_avatar.pos.writeToStream(buffer_out);
		client_avatar.rotation.writeToStream(buffer_out);
		buffer_out.writeUInt32(anim_state);
		buffer_out.updateMessageLengthField();
		buffer_out.writeToWebSocket(ws);
		//console.log("Sending avatar update");

		last_avatar_update_send_time = cur_time;
	}


	// Update OpenGL transforms of avatars of other users.
	for (const avatar of avatars.values()) {

		if (avatar.uid != client_avatar_uid) { // If this is our avatar, don't load it

			if (avatar.mesh_state == MESH_NOT_LOADED) {
				//console.log("Loading avatar model: " + avatar.avatar_settings.model_url);
				//let ob_lod_level = 0;
				//let world_axis = new Vec3f(0, 0, 1);
				//let angle = 0;
				//loadModelAndAddToScene(avatar, avatar.avatar_settings.model_url, ob_lod_level, avatar.avatar_settings.materials, avatar.pos, new Vec3f(1, 1, 1), world_axis, angle);
			}
			else if (avatar.mesh_state == MESH_LOADED) {

				const av_z_rot = avatar.rotation.z + Math.PI / 2;

				const mat = new THREE.Matrix4();
				mat.makeRotationZ(av_z_rot);

				// Set translation part of matrix
				mat.elements[12] = avatar.pos.x;
				mat.elements[13] = avatar.pos.y;
				mat.elements[14] = avatar.pos.z;

				//console.log("pos: " + avatar.pos.x + ", " + avatar.pos.y + ", " + avatar.pos.z);

				const pre_ob_to_world_matrix = new THREE.Matrix4();

				/*
				0	 4	 8  12
				1	 5	 9  13
				2	 6	10  14
				3	 7	11  15
				*/
				const m = avatar.avatar_settings.pre_ob_to_world_matrix; // pre_ob_to_world_matrix is in column-major order, set() takes row-major order, so transpose.
				pre_ob_to_world_matrix.set(
					m[0], m[4], m[8], m[12],
					m[1], m[5], m[9], m[13],
					m[2], m[6], m[10], m[14],
					m[3], m[7], m[11], m[15]
				);

				mat.multiply(pre_ob_to_world_matrix);

				mat.premultiply(to_y_up_matrix);

				avatar.mesh.matrix.copy(mat);
				avatar.mesh.matrixAutoUpdate = false;
			}
		}
	}

	checkForLODChanges();

	frame_num++;
}


function removeAndDeleteMaterials (world_ob: WorldObject): void {
	const materials = world_ob.mats;

	for(let i = 0; i !== materials.length; ++i) {
		const mat = materials[i];

		if (mat.loaded_colour_texture_URL) {
			console.assert(world_ob.mesh && world_ob.mesh.material[i].map);
			decRefCount(url_to_texture_map, mat.loaded_colour_texture_URL); // Calls dispose() on the texture if needed.

			mat.loaded_colour_texture_URL = null;
		}

		// TODO: dispose of emissive texture when we start using emissive textures.
	}
}

function removeAndDeleteGLObjectForOb(world_ob: WorldObject, remove_and_delete_materials: boolean) {
	// Remove from three.js scene
	if (world_ob.mesh) {

		if (remove_and_delete_materials)
			removeAndDeleteMaterials(world_ob); // Remove materials before we remove the mesh, as removeAndDeleteMaterials() accesses world_ob.mesh.

		const geom_info: GeomInfo = url_to_geom_map.get(world_ob.loaded_mesh_URL);
		if (geom_info) {
			console.assert(geom_info.use_count >= 1);
			geom_info.use_count--;
			// console.log("removeAndDeleteGLAndPhysicsObjectsForOb(): URL: '" + world_ob.loaded_mesh_URL + "': new geom_info.use_count: " + geom_info.use_count.toString());
			if (geom_info.use_count == 0) {
				url_to_geom_map.delete(world_ob.loaded_mesh_URL);
				// console.log("Removed and disposed of '" + world_ob.loaded_mesh_URL + "' from url_to_geom_map as use_count reached zero.");
				world_ob.mesh.geometry.dispose();
			}
		}

		scene.remove(world_ob.mesh);
		world_ob.mesh = null;

		world_ob.loaded_mesh_URL = null;
		world_ob.loaded_lod_level = -10;
		world_ob.loaded_model_lod_level = -10;
	}
}


function removeAndDeletePhysicsObjectForOb(world_ob: WorldObject) {
	// Remove from physics world
	if (world_ob.bvh) {
		physics_world.delWorldObject(world_ob.world_id); // Use id (= index of element in worldObject list)
		world_ob.bvh = null;
	}
}


function unloadObject(world_ob: WorldObject) {

	removeAndDeleteGLObjectForOb(world_ob, /*remove_and_delete_materials=*/true);
	removeAndDeletePhysicsObjectForOb(world_ob);

	world_ob.mesh_state = MESH_NOT_LOADED;
}


function checkForLODChanges()
{
	const cam_pos: THREE.Vector3 = cam_controller.positionV3;
	const cam_pos_x = cam_pos.x;
	const cam_pos_y = cam_pos.y;
	const cam_pos_z = cam_pos.z;

	// Currently do this with a loop over all objects, so try and make this code fast and with minimal garbage generated.
	for (const ob of world_objects.values()) {

		const centroid_x = ob.cached_centroid_ws_x;
		const centroid_y = ob.cached_centroid_ws_y;
		const centroid_z = ob.cached_centroid_ws_z;

		const cam_to_ob_d2 =
			(centroid_x - cam_pos_x) * (centroid_x - cam_pos_x) +
			(centroid_y - cam_pos_y) * (centroid_y - cam_pos_y) +
			(centroid_z - cam_pos_z) * (centroid_z - cam_pos_z);


		let new_in_proximity = false;
		if (cam_to_ob_d2 > LOAD_EVERYTHING_DIST * LOAD_EVERYTHING_DIST) { // If further than x metres away:

			const proj_len = ob.AABBLongestLength() / Math.sqrt(cam_to_ob_d2);

			new_in_proximity = proj_len > 0.05;
		}
		else {
			new_in_proximity = true;
		}


		if (!new_in_proximity) {
			if (ob.in_proximity) { // If an object was in proximity to the camera, and moved out of load distance:

				unloadObject(ob);
				ob.in_proximity = false;
			}
		}
		else {
			// Object is within load distance:

			const lod_level = ob.getLODLevelForCamToObDist2(cam_to_ob_d2);

			if (lod_level != ob.current_lod_level) {
				// console.log("Changing LOD level for object with UID " + ob.uid.toString() + " from " + ob.current_lod_level + " to " + toString(lod_level));
				loadModelForObject(ob);
				ob.current_lod_level = lod_level;
			}

			if (!ob.in_proximity) { // If an object was out of load distance, and moved within load distance:
				ob.in_proximity = true;
				loadModelForObject(ob);
				ob.current_lod_level = lod_level;
			}
		}
	}
}


animate();
