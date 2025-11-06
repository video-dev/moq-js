import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Tuple } from "../base_data"

export interface PublishNamespaceOk {
    namespace: Tuple<string>
}

export namespace PublishNamespaceOk {
    export function serialize(v: PublishNamespaceOk): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.PublishNamespaceOk)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putBytes(Tuple.serialize(v.namespace))

        mainBuf.putU16(payloadBuf.length)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): PublishNamespaceOk {
        const namespace = Tuple.deserialize(reader)
        return {
            namespace
        }
    }
}