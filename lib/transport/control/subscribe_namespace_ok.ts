import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"



export interface SubscribeNamespaceOk {
    id: bigint,
}


export namespace SubscribeNamespaceOk {
    export function serialize(v: SubscribeNamespaceOk): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.SubscribeNamespaceOk)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putVarInt(v.id)
        mainBuf.putU16(payloadBuf.length)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): SubscribeNamespaceOk {
        const id = reader.getVarInt()
        return {
            id,
        }
    }
}