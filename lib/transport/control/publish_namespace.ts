import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Parameters, Tuple } from "../base_data"


export interface PublishNamespace {
    id: bigint
    namespace: Tuple<string>
    params?: Parameters
}

export namespace PublishNamespace {
    export function serialize(v: PublishNamespace): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.PublishNamespace)

        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putVarInt(v.id)
        payloadBuf.putBytes(Tuple.serialize(v.namespace))
        payloadBuf.putBytes(Parameters.serialize(v.params ?? new Map()))

        mainBuf.putU16(payloadBuf.byteLength)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): PublishNamespace {
        const id = reader.getVarInt()
        const namespace = Tuple.deserialize(reader)
        const params = Parameters.deserialize(reader)
        return {
            id,
            namespace,
            params
        }
    }
}