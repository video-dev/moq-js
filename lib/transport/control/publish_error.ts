import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"


export interface PublishError {
    id: bigint
    code: bigint
    reason: string
}

export namespace PublishError {
    export function serialize(v: PublishError): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.PublishError)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putVarInt(v.id)
        payloadBuf.putVarInt(v.code)
        payloadBuf.putUtf8String(v.reason)

        mainBuf.putU16(payloadBuf.byteLength)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): PublishError {
        const id = reader.getVarInt()
        const code = reader.getVarInt()
        const reason = reader.getUtf8String()
        return {
            id,
            code,
            reason
        }
    }
}