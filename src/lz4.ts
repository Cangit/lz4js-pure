// lz4js-pure 280524

// Utility
// --

// Quick hash
function hashU32(a: number): number {
  a = a | 0;
  a = (a + 2127912214 + (a << 12)) | 0;
  a ^= -949894596 ^ (a >>> 19);
  a = (a + 374761393 + (a << 5)) | 0;
  a = (a + -744332180) ^ (a << 9);
  a = (a + -42973499 + (a << 3)) | 0;

  return (a ^ -1252372727 ^ (a >>> 16)) | 0;
}

// Reads a 64-bit little-endian integer from an array
function readU64(b: Uint8Array, n: number): number {
  return (
    b[n++] |
    (b[n++] << 8) |
    (b[n++] << 16) |
    (b[n++] << 24) |
    (b[n++] << 32) |
    (b[n++] << 40) |
    (b[n++] << 48) |
    (b[n] << 56)
  );
}

// Reads a 32-bit little-endian integer from an array
function readU32(b: Uint8Array, n: number): number {
  return b[n++] | (b[n++] << 8) | (b[n++] << 16) | (b[n] << 24);
}

// Writes a 32-bit little-endian integer to an array
function writeU32(b: Uint8Array, n: number, x: number): void {
  b[n++] = x & 0xff;
  b[n++] = (x >> 8) & 0xff;
  b[n++] = (x >> 16) & 0xff;
  b[n] = (x >> 24) & 0xff;
}

// Constants
// --

// Compression format parameters/constants
const minMatch = 4;
// const minLength = 13;
const matchSearchLimit = 12;
const minTrailingLitterals = 5;

//const searchLimit = 5;
const skipTrigger = 6;

// Token constants
const mlBits = 4;
const mlMask = (1 << mlBits) - 1;
const runBits = 4;
const runMask = (1 << runBits) - 1;

// Frame descriptor flags
const fdContentSize = 0x8;
const fdBlockChksum = 0x10;
const fdVersion = 0x40; // XXX 0x60 ?
const fdVersionMask = 0xc0;

// Block sizes
const bsUncompressed = 0x80000000;
// const bsDefault = 7;
const bsShift = 4;
const bsMask = 7;

// Implementation
// --

// Calculates an upper bound for lz4 compression
function compressBound(n: number): number {
  return (n + n / 255 + 16) | 0;
}

// Calculates an upper bound for lz4 decompression, by reading the data
function decompressBound(src: Buffer): number {
  // Read magic number
  if (readU32(src, 0) !== 0x184d2204) {
    throw new Error('invalid magic number');
  }

  let sIndex = 4;

  // Read descriptor
  const descriptor = src[sIndex++];

  // Check version
  if ((descriptor & fdVersionMask) !== fdVersion) {
    throw new Error(
      'incompatible descriptor version ' + (descriptor & fdVersionMask),
    );
  }

  // Get content size
  if ((descriptor & fdContentSize) !== 0) return readU64(src, sIndex);

  const useBlockSum = (descriptor & fdBlockChksum) !== 0;

  // Read block size
  const bsIdx: number = (src[sIndex++] >> bsShift) & bsMask;

  const maxBlockSize: number | undefined = {
    4: 0x10000,
    5: 0x40000,
    6: 0x100000,
    7: 0x400000,
  }[bsIdx];

  if (typeof maxBlockSize === 'undefined') {
    throw new Error(`invalid block size bsIdx: ${bsIdx}`);
  }

  // Checksum
  sIndex++;

  // Read blocks
  let maxSize = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let blockSize = readU32(src, sIndex);
    sIndex += 4;

    if (blockSize & bsUncompressed) {
      blockSize &= ~bsUncompressed;
      maxSize += blockSize;
    } else if (blockSize > 0) {
      maxSize += maxBlockSize;
    }

    if (blockSize === 0) {
      return maxSize;
    }

    if (useBlockSum) {
      sIndex += 4;
    }

    sIndex += blockSize;
  }
}

