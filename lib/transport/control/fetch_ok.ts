import { ControlMessageType, GroupOrder } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Parameters, Location } from "../base_data"

export interface FetchOk {
    id: bigint
    group_order: GroupOrder
    end_of_track: number // u8
    end_location: Location
    params?: Parameters
}


export namespace FetchOk {
    export function serialize(v: FetchOk): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.FetchOk)
        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putVarInt(v.id)
        payloadBuf.putBytes(GroupOrder.serialize(v.group_order))
        payloadBuf.putU8(v.end_of_track)
        payloadBuf.putBytes(Location.serialize(v.end_location))
        payloadBuf.putBytes(Parameters.serialize(v.params ?? new Map()))

        mainBuf.putU16(payloadBuf.byteLength)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): FetchOk {
        const id = reader.getVarInt()
        const group_order = GroupOrder.deserialize(reader)
        const end_of_track = reader.getU8()
        const end_location = Location.deserialize(reader)
        let params: Parameters | undefined
        if (reader.remaining > 0) {
            params = Parameters.deserialize(reader)
        }
        return {
            id,
            group_order,
            end_of_track,
            end_location,
            params
        }
    }
}