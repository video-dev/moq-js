import { Reader, Writer } from "./stream"

export type Message = Subscriber | Publisher

// Sent by subscriber
export type Subscriber = Subscribe | SubscribeUpdate | Unsubscribe | PublishOk | PublishError | PublishNamespaceOk | PublishNamespaceError | Fetch | FetchCancel

export function isSubscriber(m: Message): m is Subscriber {
	return (
		m.kind == Msg.Subscribe ||
		m.kind == Msg.SubscribeUpdate ||
		m.kind == Msg.Unsubscribe ||
		m.kind == Msg.PublishOk ||
		m.kind == Msg.PublishError ||
		m.kind == Msg.PublishNamespaceOk ||
		m.kind == Msg.PublishNamespaceError
	)
}

// Sent by publisher
export type Publisher = SubscribeOk | SubscribeError | PublishDone | Publish | PublishNamespace | PublishNamespaceDone | FetchOk | FetchError

export function isPublisher(m: Message): m is Publisher {
	return (
		m.kind == Msg.SubscribeOk ||
		m.kind == Msg.SubscribeError ||
		m.kind == Msg.PublishDone ||
		m.kind == Msg.Publish ||
		m.kind == Msg.PublishNamespace ||
		m.kind == Msg.PublishNamespaceDone
	)
}

// I wish we didn't have to split Msg and Id into separate enums.
// However using the string in the message makes it easier to debug.
// We'll take the tiny performance hit until I'm better at Typescript.
export enum Msg {
	// NOTE: object and setup are in other modules
	SubscribeUpdate = "subscribe_update",
	Subscribe = "subscribe",
	SubscribeOk = "subscribe_ok",
	SubscribeError = "subscribe_error",
	Unsubscribe = "unsubscribe",
	Publish = "publish",
	PublishOk = "publish_ok",
	PublishError = "publish_error",
	PublishDone = "publish_done",
	PublishNamespace = "publish_namespace",
	PublishNamespaceOk = "publish_namespace_ok",
	PublishNamespaceError = "publish_namespace_error",
	PublishNamespaceDone = "publish_namespace_done",
	GoAway = "go_away",
	Fetch = "fetch",
	FetchCancel = "fetch_cancel",
	FetchOk = "fetch_ok",
	FetchError = "fetch_error",
}

enum Id {
	// NOTE: object and setup are in other modules
	// Object = 0,
	// Setup = 1,

	SubscribeUpdate = 0x2,
	Subscribe = 0x3,
	SubscribeOk = 0x4,
	SubscribeError = 0x5,
	Unsubscribe = 0xa,
	PublishDone = 0xb,
	Publish = 0x1d,
	PublishOk = 0x1e,
	PublishError = 0x1f,
	PublishNamespace = 0x6,
	PublishNamespaceOk = 0x7,
	PublishNamespaceError = 0x8,
	PublishNamespaceDone = 0x9,
	GoAway = 0x10,
	Fetch = 0x16,
	FetchCancel = 0x17,
	FetchOk = 0x18,
	FetchError = 0x19,
}

export interface Subscribe {
	kind: Msg.Subscribe

	id: bigint // Request ID in draft-14
	namespace: string[]
	name: string
	subscriber_priority: number
	group_order: GroupOrder
	forward: number // 0 or 1
	filter_type: FilterType
	start_location?: Location
	end_group?: bigint


	params?: Parameters
}

export enum GroupOrder {
	Publisher = 0x0,
	Ascending = 0x1,
	Descending = 0x2,
}

export enum FilterType {
	NextGroupStart = 0x1,
	LargestObject = 0x2,
	AbsoluteStart = 0x3,
	AbsoluteRange = 0x4,
}

export type Location = {
	group: bigint
	object: bigint
}


export type Parameters = Map<bigint, Uint8Array>

export interface SubscribeOk {
	kind: Msg.SubscribeOk
	id: bigint // Request ID
	track_alias: bigint // Publisher-specified in draft-14
	expires: bigint
	group_order: GroupOrder
	content_exists: number // 0 or 1
	largest_location?: Location
	params?: Parameters
}

export interface SubscribeUpdate {
	kind: Msg.SubscribeUpdate
	id: bigint
	subscription_id: bigint
	start_location: Location
	end_group: bigint
	subscriber_priority: number
	forward: number
	params?: Parameters
}