// Decompresses a block of Lz4
function decompressBlock(
  src: Buffer,
  dst: Uint8Array,
  sIndex: number,
  sLength: number,
  dIndex: number,
): number {
  // Setup initial state
  const sEnd = sIndex + sLength;

  // Consume entire input block
  while (sIndex < sEnd) {
    const token = src[sIndex++];

    // Copy literals
    let literalCount = token >> 4;
    if (literalCount > 0) {
      // Parse length
      if (literalCount === 0xf) {
        let plVal;
        do {
          plVal = src[sIndex++];
          literalCount += plVal;
        } while (plVal === 0xff);
      }

      // Copy literals
      const end = sIndex + literalCount;
      while (sIndex < end) {
        dst[dIndex++] = src[sIndex++];
      }
    }

    if (sIndex >= sEnd) {
      break;
    }

    // Copy match
    let mLength = token & 0xf;

    // Parse offset
    const mOffset = src[sIndex++] | (src[sIndex++] << 8);

    // Parse length
    if (mLength === 0xf) {
      let plVal;
      do {
        plVal = src[sIndex++];
        mLength += plVal;
      } while (plVal === 0xff);
    }

    mLength += minMatch;

    // Copy match
    // XXX these thresholds seem ok,
    // but can probably be improved
    if (mOffset === 1) {
      dst.fill(dst[dIndex - 1] | 0, dIndex, dIndex + mLength);
      dIndex += mLength;
    } else if (mOffset > mLength) {
      const start = dIndex - mOffset;
      const end = start + mLength;

      //if (mLength > 60) {
      //dst.copyWithin(dIndex, start, end);
      //dIndex += mLength;
      //} else {
      for (let i = start; i < end; ++i) {
        dst[dIndex++] = dst[i] | 0;
      }
      //}
    } else {
      const start = dIndex - mOffset;
      const copyX = (mLength / mOffset) | 0;
      const dupe = dst.subarray(start, dIndex);

      for (let cx = 0; cx < copyX; ++cx) {
        dst.set(dupe, dIndex);
        dIndex += mOffset;
      }

      const bEnd = start + mLength - copyX * mOffset;
      for (let i = start; i < bEnd; ++i) {
        dst[dIndex++] = dst[i] | 0;
      }
    }
  }

  return dIndex;
}

// Compresses a block with Lz4
function compressBlock(
  src: Buffer,
  dst: Uint8Array,
  sIndex: number,
  sLength: number,
  hashTable: Uint32Array,
): number {
  // Setup initial state
  const sEnd = sLength + sIndex;
  let dIndex = 0;
  let mAnchor = sIndex;

  let searchMatchCount = (1 << skipTrigger) + 3;

  // Search for matches with a limit of matchSearchLimit bytes
  // before the end of block (Lz4 spec limitation.)
  while (sIndex <= sEnd - matchSearchLimit) {
    const seq = readU32(src, sIndex);
    let hash = hashU32(seq) >>> 0;

    // Crush hash to 16 bits.
    hash = (((hash >> 16) ^ hash) >>> 0) & 0xffff;

    // Look for a match in the hashtable. NOTE: remove one; see below
    let mIndex = hashTable[hash] - 1;

    // Put pos in hash table. NOTE: add one so that zero = invalid
    hashTable[hash] = sIndex + 1;

    // Determine if there is a match (within range)
    if (
      mIndex < 0 ||
      (sIndex - mIndex) >>> 16 > 0 ||
      readU32(src, mIndex) !== seq
    ) {
      sIndex += searchMatchCount++ >> skipTrigger;
      continue;
    }

    searchMatchCount = (1 << skipTrigger) + 3;

    // Calculate literal count and offset
    const literalCount = sIndex - mAnchor;
    const mOffset = sIndex - mIndex;

    // We've already matched one word, so get that out of the way
    sIndex += minMatch;
    mIndex += minMatch;

    // Determine match length.
    // N.B.: mLength does not include minMatch, Lz4 adds it back
    // in decoding
    let mLength = sIndex;
    while (
      sIndex < sEnd - minTrailingLitterals &&
      src[sIndex] === src[mIndex]
    ) {
      sIndex++;
      mIndex++;
    }
    mLength = sIndex - mLength;

    // Write token + literal count
    const token = mLength < mlMask ? mLength : mlMask;
    if (literalCount >= runMask) {
      dst[dIndex++] = (runMask << mlBits) + token;
      let n = literalCount - runMask;
      while (n >= 0xff) {
        dst[dIndex++] = 0xff;
        n -= 0xff;
      }
      dst[dIndex++] = n;
    } else {
      dst[dIndex++] = (literalCount << mlBits) + token;
    }

    // Write literals
    for (let i = mAnchor; i < mAnchor + literalCount; i++) {
      dst[dIndex++] = src[i];
    }

    // Write offset
    dst[dIndex++] = mOffset;
    dst[dIndex++] = mOffset >> 8;

    // Write match length
    if (mLength >= mlMask) {
      let n = mLength - mlMask;
      while (n >= 0xff) {
        dst[dIndex++] = 0xff;
        n -= 0xff;
      }
      dst[dIndex++] = n;
    }

    // Move the anchor
    mAnchor = sIndex;
  }

  // Nothing was encoded
  if (mAnchor === 0) {
    return 0;
  }

  // Write remaining literals
  // Write literal token+count
  const literalCount = sEnd - mAnchor;
  if (literalCount >= runMask) {
    dst[dIndex++] = runMask << mlBits;
    let n = literalCount - runMask;
    while (n >= 0xff) {
      dst[dIndex++] = 0xff;
      n -= 0xff;
    }
    dst[dIndex++] = n;
  } else {
    dst[dIndex++] = literalCount << mlBits;
  }

  // Write literals
  sIndex = mAnchor;
  while (sIndex < sEnd) {
    dst[dIndex++] = src[sIndex++];
  }

  return dIndex;
}

