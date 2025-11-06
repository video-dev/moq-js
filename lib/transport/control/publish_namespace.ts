import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Parameters, Tuple } from "../base_data"


export interface PublishNamespace {
    namespace: Tuple<string>
    params?: Parameters
}

export namespace PublishNamespace {
    export function serialize(v: PublishNamespace): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.PublishNamespace)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putVarInt(v.namespace.length)
        for (const ns of v.namespace) {
            payloadBuf.putUtf8String(ns)
        }
        if (v.params) {
            payloadBuf.putBytes(Parameters.serialize(v.params))
        }

        mainBuf.putU16(payloadBuf.length)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): PublishNamespace {
        const namespace = Tuple.deserialize(reader)
        let params: Parameters | undefined = undefined
        if (reader.remaining > 0) {
            params = Parameters.deserialize(reader)
        }
        return {
            namespace,
            params
        }
    }
}