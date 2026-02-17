import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"

export interface PublishNamespaceOk {
    id: bigint
}

export namespace PublishNamespaceOk {
    export function serialize(v: PublishNamespaceOk): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.PublishNamespaceOk)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putVarInt(v.id)

        mainBuf.putU16(payloadBuf.byteLength)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): PublishNamespaceOk {
        const id = reader.getVarInt()
        return {
            id
        }
    }
}