import { ControlMessageType, GroupOrder } from "."
import { ImmutableBytesBuffer, MutableBytesBuffer } from "../buffer"
import { Parameters, KeyValuePairs, Location } from "../base_data"

export interface SubscribeUpdate {
    id: bigint
    subscription_id: bigint
    start_location: Location
    end_group: bigint
    subscriber_priority: number
    forward: number
    params?: Parameters
}


export namespace SubscribeUpdate {
    export function serialize(v: SubscribeUpdate): Uint8Array {
        const mainBuf = new MutableBytesBuffer(new Uint8Array())
        mainBuf.putVarInt(ControlMessageType.SubscribeUpdate)

        const payloadBuf = new MutableBytesBuffer(new Uint8Array())
        payloadBuf.putVarInt(v.id)
        payloadBuf.putVarInt(v.subscription_id)
        payloadBuf.putBytes(Location.serialize(v.start_location))
        payloadBuf.putVarInt(v.end_group)
        payloadBuf.putVarInt(v.subscriber_priority)
        payloadBuf.putVarInt(v.forward)
        if (v.params) {
            payloadBuf.putBytes(KeyValuePairs.serialize(v.params))
        }

        mainBuf.putU16(payloadBuf.length)
        mainBuf.putBytes(payloadBuf.Uint8Array)
        return mainBuf.Uint8Array
    }

    export function deserialize(reader: ImmutableBytesBuffer): SubscribeUpdate {
        const id = reader.getVarInt()
        const subscription_id = reader.getVarInt()
        const start_location = Location.deserialize(reader)
        const end_group = reader.getVarInt()
        const subscriber_priority = reader.getNumberVarInt()
        const forward = reader.getNumberVarInt()
        let params: Parameters | undefined
        if (reader.remaining > 0) {
            params = KeyValuePairs.deserialize(reader)
        }
        return {
            id,
            subscription_id,
            start_location,
            end_group,
            subscriber_priority,
            forward,
            params
        }
    }
}
