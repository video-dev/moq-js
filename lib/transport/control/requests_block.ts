import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"


export interface RequestsBlocked {
    id: bigint
}

export namespace RequestsBlocked {
    export function serialize(v: RequestsBlocked): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.RequestsBlocked)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putVarInt(v.id)

        mainBuf.putU16(payloadBuf.length)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): RequestsBlocked {
        const id = reader.getVarInt()
        return {
            id,
        }
    }
}