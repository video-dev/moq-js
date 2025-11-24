import { ControlMessageType, FilterType, GroupOrder } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Tuple, Parameters, Location, KeyValuePairs } from "../base_data"


export interface SubscribeNamespace {
    id: bigint,
    namespace: string[]
    params?: Parameters
}


export namespace SubscribeNamespace {
    export function serialize(v: SubscribeNamespace): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.SubscribeNamespace)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putVarInt(v.id)
        payloadBuf.putBytes(Tuple.serialize(v.namespace))
        payloadBuf.putBytes(KeyValuePairs.serialize(v.params ?? new Map()))
        mainBuf.putU16(payloadBuf.byteLength)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): SubscribeNamespace {
        const id = reader.getVarInt()
        const namespace = Tuple.deserialize(reader)
        let params: Parameters | undefined
        if (reader.remaining > 0) {
            params = KeyValuePairs.deserialize(reader)
        }
        return {
            id,
            namespace,
            params
        }
    }
}