// Compresses data to an Lz4 frame
export function compress(src: Buffer): Uint8Array {
  const maxSize = compressBound(src.length);
  const dst = new Uint8Array(maxSize);

  // Frame constants + checksum
  dst.set(new Uint8Array([4, 34, 77, 24, 96, 112, 115]), 0);
  let dIndex = 7;

  // Write blocks
  const maxBlockSize = 0x400000;
  const hashTable = new Uint32Array(1 << 16);
  let remaining = src.length;
  let sIndex = 0;

  // Split input into blocks and write
  const blockBuf = new Uint8Array(5 << 20);
  while (remaining > 0) {
    const blockSize = remaining > maxBlockSize ? maxBlockSize : remaining;
    const compSize = compressBlock(src, blockBuf, sIndex, blockSize, hashTable);

    if (compSize > blockSize || compSize === 0) {
      // Output uncompressed
      writeU32(dst, dIndex, 0x80000000 | blockSize);
      dIndex += 4;

      dst.set(src.subarray(sIndex, sIndex + blockSize), dIndex);
      dIndex += blockSize;
    } else {
      // Output compressed
      writeU32(dst, dIndex, compSize);
      dIndex += 4;

      dst.set(blockBuf.subarray(0, compSize), dIndex);
      dIndex += compSize;
    }
    sIndex += blockSize;
    remaining -= blockSize;
  }

  // Set blank end block
  dIndex += 4;

  return dst.subarray(0, dIndex);
}

// Decompresses a buffer containing an Lz4 frame
export function decompress(src: Buffer): Uint8Array {
  let dIndex = 0;
  let sIndex = 4; // Skips magic number

  // Read descriptor
  const descriptor = src[sIndex++];

  // Check version
  if ((descriptor & fdVersionMask) !== fdVersion) {
    throw new Error('incompatible descriptor version');
  }

  // Read flags
  const useBlockSum = (descriptor & fdBlockChksum) !== 0;
  //const usesContentSum = (descriptor & fdContentChksum) !== 0;
  const usesContentSize = (descriptor & fdContentSize) !== 0;

  sIndex++; // Skip the flags byte

  const maxSize = decompressBound(src);
  const dst = new Uint8Array(maxSize);
  if (usesContentSize) {
    sIndex += 8; // Skip the content size field
  }

  sIndex++; // Skip the block size ID

  // Read blocks
  let compSize = readU32(src, sIndex);
  sIndex += 4;
  do {
    if (useBlockSum) {
      sIndex += 4; // Skip the block checksum
    }

    // Check if block is compressed
    if ((compSize & bsUncompressed) !== 0) {
      // Uncompressed block
      compSize &= ~bsUncompressed;

      dst.set(src.subarray(sIndex, sIndex + compSize), dIndex);
      dIndex += compSize;
      sIndex += compSize;
    } else {
      // Compressed block
      dIndex = decompressBlock(src, dst, sIndex, compSize, dIndex);
      sIndex += compSize;
    }

    compSize = readU32(src, sIndex);
    sIndex += 4;
  } while (compSize !== 0);

  /*
  if (usesContentSum) {
    // XXX safe mode: validate checksum
    sIndex += 4;
  }
  */

  return dst.subarray(0, dIndex);
}

export const codec = () => ({
  compress: (encoder: { buffer: Buffer }) => {
    const compressed = compress(encoder.buffer);
    return Buffer.from(compressed);
  },

  decompress: (buffer: Buffer) => {
    const decompressed = decompress(buffer);
    return Buffer.from(decompressed);
  },
});
