import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"


export interface MaxRequestId {
    id: bigint
}

export namespace MaxRequestId {
    export function serialize(v: MaxRequestId): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.MaxRequestId)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putVarInt(v.id)

        mainBuf.putU16(payloadBuf.byteLength)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): MaxRequestId {
        const id = reader.getVarInt()
        return {
            id,
        }
    }
}