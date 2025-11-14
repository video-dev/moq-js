import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Tuple } from "../base_data"

export interface PublishNamespaceDone {
    namespace: Tuple<string>
}

export namespace PublishNamespaceDone {
    export function serialize(v: PublishNamespaceDone): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.PublishNamespaceDone)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putBytes(Tuple.serialize(v.namespace))

        mainBuf.putU16(payloadBuf.byteLength)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): PublishNamespaceDone {
        const namespace = Tuple.deserialize(reader)
        return {
            namespace,
        }
    }
}