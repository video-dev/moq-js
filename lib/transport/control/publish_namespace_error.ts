import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Tuple } from "../base_data"



export interface PublishNamespaceError {
    namespace: Tuple<string>
    code: bigint
    reason: string
}

export namespace PublishNamespaceError {
    export function serialize(v: PublishNamespaceError): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.PublishNamespaceError)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putBytes(Tuple.serialize(v.namespace))
        payloadBuf.putVarInt(v.code)
        payloadBuf.putUtf8String(v.reason)

        mainBuf.putU16(payloadBuf.length)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): PublishNamespaceError {
        const namespace = Tuple.deserialize(reader)
        const code = reader.getVarInt()
        const reason = reader.getUtf8String()
        return {
            namespace,
            code,
            reason
        }
    }
}