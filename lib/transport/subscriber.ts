import * as Control from "./control"
import { Queue, Watch } from "../common/async"
import { Objects } from "./objects"
import type { TrackReader, SubgroupReader } from "./objects"

export class Subscriber {
	// Use to send control messages.
	#control: Control.Stream

	// Use to send objects.
	#objects: Objects

	// Announced broadcasts.
	#publishedNamespaces = new Map<string, PublishNamespaceRecv>()
	#publishedNamespacesQueue = new Watch<PublishNamespaceRecv[]>([])

	// Our subscribed tracks.
	#subscribe = new Map<bigint, SubscribeSend>()
	#subscribeNext = 0n

	#trackToIDMap = new Map<string, bigint>()
	#trackAliasMap = new Map<bigint, bigint>() // Maps request ID to track alias

	constructor(control: Control.Stream, objects: Objects) {
		this.#control = control
		this.#objects = objects
	}

	publishedNamespaces(): Watch<PublishNamespaceRecv[]> {
		return this.#publishedNamespacesQueue
	}

	async recv(msg: Control.Publisher) {
		if (msg.kind == Control.Msg.PublishNamespace) {
			await this.recvPublishNamespace(msg)
		} else if (msg.kind == Control.Msg.PublishNamespaceDone) {
			this.recvPublishNamespaceDone(msg)
		} else if (msg.kind == Control.Msg.SubscribeOk) {
			this.recvSubscribeOk(msg)
		} else if (msg.kind == Control.Msg.SubscribeError) {
			await this.recvSubscribeError(msg)
		} else if (msg.kind == Control.Msg.PublishDone) {
			await this.recvPublishDone(msg)
		} else {
			throw new Error(`unknown control message`) // impossible
		}
	}

	async recvPublishNamespace(msg: Control.PublishNamespace) {
		if (this.#publishedNamespaces.has(msg.namespace.join("/"))) {
			throw new Error(`duplicate publish namespace for namespace: ${msg.namespace.join("/")}`)
		}

		await this.#control.send({ kind: Control.Msg.PublishNamespaceOk, namespace: msg.namespace })

		const publishNamespace = new PublishNamespaceRecv(this.#control, msg.namespace)
		this.#publishedNamespaces.set(msg.namespace.join("/"), publishNamespace)

		this.#publishedNamespacesQueue.update((queue) => [...queue, publishNamespace])
	}

	recvPublishNamespaceDone(_msg: Control.PublishNamespaceDone) {
		throw new Error(`TODO PublishNamespaceDone`)
	}

	async subscribe(namespace: string[], track: string) {
		const id = this.#subscribeNext++

		const subscribe = new SubscribeSend(this.#control, id, namespace, track)
		this.#subscribe.set(id, subscribe)

		this.#trackToIDMap.set(track, id)

		await this.#control.send({
			kind: Control.Msg.Subscribe,
			id,
			namespace,
			name: track,
			subscriber_priority: 127, // default to mid value, see: https://github.com/moq-wg/moq-transport/issues/504
			group_order: Control.GroupOrder.Publisher,
			filter_type: Control.FilterType.NextGroupStart,
			forward: 1, // always forward
		})

		return subscribe
	}

	async unsubscribe(track: string) {
		if (this.#trackToIDMap.has(track)) {
			const trackID = this.#trackToIDMap.get(track)
			if (trackID === undefined) {
				console.warn(`Exception track ${track} not found in trackToIDMap.`)
				return
			}
			try {
				await this.#control.send({ kind: Control.Msg.Unsubscribe, id: trackID })
				this.#trackToIDMap.delete(track)
			} catch (error) {
				console.error(`Failed to unsubscribe from track ${track}:`, error)
			}
		} else {
			console.warn(`During unsubscribe request initiation attempt track ${track} not found in trackToIDMap.`)
		}
	}

	recvSubscribeOk(msg: Control.SubscribeOk) {
		const subscribe = this.#subscribe.get(msg.id)
		if (!subscribe) {
			throw new Error(`subscribe ok for unknown id: ${msg.id}`)
		}

		// Store the track alias provided by the publisher
		this.#trackAliasMap.set(msg.id, msg.track_alias)
		subscribe.onOk(msg.track_alias)
	}

	async recvSubscribeError(msg: Control.SubscribeError) {
		const subscribe = this.#subscribe.get(msg.id)
		if (!subscribe) {
			throw new Error(`subscribe error for unknown id: ${msg.id}`)
		}

		await subscribe.onError(msg.code, msg.reason)
	}

	async recvPublishDone(msg: Control.PublishDone) {
		const subscribe = this.#subscribe.get(msg.id)
		if (!subscribe) {
			throw new Error(`publish done for unknown id: ${msg.id}`)
		}

		await subscribe.onDone(msg.code, msg.stream_count, msg.reason)
	}

	async recvObject(reader: TrackReader | SubgroupReader) {
		const subscribe = this.#subscribe.get(reader.header.track)
		if (!subscribe) {
			throw new Error(`data for for unknown track: ${reader.header.track}`)
		}

		await subscribe.onData(reader)
	}
}

export class PublishNamespaceRecv {
	#control: Control.Stream

	readonly namespace: string[]

	// The current state of the publish namespace
	#state: "init" | "ack" | "closed" = "init"

	constructor(control: Control.Stream, namespace: string[]) {
		this.#control = control // so we can send messages
		this.namespace = namespace
	}

	// Acknowledge the publish namespace as valid.
	async ok() {
		if (this.#state !== "init") return
		this.#state = "ack"

		// Send the control message.
		return this.#control.send({ kind: Control.Msg.PublishNamespaceOk, namespace: this.namespace })
	}

	async close(code = 0n, reason = "") {
		if (this.#state === "closed") return
		this.#state = "closed"

		return this.#control.send({ kind: Control.Msg.PublishNamespaceError, namespace: this.namespace, code, reason })
	}
}

export class SubscribeSend {
	#control: Control.Stream
	#id: bigint
	#trackAlias?: bigint // Set when SUBSCRIBE_OK is received

	readonly namespace: string[]
	readonly track: string

	// A queue of received streams for this subscription.
	#data = new Queue<TrackReader | SubgroupReader>()

	constructor(control: Control.Stream, id: bigint, namespace: string[], track: string) {
		this.#control = control // so we can send messages
		this.#id = id
		this.namespace = namespace
		this.track = track
	}

	get trackAlias(): bigint | undefined {
		return this.#trackAlias
	}

	async close(_code = 0n, _reason = "") {
		// TODO implement unsubscribe
		// await this.#inner.sendReset(code, reason)
	}

	onOk(trackAlias: bigint) {
		this.#trackAlias = trackAlias
	}

	// FIXME(itzmanish): implement correctly 
	async onDone(code: bigint, streamCount: bigint, reason: string) {
		throw new Error(`TODO onDone`)
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
		if (!this.#data.closed()) await this.#data.push(reader)
	}

	// Receive the next a readable data stream
	async data() {
		return await this.#data.next()
	}
}
