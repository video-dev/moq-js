import { ControlMessageType } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Tuple, Parameters, Location, KeyValuePairs } from "../base_data"
import { debug } from "../utils"

export enum GroupOrder {
    Publisher = 0x0,
    Ascending = 0x1,
    Descending = 0x2,
}

export namespace GroupOrder {
    export function serialize(v: GroupOrder): Uint8Array {
        const buf = new MutableBytesBuffer(new Uint8Array())
        buf.putU8(v)
        return buf.Uint8Array
    }

    export function deserialize(buffer: ImmutableBytesBuffer): GroupOrder {
        const order = buffer.getU8()
        switch (order) {
            case 0:
                return GroupOrder.Publisher
            case 1:
                return GroupOrder.Ascending
            case 2:
                return GroupOrder.Descending
            default:
                throw new Error(`Invalid GroupOrder value: ${order}`)
        }
    }
}

export enum FilterType {
    NextGroupStart = 0x1,
    LargestObject = 0x2,
    AbsoluteStart = 0x3,
    AbsoluteRange = 0x4,
}

export namespace FilterType {
    export function serialize(v: FilterType): Uint8Array {
        const buf = new MutableBytesBuffer(new Uint8Array())
        buf.putVarInt(v)
        return buf.Uint8Array
    }

    export function deserialize(buffer: ImmutableBytesBuffer): FilterType {
        const order = buffer.getVarInt()
        switch (order) {
            case 1n:
                return FilterType.NextGroupStart
            case 2n:
                return FilterType.LargestObject
            case 3n:
                return FilterType.AbsoluteStart
            case 4n:
                return FilterType.AbsoluteRange
            default:
                throw new Error(`Invalid FilterType value: ${order}`)
        }
    }
}


export interface Subscribe {
    id: bigint // Request ID in draft-14
    namespace: Tuple,
    name: string
    subscriber_priority: number // u8
    group_order: GroupOrder
    forward: number // u8 -> 0/1
    filter_type: FilterType
    start_location?: Location
    end_group?: bigint
    params: Parameters
}


export namespace Subscribe {
    export function serialize(v: Subscribe): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.Subscribe)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putVarInt(v.id)
        payloadBuf.putBytes(Tuple.serialize(v.namespace))
        payloadBuf.putUtf8String(v.name)
        payloadBuf.putU8(v.subscriber_priority)
        payloadBuf.putBytes(GroupOrder.serialize(v.group_order))
        payloadBuf.putU8(v.forward)
        payloadBuf.putBytes(FilterType.serialize(v.filter_type))

        if (v.filter_type === FilterType.AbsoluteStart || v.filter_type === FilterType.AbsoluteRange) {
            if (!v.start_location) {
                throw new Error('start location required for absolute start or absolute range')
            }
            payloadBuf.putBytes(Location.serialize(v.start_location))
        }

        if (v.filter_type === FilterType.AbsoluteRange) {
            if (v.end_group == null) {
                throw new Error('end group required for absolute range')
            }
            payloadBuf.putVarInt(v.end_group)
        }
        payloadBuf.putBytes(Parameters.serialize(v.params))

        mainBuf.putU16(payloadBuf.byteLength)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): Subscribe {
        const id = reader.getVarInt()
        const namespace = Tuple.deserialize(reader)
        const name = reader.getUtf8String()
        const subscriber_priority = reader.getU8()
        const group_order = GroupOrder.deserialize(reader)
        const forward = reader.getU8()
        const filter_type = FilterType.deserialize(reader)
        let start_location: Location | undefined
        if (filter_type == FilterType.AbsoluteRange || filter_type == FilterType.AbsoluteStart) {
            start_location = Location.deserialize(reader)
        }
        let end_group: bigint | undefined
        if (filter_type == FilterType.AbsoluteRange) {
            end_group = reader.getVarInt()
        }
        const params = Parameters.deserialize(reader)
        return {
            id,
            namespace,
            name,
            subscriber_priority,
            group_order,
            forward,
            filter_type,
            start_location,
            end_group,
            params
        }
    }
}