import * as Control from "./control"
import { Queue, Watch } from "../common/async"
import { Objects, SubgroupWriter, StreamType, TrackWriter } from "./objects"

export class Publisher {
	// Used to send control messages
	#control: Control.Stream

	// Use to send objects.
	#objects: Objects

	// Our announced tracks.
	#publishedNamespaces = new Map<string, PublishNamespaceSend>()

	// Their subscribed tracks.
	#subscribe = new Map<bigint, SubscribeRecv>()
	#subscribeQueue = new Queue<SubscribeRecv>(Number.MAX_SAFE_INTEGER) // Unbounded queue in case there's no receiver

	// Track alias counter (publisher assigns these in draft-14)
	#nextTrackAlias = 0n

	constructor(control: Control.Stream, objects: Objects) {
		this.#control = control
		this.#objects = objects
	}

	async publish_namespace(namespace: string[]): Promise<PublishNamespaceSend> {
		if (this.#publishedNamespaces.has(namespace.join("/"))) {
			throw new Error(`already announced: ${namespace.join("/")}`)
		}

		const publishNamespaceSend = new PublishNamespaceSend(this.#control, namespace)
		this.#publishedNamespaces.set(namespace.join("/"), publishNamespaceSend)

		await this.#control.send({
			kind: Control.Msg.PublishNamespace,
			namespace,
		})

		return publishNamespaceSend
	}

	// Receive the next new subscription
	async subscribed() {
		return await this.#subscribeQueue.next()
	}

	async recv(msg: Control.Subscriber) {
		if (msg.kind == Control.Msg.Subscribe) {
			await this.recvSubscribe(msg)
		} else if (msg.kind == Control.Msg.Unsubscribe) {
			this.recvUnsubscribe(msg)
		} else if (msg.kind == Control.Msg.PublishNamespaceOk) {
			this.recvPublishNamespaceOk(msg)
		} else if (msg.kind == Control.Msg.PublishNamespaceError) {
			this.recvPublishNamespaceError(msg)
		} else {
			throw new Error(`unknown control message`) // impossible
		}
	}

	recvPublishNamespaceOk(msg: Control.PublishNamespaceOk) {
		const publishNamespaceSend = this.#publishedNamespaces.get(msg.namespace.join("/"))
		if (!publishNamespaceSend) {
			throw new Error(`publish namespace OK for unknown announce: ${msg.namespace.join("/")}`)
		}

		publishNamespaceSend.onOk()
	}

	recvPublishNamespaceError(msg: Control.PublishNamespaceError) {
		const publishNamespaceSend = this.#publishedNamespaces.get(msg.namespace.join("/"))
		if (!publishNamespaceSend) {
			// TODO debug this
			console.warn(`publish namespace error for unknown announce: ${msg.namespace.join("/")}`)
			return
		}

		publishNamespaceSend.onError(msg.code, msg.reason)
	}

	async recvSubscribe(msg: Control.Subscribe) {
		if (this.#subscribe.has(msg.id)) {
			throw new Error(`duplicate subscribe for id: ${msg.id}`)
		}

		const trackAlias = this.#nextTrackAlias++
		const subscribe = new SubscribeRecv(this.#control, this.#objects, msg, trackAlias)
		this.#subscribe.set(msg.id, subscribe)
		await this.#subscribeQueue.push(subscribe)

		// NOTE(itzmanish): revisit this
		await this.#control.send({
			kind: Control.Msg.SubscribeOk,
			id: msg.id,
			expires: 0n,
			content_exists: 0,
			group_order: msg.group_order,
			track_alias: trackAlias,
		})
	}

	recvUnsubscribe(_msg: Control.Unsubscribe) {
		throw new Error("TODO unsubscribe")
	}
}

export class PublishNamespaceSend {
	#control: Control.Stream

	readonly namespace: string[]

	// The current state, updated by control messages.
	#state = new Watch<"init" | "ack" | Error>("init")

	constructor(control: Control.Stream, namespace: string[]) {
		this.#control = control
		this.namespace = namespace
	}

	async ok() {
		for (; ;) {
			const [state, next] = this.#state.value()
			if (state === "ack") return
			if (state instanceof Error) throw state
			if (!next) throw new Error("closed")

			await next
		}
	}

	async active() {
		for (; ;) {
			const [state, next] = this.#state.value()
			if (state instanceof Error) throw state
			if (!next) return

			await next
		}
	}

	async close() {
		// TODO implement unsubscribe
		// await this.#inner.sendUnsubscribe()
	}

	closed() {
		const [state, next] = this.#state.value()
		return state instanceof Error || next == undefined
	}

	onOk() {
		if (this.closed()) return
		this.#state.update("ack")
	}

	onError(code: bigint, reason: string) {
		if (this.closed()) return

		const err = new Error(`PUBLISH_NAMESPACE_ERROR (${code})` + reason ? `: ${reason}` : "")
		this.#state.update(err)
	}
}

export class SubscribeRecv {
	#control: Control.Stream
	#objects: Objects
	#id: bigint
	#trackAlias: bigint // Publisher-specified in draft-14
	#subscriberPriority: number
	groupOrder: Control.GroupOrder

	readonly namespace: string[]
	readonly track: string

	// The current state of the subscription.
	#state: "init" | "ack" | "closed" = "init"

	constructor(control: Control.Stream, objects: Objects, msg: Control.Subscribe, trackAlias: bigint) {
		this.#control = control // so we can send messages
		this.#objects = objects // so we can send objects
		this.#id = msg.id
		this.#trackAlias = trackAlias
		this.namespace = msg.namespace
		this.track = msg.name
		this.#subscriberPriority = msg.subscriber_priority
		this.groupOrder = msg.group_order
	}

	// Acknowledge the subscription as valid.
	async ack() {
		if (this.#state !== "init") return
		this.#state = "ack"

		// NOTE(itzmanish): revisit this
		// Send the control message.
		return this.#control.send({
			kind: Control.Msg.SubscribeOk,
			id: this.#id,
			expires: 0n,
			group_order: this.groupOrder,
			track_alias: this.#trackAlias,
			content_exists: 0,
		})
	}

	// Close the subscription with an error.
	async close(code = 0n, reason = "") {
		if (this.#state === "closed") return
		this.#state = "closed"

		return this.#control.send({
			kind: Control.Msg.Unsubscribe,
			id: this.#id,
		})
	}

	// Create a writable data stream for the entire track
	async serve(props?: { priority: number }): Promise<TrackWriter> {
		return this.#objects.send({
			type: StreamType.Track,
			sub: this.#id,
			track: this.#trackAlias,
			publisher_priority: props?.priority ?? 127,
		})
	}

	// Create a writable data stream for a subgroup within the track
	async subgroup(props: { group: number; subgroup: number; priority?: number }): Promise<SubgroupWriter> {
		return this.#objects.send({
			type: StreamType.Subgroup,
			sub: this.#id,
			track: this.#trackAlias,
			group: props.group,
			subgroup: props.subgroup,
			publisher_priority: props.priority ?? 127,
		})
	}
}
