import { ControlMessageType, Version } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Parameters } from "../data_structure"

export interface ServerSetup {
    version: Version
    params: Parameters
}

export namespace ServerSetup {
    export function serialize(v: ServerSetup): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.ServerSetup)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putVarInt(v.version)
        payloadBuf.putBytes(Parameters.serialize(v.params))
        mainBuf.putU16(payloadBuf.length)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): ServerSetup {
        const version = reader.getNumberVarInt() as Version
        return {
            version,
            params: Parameters.deserialize(reader)
        }
    }
}