export interface SubscribeError {
	kind: Msg.SubscribeError
	id: bigint
	code: bigint
	reason: string
}

export interface Unsubscribe {
	kind: Msg.Unsubscribe
	id: bigint
}

export interface Publish {
	kind: Msg.Publish
	id: bigint // Request ID
	track_alias: bigint // Publisher-specified
	namespace: string[]
	name: string
	content_exists: number // 0 or 1
	group_order: GroupOrder
	largest_location?: Location // largest location of group or object if content_exists == 1
	forward: number // 0 or 1
	params?: Parameters
}

export interface PublishDone {
	kind: Msg.PublishDone
	id: bigint
	code: bigint
	stream_count: bigint
	reason: string
}


export interface PublishOk {
	kind: Msg.PublishOk
	id: bigint // Request ID
	forward: number // 0 or 1
	subscriber_priority: number
	group_order: GroupOrder
	filter_type: FilterType
	start_location?: Location
	end_group?: bigint
	params?: Parameters
}

export interface PublishError {
	kind: Msg.PublishError
	id: bigint
	code: bigint
	reason: string
}

export interface PublishNamespace {
	kind: Msg.PublishNamespace
	namespace: string[]
	params?: Parameters
}

export interface PublishNamespaceOk {
	kind: Msg.PublishNamespaceOk
	namespace: string[]
}

export interface PublishNamespaceError {
	kind: Msg.PublishNamespaceError
	namespace: string[]
	code: bigint
	reason: string
}

export interface PublishNamespaceDone {
	kind: Msg.PublishNamespaceDone
	namespace: string[]
}

export interface Fetch {
	kind: Msg.Fetch
	id: bigint
	namespace: string[]
	name: string
	subscriber_priority: number
	group_order: GroupOrder
	start_group: number
	start_object: number
	end_group: number
	end_object: number
	params?: Parameters
}

export interface FetchOk {
	kind: Msg.FetchOk
	id: bigint
	group_order: number
	end_of_track: number
	largest_group_id: bigint
	largest_object_id: bigint
	params?: Parameters
}

export interface FetchError {
	kind: Msg.FetchError
	id: bigint
	code: bigint
	reason: string
}

export interface FetchCancel {
	kind: Msg.FetchCancel
	id: bigint
}

export class Stream {
	private decoder: Decoder
	private encoder: Encoder

	#mutex = Promise.resolve()

	constructor(r: Reader, w: Writer) {
		this.decoder = new Decoder(r)
		this.encoder = new Encoder(w)
	}

	// Will error if two messages are read at once.
	async recv(): Promise<Message> {
		const msg = await this.decoder.message()
		console.log("received message", msg)
		return msg
	}

	async send(msg: Message) {
		const unlock = await this.#lock()
		try {
			console.log("sending message", msg)
			await this.encoder.message(msg)
		} finally {
			unlock()
		}
	}

	async #lock() {
		// Make a new promise that we can resolve later.
		let done: () => void
		const p = new Promise<void>((resolve) => {
			done = () => resolve()
		})

		// Wait until the previous lock is done, then resolve our our lock.
		const lock = this.#mutex.then(() => done)

		// Save our lock as the next lock.
		this.#mutex = p

		// Return the lock.
		return lock
	}
}

export class Decoder {
	r: Reader

	constructor(r: Reader) {
		this.r = r
	}

	private async msg(): Promise<Msg> {
		const t = await this.r.u53()

		const advertisedLength = await this.r.u53()
		if (advertisedLength !== this.r.getByteLength()) {
			// @todo: throw this error and close the session
			// "If the length does not match the length of the message content, the receiver MUST close the session."
			console.error(
				`message length mismatch: advertised ${advertisedLength} != ${this.r.getByteLength()} received`,
			)
		}

		switch (t as Id) {
			case Id.Subscribe:
				return Msg.Subscribe
			case Id.SubscribeOk:
				return Msg.SubscribeOk
			case Id.SubscribeError:
				return Msg.SubscribeError
			case Id.SubscribeUpdate:
				return Msg.SubscribeUpdate
			case Id.Unsubscribe:
				return Msg.Unsubscribe
			case Id.Publish:
				return Msg.Publish
			case Id.PublishDone:
				return Msg.PublishDone
			case Id.PublishOk:
				return Msg.PublishOk
			case Id.PublishError:
				return Msg.PublishError
			case Id.PublishNamespace:
				return Msg.PublishNamespace
			case Id.PublishNamespaceOk:
				return Msg.PublishNamespaceOk
			case Id.PublishNamespaceError:
				return Msg.PublishNamespaceError
			case Id.PublishNamespaceDone:
				return Msg.PublishNamespaceDone
			case Id.GoAway:
				return Msg.GoAway
			case Id.Fetch:
				return Msg.Fetch
			case Id.FetchCancel:
				return Msg.FetchCancel
			case Id.FetchOk:
				return Msg.FetchOk
			case Id.FetchError:
				return Msg.FetchError
			default:
				throw new Error(`unknown message type: ${t}`)
		}
	}

