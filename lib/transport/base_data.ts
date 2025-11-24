import { ImmutableBytesBuffer, MutableBytesBuffer, Reader } from "./buffer"

export type Tuple<T = any> = TupleField<T>[]
export type TupleField<T = any> = T // can be any type

export namespace Tuple {
    // Serialize implementation - only works for types where TupleField.serialize is implemented
    export function serialize<T extends string>(tuple: Tuple<T>): Uint8Array {
        const buf = new MutableBytesBuffer(new Uint8Array())
        buf.putVarInt(tuple.length)
        tuple.forEach(field => {
            const serialized = TupleField.serialize(field)
            buf.putBytes(serialized)
        })
        return buf.Uint8Array
    }

    // Deserialize implementation - only works for types where TupleField.deserialize is implemented
    export function deserialize<T extends string>(buffer: ImmutableBytesBuffer): Tuple<T> {
        const tuple: T[] = []
        const len = buffer.getVarInt()
        for (let i = 0; i < len; i++) {
            const field = TupleField.deserialize<T>(buffer)
            tuple.push(field)
        }
        return tuple
    }
}

export namespace TupleField {
    // Serialize implementation for string fields only
    export function serialize<T extends string>(field: T): Uint8Array {
        const buf = new MutableBytesBuffer(new Uint8Array())
        const encoded = new TextEncoder().encode(field)
        buf.putVarInt(encoded.length)
        buf.putBytes(encoded)
        return buf.Uint8Array
    }

    // Deserialize implementation for string fields only
    export function deserialize<T extends string>(buffer: ImmutableBytesBuffer): T {
        const field = buffer.getVarBytes()
        return new TextDecoder().decode(field) as T
    }
}

export type Location = {
    group: bigint
    object: bigint
}

export namespace Location {
    export function serialize(location: Location): Uint8Array {
        const buf = new MutableBytesBuffer(new Uint8Array())
        buf.putVarInt(location.group)
        buf.putVarInt(location.object)
        return buf.Uint8Array
    }

    export function deserialize(buffer: ImmutableBytesBuffer): Location {
        const group = buffer.getVarInt()
        const object = buffer.getVarInt()
        return { group, object }
    }
}


// TODO(itzmanish): have checks for key type for even or odd
export type KeyValuePairs = Map<bigint, Uint8Array | bigint>
export type Parameters = KeyValuePairs


export namespace KeyValuePairs {
    export function valueIsVarInt(key: bigint): boolean {
        return (key & 1n) === 0n
    }

    export function serialize(pairs: Parameters): Uint8Array {
        const buf = new MutableBytesBuffer(new Uint8Array())
        buf.putVarInt(pairs.size)
        pairs.forEach((value, key) => {
            buf.putVarInt(key)
            if (valueIsVarInt(key)) {
                buf.putVarInt(value as bigint)
            } else {
                buf.putBytes(value as Uint8Array)
            }
        })

        return buf.Uint8Array
    }

    export function deserialize(buffer: ImmutableBytesBuffer): KeyValuePairs {
        const size = buffer.getNumberVarInt()
        return deserialize_with_size(buffer, size)
    }

    export function deserialize_with_size(buffer: ImmutableBytesBuffer, size: number): KeyValuePairs {
        const pairs = new Map<bigint, Uint8Array | bigint>()
        for (let i = 0; i < size; i++) {
            const key = buffer.getVarInt()
            const value = valueIsVarInt(key) ? buffer.getVarInt() : buffer.getVarBytes()
            pairs.set(key, value)
        }

        return pairs
    }

    export async function deserialize_with_reader(reader: Reader): Promise<KeyValuePairs> {
        const size = await reader.getNumberVarInt()
        const pairs = new Map<bigint, Uint8Array | bigint>()
        for (let i = 0; i < size; i++) {
            const key = await reader.getVarInt()
            const value = valueIsVarInt(key) ? await reader.getVarInt() : await reader.getVarBytes()
            pairs.set(key, value)
        }

        return pairs
    }
}


export namespace Parameters {
    export function valueIsVarInt(key: bigint): boolean {
        return KeyValuePairs.valueIsVarInt(key)
    }

    export function serialize(pairs: Parameters): Uint8Array {
        return KeyValuePairs.serialize(pairs)
    }

    export function deserialize(buffer: ImmutableBytesBuffer): Parameters {
        return KeyValuePairs.deserialize(buffer)
    }

    export function deserialize_with_size(buffer: ImmutableBytesBuffer, size: number): Parameters {
        return KeyValuePairs.deserialize_with_size(buffer, size)
    }

    export async function deserialize_with_reader(reader: Reader): Promise<Parameters> {
        return KeyValuePairs.deserialize_with_reader(reader)
    }
}