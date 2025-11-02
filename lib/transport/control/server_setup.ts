import { ControlMessageType, Version } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Parameters, KeyValuePairs } from "../data_structure"

export interface ServerSetup {
    version: Version
    params?: Parameters
}

export namespace ServerSetup {
    export function serialize(v: ServerSetup): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.ServerSetup)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putVarInt(v.version)
        if (v.params) {
            payloadBuf.putBytes(KeyValuePairs.serialize(v.params))
        }
        mainBuf.putU16(payloadBuf.length)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(r: Uint8Array): ServerSetup {
        const reader = new ImmutableBytesBuffer(r)
        const version = reader.getNumberVarInt() as Version
        const paramLen = reader.getNumberVarInt()
        if (paramLen == 0) {
            return {
                version,
                params: undefined
            }
        }
        return {
            version,
            params: KeyValuePairs.deserialize(reader)
        }
    }
}