	async message(): Promise<Message> {
		const t = await this.msg()
		switch (t) {
			case Msg.Subscribe:
				return this.subscribe()
			case Msg.SubscribeOk:
				return this.subscribe_ok()
			case Msg.SubscribeError:
				return this.subscribe_error()
			case Msg.SubscribeUpdate:
				return this.subscribe_update()
			case Msg.Unsubscribe:
				return this.unsubscribe()
			case Msg.Publish:
				return this.publish()
			case Msg.PublishDone:
				return this.publish_done()
			case Msg.PublishOk:
				return this.publish_ok()
			case Msg.PublishError:
				return this.publish_error()
			case Msg.PublishNamespace:
				return this.publish_namespace()
			case Msg.PublishNamespaceOk:
				return this.publish_namespace_ok()
			case Msg.PublishNamespaceDone:
				return this.publish_namespace_done()
			case Msg.PublishNamespaceError:
				return this.publish_namespace_error()
			case Msg.GoAway:
				throw new Error("TODO: implement go away")
			case Msg.Fetch:
				return this.fetch()
			case Msg.FetchCancel:
				return this.fetchCancel()
			case Msg.FetchOk:
				return this.fetchOk()
			case Msg.FetchError:
				return this.fetchError()
			default:
				throw new Error(`unknown message kind: ${t}`)
		}
	}

	private async subscribe(): Promise<Subscribe> {
		const id = await this.r.u62()
		const namespace = await this.r.tuple()
		const name = await this.r.string()
		const subscriberPriority = await this.r.u8()
		const groupOrder = await this.decodeGroupOrder()
		const forward = await this.r.u8()
		const filter_type = await this.decodeFilterType()
		const subMsg: Subscribe = {
			kind: Msg.Subscribe,
			id,
			namespace,
			name,
			subscriber_priority: subscriberPriority,
			group_order: groupOrder,
			forward: forward,
			filter_type,
		}
		if (filter_type == FilterType.AbsoluteRange || filter_type == FilterType.AbsoluteStart) {
			subMsg.start_location = await this.location()
		}
		if (filter_type == FilterType.AbsoluteRange) {
			subMsg.end_group = await this.r.u62()
		}
		subMsg.params = await this.parameters()
		return subMsg
	}

	private async decodeGroupOrder(): Promise<GroupOrder> {
		const orderCode = await this.r.u8()
		switch (orderCode) {
			case 0:
				return GroupOrder.Publisher
			case 1:
				return GroupOrder.Ascending
			case 2:
				return GroupOrder.Descending
			default:
				// TODO(itzmanish): protocol violation error
				throw new Error(`Invalid GroupOrder value: ${orderCode}`)
		}
	}

	private async decodeFilterType(): Promise<FilterType> {
		const filterType = await this.r.u62()
		switch (filterType) {
			case 1n:
				return FilterType.NextGroupStart
			case 2n:
				return FilterType.LargestObject
			case 3n:
				return FilterType.AbsoluteStart
			case 4n:
				return FilterType.AbsoluteRange
			default:
				throw new Error(`Invalid FilterType value: ${filterType}`)
		}
	}

	private async location(): Promise<Location> {
		return {
			group: await this.r.u62(),
			object: await this.r.u62(),
		}
	}

