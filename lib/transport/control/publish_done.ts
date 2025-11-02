import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"


export interface PublishDone {
    id: bigint
    code: bigint
    stream_count: bigint
    reason: string
}

export namespace PublishDone {
    export function serialize(v: PublishDone): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.PublishDone)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putVarInt(v.id)
        payloadBuf.putVarInt(v.code)
        payloadBuf.putVarInt(v.stream_count)
        payloadBuf.putUtf8String(v.reason)

        mainBuf.putU16(payloadBuf.length)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): PublishDone {
        const id = reader.getVarInt()
        const code = reader.getVarInt()
        const stream_count = reader.getVarInt()
        const reason = reader.getUtf8String()
        return {
            id,
            code,
            stream_count,
            reason
        }
    }
}