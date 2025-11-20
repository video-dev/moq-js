import * as Control from "./control"
import { Queue, Watch } from "../common/async"
import { Objects } from "./objects"
import type { TrackReader } from "./objects"
import { debug } from "./utils"
import { ControlStream } from "./stream"
import { SubgroupReader } from "./subgroup"
import { MigrationState } from "./connection"

export interface TrackInfo {
	track_alias: bigint
	track: TrackReader | SubgroupReader
}

export class Subscriber {
	// Use to send control messages.
	#control: ControlStream

	#migrationState: MigrationState = "none"

	// Use to send objects.
	#objects: Objects

	// Announced broadcasts.
	#publishedNamespaces = new Map<string, PublishNamespaceRecv>()
	#publishedNamespacesQueue = new Watch<PublishNamespaceRecv[]>([])

	// Our subscribed tracks.
	#subscribe = new Map<bigint, SubscribeSend>()
	#trackToIDMap = new Map<string, bigint>()
	#aliasToSubscriptionMap = new Map<bigint, bigint>() // Maps track alias to subscription ID
	#pendingTrack = new Map<bigint, (id: bigint) => Promise<void>>()

	constructor(control: ControlStream, objects: Objects) {
		this.#control = control
		this.#objects = objects
	}

	publishedNamespaces(): Watch<PublishNamespaceRecv[]> {
		return this.#publishedNamespacesQueue
	}

	get activeSubscribersCount() {
		return this.#subscribe.size
	}

	get migrationState() {
		return this.#migrationState
	}

	set migrationState(state: MigrationState) {
		this.#migrationState = state
	}

	async startMigration() {
		this.migrationState = "in_progress"
		for (const [track, id] of this.#trackToIDMap) {
			await this.unsubscribe(track, true);
		}
	}

	async migrationDone(control: ControlStream, objects: Objects) {
		this.migrationState = "done"
		this.#control = control
		this.#objects = objects
	}

	async recv(msg: Control.MessageWithType) {
		const { type, message } = msg;
		switch (type) {
			case Control.ControlMessageType.PublishNamespace:
				await this.recvPublishNamespace(message)
				break
			case Control.ControlMessageType.PublishNamespaceDone:
				this.recvPublishNamespaceDone(message)
				break
			case Control.ControlMessageType.SubscribeOk:
				this.recvSubscribeOk(message)
				break
			case Control.ControlMessageType.SubscribeError:
				await this.recvSubscribeError(message)
				break
			case Control.ControlMessageType.PublishDone:
				await this.recvPublishDone(message)
				break
			default:
				throw new Error(`unknown control message`) // impossible
		}
	}

	async recvPublishNamespace(msg: Control.PublishNamespace) {
		if (this.#publishedNamespaces.has(msg.namespace.join("/"))) {
			throw new Error(`duplicate publish namespace for namespace: ${msg.namespace.join("/")}`)
		}

		await this.#control.send({
			type: Control.ControlMessageType.PublishNamespaceOk,
			message: { id: msg.id }
		})

		const publishNamespace = new PublishNamespaceRecv(this.#control, msg.namespace, msg.id)
		this.#publishedNamespaces.set(msg.namespace.join("/"), publishNamespace)

		this.#publishedNamespacesQueue.update((queue) => [...queue, publishNamespace])
	}

	recvPublishNamespaceDone(_msg: Control.PublishNamespaceDone) {
		throw new Error(`TODO PublishNamespaceDone`)
	}

	async subscribe_namespace(namespace: string[]) {
		if (this.migrationState === "in_progress" || this.migrationState === "going_away") {
			throw new Error(`migration in progress or going away`)
		}
		const id = this.#control.nextRequestId()
		const msg: Control.MessageWithType = {
			type: Control.ControlMessageType.SubscribeNamespace,
			message: {
				id,
				namespace,
			}
		}
		await this.#control.send(msg)
	}

	async subscribe(namespace: string[], track: string) {
		if (this.migrationState === "in_progress" || this.migrationState === "going_away") {
			throw new Error(`migration in progress or going away`)
		}
		const id = this.#control.nextRequestId()

		const subscribe = new SubscribeSend(this.#control, id, namespace, track)
		this.#subscribe.set(id, subscribe)

		this.#trackToIDMap.set(track, id)

		const subscription_req: Control.MessageWithType = {
			type: Control.ControlMessageType.Subscribe,
			message: {
				id,
				namespace,
				name: track,
				subscriber_priority: 127, // default to mid value, see: https://github.com/moq-wg/moq-transport/issues/504
				group_order: Control.GroupOrder.Publisher,
				filter_type: Control.FilterType.NextGroupStart,
				forward: 1, // always forward
				params: new Map(),
			}
		}

		await this.#control.send(subscription_req)
		debug("subscribe sent", subscription_req)

		return subscribe
	}

	async unsubscribe(track: string, isMigrating = false) {
		const trackID = this.#trackToIDMap.get(track)

		if (trackID === undefined) {
			console.warn(`Exception track ${track} not found in trackToIDMap.`)
			return
		}

		try {
			const subscription = this.#subscribe.get(trackID)
			if (subscription) {
				const canBeDeleted = await subscription.close()
				if (canBeDeleted) {
					this.#subscribe.delete(trackID)
				}
			}
			this.#trackToIDMap.delete(track)

		} catch (error) {
			console.error(`Failed to unsubscribe from track ${track}:`, error)
		}

	}

	recvSubscribeOk(msg: Control.SubscribeOk) {
		const subscribe = this.#subscribe.get(msg.id)
		if (!subscribe) {
			throw new Error(`subscribe ok for unknown id: ${msg.id}`)
		}

		// Also create reverse mapping for receiving objects
		this.#aliasToSubscriptionMap.set(msg.track_alias, msg.id)
		const callback = this.#pendingTrack.get(msg.track_alias)
		if (callback) {
			this.#pendingTrack.delete(msg.track_alias)
			callback(msg.id)
		}

		console.log("subscribe ok", msg)
		subscribe.onOk(msg.track_alias)
	}

	async recvSubscribeError(msg: Control.SubscribeError) {
		const subscribe = this.#subscribe.get(msg.id)
		if (!subscribe) {
			throw new Error(`subscribe error for unknown id: ${msg.id}`)
		}

		this.#subscribe.delete(msg.id)
		this.#trackToIDMap.delete(subscribe.track)

		await subscribe.onError(msg.code, msg.reason)
	}

	async recvPublishDone(msg: Control.PublishDone) {
		const subscribe = this.#subscribe.get(msg.id)
		if (!subscribe) {
			throw new Error(`publish done for unknown id: ${msg.id}`)
		}

		this.#subscribe.delete(msg.id)
		this.#trackToIDMap.delete(subscribe.track)

		await subscribe.onDone(msg.code, msg.stream_count, msg.reason)
	}

	async recvObject(reader: TrackReader | SubgroupReader) {
		console.log("got object on recvObject", reader)
		// Get track alias from reader header
		const track_alias = reader.header.track_alias

		// Map track alias back to subscription ID
		const subscriptionId = this.#aliasToSubscriptionMap.get(track_alias)
		console.log("got subscriptionId", subscriptionId)
		const callback = async (id: bigint) => {
			const subscribe = this.#subscribe.get(id)
			if (!subscribe) {
				throw new Error(`data for unknown subscription: ${id}`)
			}
			console.log("doing subscribe on data", reader)
			return subscribe.onData(reader)
		}
		if (subscriptionId === undefined) {
			console.warn(`Exception track alias ${track_alias} not found in aliasToSubscriptionMap.`)
			this.#pendingTrack.set(track_alias, callback)
			return
		}

		await callback(subscriptionId)
	}
}