	private async parameters(): Promise<Parameters | undefined> {
		const count = await this.r.u53()
		if (count == 0) return undefined

		const params = new Map<bigint, Uint8Array>()

		for (let i = 0; i < count; i++) {
			const id = await this.r.u62()
			const size = await this.r.u53()
			const value = await this.r.read(size)

			if (params.has(id)) {
				throw new Error(`duplicate parameter id: ${id}`)
			}

			params.set(id, value)
		}

		return params
	}

	private async subscribe_ok(): Promise<SubscribeOk> {
		const id = await this.r.u62()
		const track_alias = await this.r.u62()
		const expires = await this.r.u62()

		const group_order = await this.decodeGroupOrder()
		const content_exists = await this.r.u8()

		let location: Location | undefined
		if (content_exists == 1) {
			location = await this.location()
		}

		// @todo: actually consume params once we implement them in moq-rs
		const params = await this.parameters()
		return {
			kind: Msg.SubscribeOk,
			id,
			expires,
			group_order,
			track_alias,
			content_exists,
			largest_location: location,
			params,
		}
	}

	private async subscribe_update(): Promise<SubscribeUpdate> {
		return {
			kind: Msg.SubscribeUpdate,
			id: await this.r.u62(),
			subscription_id: await this.r.u62(),
			start_location: await this.location(),
			end_group: await this.r.u62(),
			subscriber_priority: await this.r.u8(),
			forward: await this.r.u8(),
			params: await this.parameters(),
		}
	}

	private async subscribe_error(): Promise<SubscribeError> {
		return {
			kind: Msg.SubscribeError,
			id: await this.r.u62(),
			code: await this.r.u62(),
			reason: await this.r.string(),
		}
	}

	private async unsubscribe(): Promise<Unsubscribe> {
		return {
			kind: Msg.Unsubscribe,
			id: await this.r.u62(),
		}
	}

	private async publish_done(): Promise<PublishDone> {
		return {
			kind: Msg.PublishDone,
			id: await this.r.u62(),
			code: await this.r.u62(),
			stream_count: await this.r.u62(),
			reason: await this.r.string(),
		}
	}

	private async publish(): Promise<Publish> {
		const id = await this.r.u62()
		const namespace = await this.r.tuple()
		const name = await this.r.string()
		const track_alias = await this.r.u62()
		const group_order = await this.decodeGroupOrder()
		const content_exists = await this.r.u8()
		let location: Location | undefined
		if (content_exists == 1) {
			location = await this.location()
		}
		const forward = await this.r.u8()
		const params = await this.parameters()
		return {
			kind: Msg.Publish,
			id,
			namespace,
			name,
			track_alias,
			group_order,
			content_exists,
			largest_location: location,
			forward,
			params,
		}
	}

	private async publish_ok(): Promise<PublishOk> {
		const id = await this.r.u62()
		const forward = await this.r.u8()
		const subscriber_priority = await this.r.u8()
		const group_order = await this.decodeGroupOrder()
		const filter_type = await this.decodeFilterType()
		let start_location: Location | undefined
		let end_group: bigint | undefined
		if (filter_type == FilterType.AbsoluteRange || filter_type == FilterType.AbsoluteStart) {
			start_location = await this.location()
		}
		if (filter_type == FilterType.AbsoluteRange) {
			end_group = await this.r.u62()
		}

		const params = await this.parameters()
		return {
			kind: Msg.PublishOk,
			id,
			forward,
			subscriber_priority,
			group_order,
			filter_type,
			start_location,
			end_group,
			params,
		}
	}

	private async publish_error(): Promise<PublishError> {
		return {
			kind: Msg.PublishError,
			id: await this.r.u62(),
			code: await this.r.u62(),
			reason: await this.r.string(),
		}
	}

	private async publish_namespace(): Promise<PublishNamespace> {
		const namespace = await this.r.tuple()

		return {
			kind: Msg.PublishNamespace,
			namespace,
			params: await this.parameters(),
		}
	}

	private async publish_namespace_ok(): Promise<PublishNamespaceOk> {
		return {
			kind: Msg.PublishNamespaceOk,
			namespace: await this.r.tuple(),
		}
	}

	private async publish_namespace_error(): Promise<PublishNamespaceError> {
		return {
			kind: Msg.PublishNamespaceError,
			namespace: await this.r.tuple(),
			code: await this.r.u62(),
			reason: await this.r.string(),
		}
	}

