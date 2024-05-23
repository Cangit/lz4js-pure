/// <reference types="node" resolution-mode="require"/>
export declare function compress(src: Buffer): Uint8Array;
export declare function decompress(src: Buffer): Uint8Array;
export declare const codec: () => {
    compress: (encoder: {
        buffer: Buffer;
    }) => Buffer;
    decompress: (buffer: Buffer) => Buffer;
};
//# sourceMappingURL=lz4.d.ts.map