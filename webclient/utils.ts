/*=====================================================================
utils.ts
--------
Copyright Glare Technologies Limited 2022 -

Miscellaneous utility functions
=====================================================================*/


// from https://gist.github.com/joni/3760795
export function toUTF8Array(str) {
	var utf8 = [];
	for (var i = 0; i < str.length; i++) {
		var charcode = str.charCodeAt(i);
		if (charcode < 0x80) utf8.push(charcode);
		else if (charcode < 0x800) {
			utf8.push(0xc0 | (charcode >> 6),
				0x80 | (charcode & 0x3f));
		}
		else if (charcode < 0xd800 || charcode >= 0xe000) {
			utf8.push(0xe0 | (charcode >> 12),
				0x80 | ((charcode >> 6) & 0x3f),
				0x80 | (charcode & 0x3f));
		}
		// surrogate pair
		else {
			i++;
			// UTF-16 encodes 0x10000-0x10FFFF by
			// subtracting 0x10000 and splitting the
			// 20 bits of 0x0-0xFFFFF into two halves
			charcode = 0x10000 + (((charcode & 0x3ff) << 10)
				| (str.charCodeAt(i) & 0x3ff))
			utf8.push(0xf0 | (charcode >> 18),
				0x80 | ((charcode >> 12) & 0x3f),
				0x80 | ((charcode >> 6) & 0x3f),
				0x80 | (charcode & 0x3f));
		}
	}
	return utf8;
}


export function fromUTF8Array(data) { // array of bytes
	var str = '',
		i;

	for (i = 0; i < data.length; i++) {
		var value = data[i];

		if (value < 0x80) {
			str += String.fromCharCode(value);
		} else if (value > 0xBF && value < 0xE0) {
			str += String.fromCharCode((value & 0x1F) << 6 | data[i + 1] & 0x3F);
			i += 1;
		} else if (value > 0xDF && value < 0xF0) {
			str += String.fromCharCode((value & 0x0F) << 12 | (data[i + 1] & 0x3F) << 6 | data[i + 2] & 0x3F);
			i += 2;
		} else {
			// surrogate pair
			var charCode = ((value & 0x07) << 18 | (data[i + 1] & 0x3F) << 12 | (data[i + 2] & 0x3F) << 6 | data[i + 3] & 0x3F) - 0x010000;

			str += String.fromCharCode(charCode >> 10 | 0xD800, charCode & 0x03FF | 0xDC00);
			i += 3;
		}
	}

	return str;
}


export function hasExtension(filename: string, ext: string): boolean {
	return filenameExtension(filename).toLowerCase() === ext.toLowerCase();
}


export function hasPrefix(s: string, prefix: string): boolean {
	return s.startsWith(prefix);
}


export function hasSuffix(s: string, suffix: string): boolean {
	return s.endsWith(suffix);
}


// https://stackoverflow.com/questions/190852/how-can-i-get-file-extensions-with-javascript
export function filenameExtension(filename: string): string {
	return filename.split('.').pop();
}


// https://stackoverflow.com/questions/4250364/how-to-trim-a-file-extension-from-a-string-in-javascript
export function removeDotAndExtension(filename: string): string {
	return filename.split('.').slice(0, -1).join('.');
}

// Handles reference counting of a THREE disposable type
export class RefCountWrapper <T> {
	private readonly ref_: T | null;
	private count_: number;
	cb?: (ref: T) => void;

	constructor (ref: T, dispose?: (ref: T) => void) {
		this.ref_ = ref;
		this.count_ = 1;
		this.cb = dispose;
	}

	public get ref (): T | null { return this.count_ > 0 ? this.ref_ : null; }
	public get count(): number { return this.count_; }

	public setRefCount(c: number) { this.count_ = c; }

	public incRef (): number {
		this.count_ += 1;
		return this.count_;
	}

	public decRef (): number {
		this.count_ -= 1;
		if(this.count_ === 0) {
			// @ts-expect-error - incomplete type
			this.cb != null ? this.cb(this.ref_) : this.ref_?.dispose();
		}
		return this.count_;
	}
}

export function decRefCount<T> (table: Map<string, RefCountWrapper<T>>, key: string): boolean {
	const entry = table.get(key);
	if (!entry)
		console.assert(false, key, table);
	if(entry && entry.decRef() === 0) {
			table.delete(key);
			return true; // Entry was removed
	}
	return false; // Entry still exists
}
