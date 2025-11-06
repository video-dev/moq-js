import { ControlMessageType, GroupOrder } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Parameters, Location, Tuple } from "../base_data"

export interface Publish {
    id: bigint
    track_alias: bigint // Publisher-specified
    namespace: Tuple<string>
    name: string
    content_exists: number // 0 or 1
    group_order: GroupOrder
    largest_location?: Location // largest location of group or object if content_exists == 1
    forward: number // 0 or 1
    params?: Parameters
}


export namespace Publish {
    export function serialize(v: Publish): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.Publish)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putVarInt(v.id)
        payloadBuf.putVarInt(v.track_alias)
        payloadBuf.putBytes(Tuple.serialize(v.namespace))
        payloadBuf.putUtf8String(v.name)
        payloadBuf.putU8(v.content_exists)
        payloadBuf.putBytes(GroupOrder.serialize(v.group_order))
        if (v.largest_location) {
            payloadBuf.putBytes(Location.serialize(v.largest_location))
        }
        payloadBuf.putU8(v.forward)
        if (v.params) {
            payloadBuf.putBytes(Parameters.serialize(v.params))
        }
        mainBuf.putU16(payloadBuf.length)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): Publish {
        const id = reader.getVarInt()
        const track_alias = reader.getVarInt()
        const namespace = Tuple.deserialize(reader)
        const name = reader.getUtf8String()
        const content_exists = reader.getU8()
        const group_order = GroupOrder.deserialize(reader)
        const largest_location = Location.deserialize(reader)
        const forward = reader.getU8()
        const params = Parameters.deserialize(reader)
        return {
            id,
            track_alias,
            namespace,
            name,
            content_exists,
            group_order,
            largest_location,
            forward,
            params
        }
    }
}