	private async publish_namespace_done(): Promise<PublishNamespaceDone> {
		return {
			kind: Msg.PublishNamespaceDone,
			namespace: await this.r.tuple(),
		}
	}

	private async fetch(): Promise<Fetch> {
		return {
			kind: Msg.Fetch,
			id: await this.r.u62(),
			namespace: await this.r.tuple(),
			name: await this.r.string(),
			subscriber_priority: await this.r.u8(),
			group_order: await this.decodeGroupOrder(),
			start_group: await this.r.u53(),
			start_object: await this.r.u53(),
			end_group: await this.r.u53(),
			end_object: await this.r.u53(),
			params: await this.parameters(),
		}
	}

	private async fetchCancel(): Promise<FetchCancel> {
		return {
			kind: Msg.FetchCancel,
			id: await this.r.u62(),
		}
	}

	private async fetchOk(): Promise<FetchOk> {
		return {
			kind: Msg.FetchOk,
			id: await this.r.u62(),
			group_order: await this.r.u8(),
			end_of_track: await this.r.u8(),
			largest_group_id: await this.r.u62(),
			largest_object_id: await this.r.u62(),
			params: await this.parameters(),
		}
	}

	private async fetchError(): Promise<FetchError> {
		return {
			kind: Msg.FetchError,
			id: await this.r.u62(),
			code: await this.r.u62(),
			reason: await this.r.string(),
		}
	}
}

export class Encoder {
	w: Writer

	constructor(w: Writer) {
		this.w = w
	}

	async message(m: Message) {
		switch (m.kind) {
			case Msg.Subscribe:
				return this.subscribe(m)
			case Msg.SubscribeOk:
				return this.subscribe_ok(m)
			case Msg.SubscribeError:
				return this.subscribe_error(m)
			case Msg.SubscribeUpdate:
				return this.subscribe_update(m)
			case Msg.Unsubscribe:
				return this.unsubscribe(m)
			case Msg.Publish:
				return this.publish(m)
			case Msg.PublishDone:
				return this.publish_done(m)
			case Msg.PublishOk:
				return this.publish_ok(m)
			case Msg.PublishError:
				return this.publish_error(m)
			case Msg.PublishNamespace:
				return this.publish_namespace(m)
			case Msg.PublishNamespaceOk:
				return this.publish_namespace_ok(m)
			case Msg.PublishNamespaceError:
				return this.publish_namespace_error(m)
			case Msg.PublishNamespaceDone:
				return this.publish_namespace_done(m)
			case Msg.Fetch:
				return this.fetch(m)
			case Msg.FetchCancel:
				return this.fetchCancel(m)
			case Msg.FetchOk:
				return this.fetchOk(m)
			case Msg.FetchError:
				return this.fetchError(m)
			default:
				throw new Error(`unknown message kind in encoder`)
		}
	}

