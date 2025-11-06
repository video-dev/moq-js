import { ControlMessageType, FilterType, GroupOrder } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Location, Parameters } from "../base_data"



export interface PublishOk {
    id: bigint // Request ID
    forward: number // 0 or 1 u8
    subscriber_priority: number // u8
    group_order: GroupOrder
    filter_type: FilterType
    start_location?: Location
    end_group?: bigint
    params?: Parameters
}

export namespace PublishOk {
    export function serialize(v: PublishOk): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.PublishOk)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putVarInt(v.id)
        payloadBuf.putU8(v.forward)
        payloadBuf.putU8(v.subscriber_priority)
        payloadBuf.putBytes(GroupOrder.serialize(v.group_order))
        payloadBuf.putBytes(FilterType.serialize(v.filter_type))
        if (v.start_location) {
            payloadBuf.putBytes(Location.serialize(v.start_location))
        }
        if (v.end_group) {
            payloadBuf.putVarInt(v.end_group)
        }
        if (v.params) {
            payloadBuf.putBytes(Parameters.serialize(v.params))
        }

        mainBuf.putU16(payloadBuf.length)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): PublishOk {
        const id = reader.getVarInt()
        const forward = reader.getU8()
        const subscriber_priority = reader.getU8()
        const group_order = GroupOrder.deserialize(reader)
        const filter_type = FilterType.deserialize(reader)
        let start_location: Location | undefined = undefined
        if (filter_type == FilterType.AbsoluteStart || filter_type == FilterType.AbsoluteRange) {
            start_location = Location.deserialize(reader)
        }
        let end_group: bigint | undefined = undefined
        if (filter_type == FilterType.AbsoluteRange) {
            end_group = reader.getVarInt()
        }
        let params: Parameters | undefined = undefined
        if (reader.remaining > 0) {
            params = Parameters.deserialize(reader)
        }
        return {
            id,
            forward,
            subscriber_priority,
            group_order,
            filter_type,
            start_location,
            end_group,
            params
        }
    }
}