export class PublishNamespaceRecv {
	#control: ControlStream
	#id: bigint

	readonly namespace: string[]

	// The current state of the publish namespace
	#state: "init" | "ack" | "closed" = "init"

	constructor(control: ControlStream, namespace: string[], id: bigint) {
		this.#control = control // so we can send messages
		this.namespace = namespace
		this.#id = id
	}

	// Acknowledge the publish namespace as valid.
	async ok() {
		if (this.#state !== "init") return
		this.#state = "ack"

		// Send the control message.
		return this.#control.send({
			type: Control.ControlMessageType.PublishNamespaceOk,
			message: { id: this.#id }
		})
	}

	async close(code = 0n, reason = "") {
		if (this.#state === "closed") return
		this.#state = "closed"

		return this.#control.send({
			type: Control.ControlMessageType.PublishNamespaceError,
			message: { id: this.#id, code, reason }
		})
	}
}

export class SubscribeSend {
	#control: ControlStream
	#id: bigint
	#trackAlias?: bigint // Set when SUBSCRIBE_OK is received
	#closed: boolean = false


	readonly namespace: string[]
	readonly track: string

	// A queue of received streams for this subscription.
	#data = new Queue<TrackReader | SubgroupReader>()

	constructor(control: ControlStream, id: bigint, namespace: string[], track: string) {
		this.#control = control // so we can send messages
		this.#id = id
		this.namespace = namespace
		this.track = track
	}

	get trackAlias(): bigint | undefined {
		return this.#trackAlias
	}

	// sends unsubscribe message if the track alias is set
	// and returns false otherwise true, which means subscription can be
	// deleted
	async close(_code = 0n, _reason = ""): Promise<boolean> {
		if (this.#closed) return true
		this.#closed = true
		if (this.#trackAlias === undefined) return true
		await this.#control.send({
			type: Control.ControlMessageType.Unsubscribe,
			message: { id: this.#id }
		})
		return false
	}

	onOk(trackAlias: bigint) {
		console.log("setting track alias", trackAlias)
		this.#trackAlias = trackAlias
	}

	// FIXME(itzmanish): implement correctly
	async onDone(code: bigint, streamCount: bigint, reason: string) {
		console.warn("subscriber done, ID:", this.#id, "code", code, "streamCount", streamCount, reason)
	}

	async onError(code: bigint, reason: string) {
		if (code == 0n) {
			return await this.#data.close()
		}

		if (reason !== "") {
			reason = `: ${reason}`
		}

		const err = new Error(`SUBSCRIBE_ERROR (${code})${reason}`)
		return await this.#data.abort(err)
	}

	async onData(reader: TrackReader | SubgroupReader) {
		console.log("subscribe send onData", reader)
		if (!this.#data.closed()) await this.#data.push(reader)
	}

	// Receive the next a readable data stream
	async data() {
		return await this.#data.next()
	}
}