	async subscribe(s: Subscribe) {
		const buffer = new Uint8Array(8)

		let msgData = this.w.concatBuffer([
			this.w.setVint62(buffer, s.id),
			this.w.encodeTuple(buffer, s.namespace),
			this.w.encodeString(buffer, s.name),
			this.w.setUint8(buffer, s.subscriber_priority ?? 127),
			this.w.setUint8(buffer, s.group_order ?? GroupOrder.Publisher),
			this.w.setUint8(buffer, s.forward),
			this.encodeFilterType(buffer, s.filter_type),
		])

		if (s.filter_type == FilterType.AbsoluteRange || s.filter_type == FilterType.AbsoluteStart) {
			msgData = this.w.concatBuffer([msgData, this.encodeLocation(buffer, s.start_location!)])
		}

		if (s.filter_type == FilterType.AbsoluteRange) {
			msgData = this.w.concatBuffer([msgData, this.w.setVint62(buffer, s.end_group!)])
		}

		msgData = this.w.concatBuffer([msgData, this.encodeParameters(buffer, s.params)])

		const messageType = this.w.setVint53(buffer, Id.Subscribe)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async subscribe_update(s: SubscribeUpdate) {
		const buffer = new Uint8Array(8)

		const msgData = this.w.concatBuffer([
			this.w.setVint62(buffer, s.id),
			this.w.setVint62(buffer, s.subscription_id),
			this.encodeLocation(buffer, s.start_location),
			this.w.setVint62(buffer, s.end_group),
			this.w.setUint8(buffer, s.subscriber_priority),
			this.w.setUint8(buffer, s.forward),
			this.encodeParameters(buffer, s.params),
		])

		const messageType = this.w.setVint53(buffer, Id.SubscribeUpdate)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async subscribe_ok(s: SubscribeOk) {
		const buffer = new Uint8Array(8)

		let msgData = this.w.concatBuffer([
			this.w.setVint62(buffer, s.id),
			this.w.setVint62(buffer, s.track_alias),
			this.w.setVint62(buffer, s.expires),
			this.w.setUint8(buffer, s.group_order),
			this.w.setUint8(buffer, s.content_exists),
		])

		if (s.content_exists) {
			msgData = this.w.concatBuffer([msgData, this.encodeLocation(buffer, s.largest_location!)])
		}

		msgData = this.w.concatBuffer([msgData, this.encodeParameters(buffer, s.params)])

		const messageType = this.w.setVint53(buffer, Id.SubscribeOk)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}


	async subscribe_error(s: SubscribeError) {
		const buffer = new Uint8Array(8)

		const msgData = this.w.concatBuffer([
			this.w.setVint62(buffer, s.id),
			this.w.setVint62(buffer, s.code),
			this.w.encodeString(buffer, s.reason),
		])

		const messageType = this.w.setVint53(buffer, Id.SubscribeError)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async unsubscribe(s: Unsubscribe) {
		const buffer = new Uint8Array(8)

		const msgData = this.w.concatBuffer([this.w.setVint62(buffer, s.id)])

		const messageType = this.w.setVint53(buffer, Id.Unsubscribe)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async publish(p: Publish) {
		const buffer = new Uint8Array(8)

		let msgData = this.w.concatBuffer([
			this.w.setVint62(buffer, p.id),
			this.w.encodeTuple(buffer, p.namespace),
			this.w.encodeString(buffer, p.name),
			this.w.setVint62(buffer, p.track_alias),
			this.w.setUint8(buffer, p.group_order ?? GroupOrder.Publisher),
			this.w.setUint8(buffer, p.content_exists),

		])

		if (p.content_exists) {
			msgData = this.w.concatBuffer([msgData, this.encodeLocation(buffer, p.largest_location!)])
		}

		msgData = this.w.concatBuffer([
			msgData,
			this.w.setUint8(buffer, p.forward),
			this.encodeParameters(buffer, p.params),
		])

		const messageType = this.w.setVint53(buffer, Id.Publish)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async publish_done(p: PublishDone) {
		const buffer = new Uint8Array(8)

		const msgData = this.w.concatBuffer([
			this.w.setVint62(buffer, p.id),
			this.w.setVint62(buffer, p.code),
			this.w.setVint62(buffer, p.stream_count),
			this.w.encodeString(buffer, p.reason),
		])

		const messageType = this.w.setVint53(buffer, Id.PublishDone)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async publish_ok(p: PublishOk) {
		const buffer = new Uint8Array(8)

		let msgData = this.w.concatBuffer([
			this.w.setVint62(buffer, p.id),
			this.w.setUint8(buffer, p.forward),
			this.w.setUint8(buffer, p.subscriber_priority),
			this.w.setUint8(buffer, p.group_order),
			this.encodeFilterType(buffer, p.filter_type),
		])

		if (p.filter_type == FilterType.AbsoluteRange || p.filter_type == FilterType.AbsoluteStart) {
			msgData = this.w.concatBuffer([msgData, this.encodeLocation(buffer, p.start_location!)])
		}

		if (p.filter_type == FilterType.AbsoluteRange) {
			msgData = this.w.concatBuffer([msgData, this.w.setVint62(buffer, p.end_group!)])
		}

		msgData = this.w.concatBuffer([msgData, this.encodeParameters(buffer, p.params)])
		const messageType = this.w.setVint53(buffer, Id.PublishOk)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async publish_error(p: PublishError) {
		const buffer = new Uint8Array(8)

		const msgData = this.w.concatBuffer([
			this.w.setVint62(buffer, p.id),
			this.w.setVint62(buffer, p.code),
			this.w.encodeString(buffer, p.reason),
		])

		const messageType = this.w.setVint53(buffer, Id.PublishError)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async publish_namespace(a: PublishNamespace) {
		const buffer = new Uint8Array(8)

		const msgData = this.w.concatBuffer([
			this.w.encodeTuple(buffer, a.namespace),
			this.encodeParameters(buffer, a.params),
		])

		const messageType = this.w.setVint53(buffer, Id.PublishNamespace)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async publish_namespace_ok(a: PublishNamespaceOk) {
		const buffer = new Uint8Array(8)

		const msgData = this.w.concatBuffer([this.w.encodeTuple(buffer, a.namespace)])

		const messageType = this.w.setVint53(buffer, Id.PublishNamespaceOk)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async publish_namespace_error(a: PublishNamespaceError) {
		const buffer = new Uint8Array(8)
		const msgData = this.w.concatBuffer([
			this.w.encodeTuple(buffer, a.namespace),
			this.w.setVint62(buffer, a.code),
			this.w.encodeString(buffer, a.reason),
		])

		const messageType = this.w.setVint53(buffer, Id.PublishNamespaceError)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async publish_namespace_done(a: PublishNamespaceDone) {
		const buffer = new Uint8Array(8)

		const msgData = this.w.concatBuffer([this.w.encodeTuple(buffer, a.namespace)])

		const messageType = this.w.setVint53(buffer, Id.PublishNamespaceDone)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	private encodeFilterType(buffer: Uint8Array, ft: FilterType): Uint8Array {
		return this.w.setVint62(buffer, BigInt(ft))
	}

	private encodeLocation(buffer: Uint8Array, l: Location): Uint8Array {
		return this.w.concatBuffer([
			this.w.setVint62(buffer, l.group),
			this.w.setVint62(buffer, l.object),
		])
	}

	private encodeParameters(buffer: Uint8Array, p: Parameters | undefined): Uint8Array {
		if (!p) return this.w.setUint8(buffer, 0)

		const paramFields = [this.w.setVint53(buffer, p.size)]
		for (const [id, value] of p) {
			const idBytes = this.w.setVint62(buffer, id)
			const sizeBytes = this.w.setVint53(buffer, value.length)
			paramFields.push(idBytes, sizeBytes, value)
		}

		return this.w.concatBuffer(paramFields)
	}

	async fetch(f: Fetch) {
		const buffer = new Uint8Array(8)

		const msgData = this.w.concatBuffer([
			this.w.setVint62(buffer, f.id),
			this.w.encodeTuple(buffer, f.namespace),
			this.w.encodeString(buffer, f.name),
			this.w.setUint8(buffer, f.subscriber_priority),
			this.w.setUint8(buffer, f.group_order),
			this.w.setVint53(buffer, f.start_group),
			this.w.setVint53(buffer, f.start_object),
			this.w.setVint53(buffer, f.end_group),
			this.w.setVint53(buffer, f.end_object),
			this.encodeParameters(buffer, f.params),
		])

		const messageType = this.w.setVint53(buffer, Id.Fetch)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async fetchCancel(fc: FetchCancel) {
		const buffer = new Uint8Array(8)

		const msgData = this.w.concatBuffer([this.w.setVint62(buffer, fc.id)])

		const messageType = this.w.setVint53(buffer, Id.FetchCancel)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async fetchOk(fo: FetchOk) {
		const buffer = new Uint8Array(8)

		const msgData = this.w.concatBuffer([
			this.w.setVint62(buffer, fo.id),
			this.w.setUint8(buffer, fo.group_order),
			this.w.setUint8(buffer, fo.end_of_track),
			this.w.setVint62(buffer, fo.largest_group_id),
			this.w.setVint62(buffer, fo.largest_object_id),
			this.encodeParameters(buffer, fo.params),
		])

		const messageType = this.w.setVint53(buffer, Id.FetchOk)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}

	async fetchError(fe: FetchError) {
		const buffer = new Uint8Array(8)

		const msgData = this.w.concatBuffer([
			this.w.setVint62(buffer, fe.id),
			this.w.setVint62(buffer, fe.code),
			this.w.encodeString(buffer, fe.reason),
		])

		const messageType = this.w.setVint53(buffer, Id.FetchError)
		const messageLength = this.w.setVint53(buffer, msgData.length)

		for (const elem of [messageType, messageLength, msgData]) {
			await this.w.write(elem)
		}
	}
}
