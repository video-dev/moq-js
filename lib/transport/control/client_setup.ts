import { ControlMessageType, Version } from "."
import { KeyValuePairs, Parameters } from "../data_structure"
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"

export interface ClientSetup {
    versions: Version[]
    params?: Parameters
}

export namespace ClientSetup {
    export function serialize(v: ClientSetup): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.ClientSetup)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putVarInt(v.versions.length)
        v.versions.forEach((version) => {
            payloadBuf.putVarInt(version)
        })
        if (v.params) {
            payloadBuf.putBytes(KeyValuePairs.serialize(v.params))
        }
        mainBuf.putU16(payloadBuf.length)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): ClientSetup {
        const supportedVersionLen = reader.getNumberVarInt()
        const versions: Version[] = []
        for (let i = 0; i < supportedVersionLen; i++) {
            versions.push(reader.getNumberVarInt() as Version)
        }
        const paramLen = reader.getNumberVarInt()
        if (paramLen == 0) {
            return {
                versions,
                params: undefined
            }
        }
        return {
            versions,
            params: KeyValuePairs.deserialize(reader)
        }
    }
}