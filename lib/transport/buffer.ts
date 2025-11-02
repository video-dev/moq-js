

const MAX_U6 = Math.pow(2, 6) - 1 // 0-63 (6 bits)
const MAX_U14 = Math.pow(2, 14) - 1 // 0-16383 (14 bits)
const MAX_U30 = Math.pow(2, 30) - 1 // 0-1073741823 (30 bits)
const MAX_U53 = Number.MAX_SAFE_INTEGER
const MAX_U62: bigint = 2n ** 62n - 1n // 0-4611686018427387903 (62 bits)

import { debug } from "./utils";



class BytesBuffer {
    buffer: Uint8Array
    view: DataView
    offset = 0

    constructor(buffer: Uint8Array) {
        this.buffer = buffer
        this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.length)
    }

    getOffset(): number {
        return this.offset
    }

    get length(): number {
        return this.buffer.length
    }

    get remaining(): number {
        return this.length - this.offset
    }

    get Uint8Array(): Uint8Array {
        return this.buffer.slice(0, this.offset)
    }

    getU8(): number {
        if (this.remaining < 1) throw new Error("not enough bytes")
        const val = this.view.getUint8(this.offset)
        this.offset += 1
        return val
    }

    getU16(): number {
        if (this.remaining < 2) throw new Error("not enough bytes")
        const val = this.view.getUint16(this.offset)
        this.offset += 2
        return val
    }

    getU32(): number {
        if (this.remaining < 4) throw new Error("not enough bytes")
        const val = this.view.getUint32(this.offset)
        this.offset += 4
        return val
    }

    getU64(): bigint {
        if (this.remaining < 8) throw new Error("not enough bytes")
        const val = this.view.getBigUint64(this.offset)
        this.offset += 8
        return val
    }

    getVarInt(): bigint {
        if (this.remaining < 1) throw new Error("not enough bytes")

        // Read first byte to determine length
        const first = this.view.getUint8(this.offset)
        const prefix = (first & 0b11000000) >> 6  // Top 2 bits indicate length

        if (prefix === 0) {
            // 1 byte: 00xxxxxx
            this.offset += 1
            return BigInt(first & 0x3f)
        } else if (prefix === 1) {
            // 2 bytes: 01xxxxxx xxxxxxxx
            if (this.remaining < 2) throw new Error("not enough bytes")
            const val = this.view.getUint16(this.offset)
            this.offset += 2
            return BigInt(val & 0x3fff)
        } else if (prefix === 2) {
            // 4 bytes: 10xxxxxx xxxxxxxx xxxxxxxx xxxxxxxx
            if (this.remaining < 4) throw new Error("not enough bytes")
            const val = this.view.getUint32(this.offset)
            this.offset += 4
            return BigInt(val & 0x3fffffff)
        } else {
            // 8 bytes: 11xxxxxx xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx
            if (this.remaining < 8) throw new Error("not enough bytes")
            const val = this.view.getBigUint64(this.offset)
            this.offset += 8
            return val & 0x3fffffffffffffffn
        }
    }

    getNumberVarInt(): number {
        const val = this.getVarInt()
        if (val > Number.MAX_SAFE_INTEGER) throw new Error("varint too large")
        return Number(val)
    }

    getBytes(len: number): Uint8Array {
        if (this.remaining < len) throw new Error("not enough bytes")
        const val = this.buffer.slice(this.offset, this.offset + len)
        this.offset += len
        return val
    }

    getVarBytes(): Uint8Array {
        const len = this.getNumberVarInt()
        return this.getBytes(len)
    }

    getUtf8String(): string {
        const len = this.getNumberVarInt()
        const val = this.getBytes(len)
        return new TextDecoder().decode(val)
    }
}

export class MutableBytesBuffer extends BytesBuffer {
    constructor(buffer: Uint8Array) {
        super(buffer)
    }

    enoughSpaceAvailable(len: number): void {
        const required = this.offset + len
        if (required < this.buffer.length) {
            return
        }


        const newBuffer = new Uint8Array(nextPow2(required))
        newBuffer.set(this.buffer.subarray(0, this.offset))
        this.buffer = newBuffer
        this.view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength)
    }

    putU8(v: number) {
        this.enoughSpaceAvailable(1)
        this.view.setUint8(this.offset, v)
        this.offset += 1
    }

    putU16(v: number) {
        this.enoughSpaceAvailable(2)
        this.view.setUint16(this.offset, v)
        this.offset += 2
    }

    putU32(v: number) {
        this.enoughSpaceAvailable(4)
        this.view.setUint32(this.offset, v)
        this.offset += 4
    }

    putU64(v: bigint) {
        this.enoughSpaceAvailable(8)
        this.view.setBigUint64(this.offset, v)
        this.offset += 8
    }

    putVarInt(v: number | bigint) {
        const value = typeof v === "number" ? BigInt(v) : v
        if (value < 0) throw new Error("underflow, value is negative: " + v)

        let length: number
        let prefix: number

        if (value < MAX_U6) {
            // 1 byte: 00xxxxxx
            length = 1
            prefix = 0x00
        } else if (value < MAX_U14) {
            // 2 bytes: 01xxxxxx xxxxxxxx
            length = 2
            prefix = 0x40
        } else if (value < MAX_U30) {
            // 4 bytes: 10xxxxxx xxxxxxxx xxxxxxxx xxxxxxxx
            length = 4
            prefix = 0x80
        } else if (value <= MAX_U62) {
            // 8 bytes: 11xxxxxx xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx
            length = 8
            prefix = 0xc0
        } else {
            throw new Error("overflow, value larger than 62-bits: " + v)
        }

        this.enoughSpaceAvailable(length)

        // Write first byte with prefix
        const shift = BigInt((length - 1) * 8)
        this.putU8(Number((value >> shift) | BigInt(prefix)))

        // Write remaining bytes
        for (let i = length - 2; i >= 0; i--) {
            this.putU8(Number((value >> BigInt(i * 8)) & 0xffn))
        }
    }

    putBytes(v: Uint8Array) {
        this.enoughSpaceAvailable(v.length)
        this.buffer.set(v, this.offset)
        this.offset += v.length
    }

    putUtf8String(v: string) {
        const bytes = new TextEncoder().encode(v)
        this.putLengthPrefixedByteArray(bytes.length, bytes)
    }

    putLengthPrefixedByteArray(len: number, v: Uint8Array) {
        this.putVarInt(len)
        this.putBytes(v)
    }

}

export class ImmutableBytesBuffer extends BytesBuffer {
    constructor(buffer: Uint8Array) {
        super(buffer)
    }

    get length(): number {
        return this.buffer.length
    }
}

function nextPow2(x: number): number {
    // Handle edge cases
    if (x <= 1) return 1;

    // Decrement to handle exact powers of 2
    x--;

    // Fill all bits below the highest set bit
    x = x | (x >> 1);
    x = x | (x >> 2);
    x = x | (x >> 4);
    x = x | (x >> 8);
    x = x | (x >> 16);

    // Increment to get next power of 2
    return x + 1;
}