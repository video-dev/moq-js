import { ControlMessageType } from "."
import { GroupOrder } from "./subscribe"
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Parameters, Location } from "../base_data"


export interface SubscribeOk {
    id: bigint // Request ID
    track_alias: bigint // Publisher-specified in draft-14
    expires: bigint
    group_order: GroupOrder
    content_exists: number // 0 or 1
    largest_location?: Location
    params: Parameters
}
export namespace SubscribeOk {
    export function serialize(v: SubscribeOk): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.SubscribeOk)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putVarInt(v.id)
        payloadBuf.putVarInt(v.track_alias)
        payloadBuf.putVarInt(v.expires)
        payloadBuf.putBytes(GroupOrder.serialize(v.group_order))
        payloadBuf.putU8(v.content_exists)
        if (v.content_exists) {
            if (!v.largest_location) {
                throw new Error('largest_location required for content_exists')
            }
            payloadBuf.putBytes(Location.serialize(v.largest_location))
        }

        payloadBuf.putBytes(Parameters.serialize(v.params))

        mainBuf.putU16(payloadBuf.length)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): SubscribeOk {
        const id = reader.getVarInt()
        const track_alias = reader.getVarInt()
        const expires = reader.getVarInt()
        const group_order = GroupOrder.deserialize(reader)
        const content_exists = reader.getNumberVarInt()
        if (content_exists != 0 && content_exists != 1) {
            throw new Error("Invalid content_exists value")
        }
        let largest_location: Location | undefined
        if (content_exists) {
            largest_location = Location.deserialize(reader)
        }
        const params = Parameters.deserialize(reader)
        return {
            id,
            track_alias,
            expires,
            group_order,
            content_exists,
            largest_location,
            params
        }
    }
}