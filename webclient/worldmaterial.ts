/*=====================================================================
worldmaterial.ts
----------------
Copyright Glare Technologies Limited 2022 -
=====================================================================*/


import { Colour3f, Matrix2f, readColour3fFromStream, readMatrix2fFromStream } from './types.js';
import { BufferIn, readUInt32, readFloat, readStringFromStream } from './bufferin.js';
import { BufferOut } from './bufferout.js';
import { hasExtension, hasPrefix, filenameExtension, removeDotAndExtension } from './utils.js';

const COLOUR_TEX_HAS_ALPHA_FLAG = 1;
const MIN_LOD_LEVEL_IS_NEGATIVE_1 = 2;

const WORLD_MATERIAL_SERIALISATION_VERSION = 8;

export class WorldMaterial {

	colour_texture_url: string;
	emission_texture_url: string;
	colour_rgb: Colour3f;
	emission_rgb: Colour3f;
	roughness: ScalarVal;
	metallic_fraction: ScalarVal;
	opacity: ScalarVal;
	tex_matrix: Matrix2f;
	emission_lum_flux: number;
	flags: number;
	normal_map_url: string;


	loaded_colour_texture_URL: string | null; // The URL of the loaded colour texture.  This can be different from colour_texture_url as it may have a LOD suffix.

	colourTexHasAlpha() {
		return (this.flags & COLOUR_TEX_HAS_ALPHA_FLAG) != 0;
	}

	minLODLevel() {
		return ((this.flags & MIN_LOD_LEVEL_IS_NEGATIVE_1) != 0) ? -1 : 0;
	}

	writeToStream(stream_: BufferOut) {

		const buffer_out = new BufferOut();
		buffer_out.writeUInt32(WORLD_MATERIAL_SERIALISATION_VERSION);
		buffer_out.writeUInt32(0); // will be updated with length

		this.colour_rgb.writeToStream(buffer_out);
		buffer_out.writeStringLengthFirst(this.colour_texture_url);

		this.emission_rgb.writeToStream(buffer_out);
		buffer_out.writeStringLengthFirst(this.emission_texture_url);

		this.roughness.writeToStream(buffer_out);
		this.metallic_fraction.writeToStream(buffer_out);
		this.opacity.writeToStream(buffer_out);

		this.tex_matrix.writeToStream(buffer_out);

		buffer_out.writeFloat(this.emission_lum_flux);

		buffer_out.writeUInt32(this.flags);

		buffer_out.writeStringLengthFirst(this.normal_map_url);

		buffer_out.updateMessageLengthField();

		stream_.writeBufferOut(buffer_out);
	}

	setDefaults() {
		this.colour_texture_url = "";
		this.emission_texture_url = "";
		this.colour_rgb = new Colour3f(0.5, 0.5, 0.5);
		this.emission_rgb = new Colour3f(0, 0, 0);
		this.roughness = new ScalarVal(0.5, "");
		this.metallic_fraction = new ScalarVal(0.0, "");
		this.opacity = new ScalarVal(1.0, "");
		this.tex_matrix = new Matrix2f(1, 0, 0, 1);
		this.emission_lum_flux = 0;
		this.flags = 0;
		this.normal_map_url = "";
	}

	getLODTextureURLForLevel(base_texture_url: string, level: number, has_alpha: boolean): string {
		const min_lod_level = this.minLODLevel();

		if (level <= min_lod_level)
			return base_texture_url;
		else {
			// Don't do LOD on mp4 (video) textures (for now).
			// Also don't do LOD with http URLs
			if (hasExtension(base_texture_url, 'mp4') || hasPrefix(base_texture_url, 'http:') || hasPrefix(base_texture_url, 'https:'))
				return base_texture_url;

			// Gifs LOD textures are always gifs.
			// Other image formats get converted to jpg if they don't have alpha, and png if they do.
			const is_gif = hasExtension(base_texture_url, 'gif');

			if (level == 0)
				return removeDotAndExtension(base_texture_url) + '_lod0.' + (is_gif ? 'gif' : (has_alpha ? 'png' : 'jpg'));
			else if (level == 1)
				return removeDotAndExtension(base_texture_url) + '_lod1.' + (is_gif ? 'gif' : (has_alpha ? 'png' : 'jpg'));
			else
				return removeDotAndExtension(base_texture_url) + '_lod2.' + (is_gif ? 'gif' : (has_alpha ? 'png' : 'jpg'));
		}
	}
}

export class ScalarVal {
	val: number;
	texture_url: string;

	constructor(val_, texture_url_) {
		this.val = val_;
		this.texture_url = texture_url_;
	}

	writeToStream(stream: BufferOut) {
		stream.writeFloat(this.val);
		stream.writeStringLengthFirst(this.texture_url);
	}
}

export function readScalarValFromStream(buffer_in: BufferIn) {
	let val = readFloat(buffer_in);
	let texture_url = readStringFromStream(buffer_in);
	return new ScalarVal(val, texture_url);
}

export function readWorldMaterialFromStream(buffer_in: BufferIn) {
	let mat = new WorldMaterial();

	let initial_read_index = buffer_in.getReadIndex();

	let version = readUInt32(buffer_in);
	if (version != WORLD_MATERIAL_SERIALISATION_VERSION)
		throw "Unsupported version " + version.toString() + ", expected " + WORLD_MATERIAL_SERIALISATION_VERSION.toString() + ".";

	let buffer_size = readUInt32(buffer_in);

	mat.colour_rgb = readColour3fFromStream(buffer_in);
	mat.colour_texture_url = readStringFromStream(buffer_in);

	mat.emission_rgb = readColour3fFromStream(buffer_in);
	mat.emission_texture_url = readStringFromStream(buffer_in);

	mat.roughness = readScalarValFromStream(buffer_in);
	mat.metallic_fraction = readScalarValFromStream(buffer_in);
	mat.opacity = readScalarValFromStream(buffer_in);

	mat.tex_matrix = readMatrix2fFromStream(buffer_in);

	mat.emission_lum_flux = readFloat(buffer_in);

	mat.flags = readUInt32(buffer_in);

	mat.normal_map_url = readStringFromStream(buffer_in);

	// Discard any remaining unread data
	let read_B = buffer_in.getReadIndex() - initial_read_index;
	if (read_B < buffer_size)
		buffer_in.setReadIndex(initial_read_index + buffer_size);

	return mat;
}
