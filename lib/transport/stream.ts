
import {
	ControlMessageType, FetchError,
	MessageWithType, Publish,
	PublishDone, PublishError, PublishNamespace,
	PublishNamespaceDone, PublishNamespaceError,
	PublishNamespaceOk, PublishOk, Unsubscribe,
	Fetch, FetchOk, FetchCancel,
	Subscribe, SubscribeOk, SubscribeError,
	SubscribeUpdate, SubscribeNamespace,
	SubscribeNamespaceOk, SubscribeNamespaceError,
	GoAway, MaxRequestId,
} from "./control"
import { debug } from "./utils"
import { ImmutableBytesBuffer, ReadableWritableStreamBuffer, Reader, Writer } from "./buffer"
import { RequestsBlocked } from "./control/requests_block"

export class ControlStream {
	private decoder: Decoder
	private encoder: Encoder
	// Our next request ID to use when sending requests
	#nextRequestId = 0n
	// Remote's maximum request ID (first invalid ID). Requests we send must be < this value.
	#remoteMaxRequestId?: bigint

	#mutex = Promise.resolve()

	constructor(c: ReadableWritableStreamBuffer) {
		this.decoder = new Decoder(c)
		this.encoder = new Encoder(c)
	}

	// Will error if two messages are read at once.
	async recv(): Promise<MessageWithType> {
		const msg = await this.decoder.message()
		return msg
	}

	async send(msg: MessageWithType) {
		const unlock = await this.#lock()
		try {
			debug("sending message", msg)
			const payload = this.encoder.message(msg)
			debug("sending payload", payload)
			await this.encoder.send(payload)
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

		// Wait until the previous lock is done, then resolve our lock.
		const lock = this.#mutex.then(() => done)

		// Save our lock as the next lock.
		this.#mutex = p

		// Return the lock.
		return lock
	}

	/**
	 * Returns the next request ID or throws if max request ID is reached.
	 * Per spec: "If a Request ID equal to or larger than this [MAX_REQUEST_ID] is received
	 * by the endpoint that sent the MAX_REQUEST_ID in any request message, the endpoint
	 * MUST close the session with an error of TOO_MANY_REQUESTS."
	 * @param incr number at which the next request ID should be incremented (default 2 for client)
	 * @returns next request ID
	 */
	nextRequestId(incr: bigint = 2n): bigint {
		const id = this.#nextRequestId

		// Check if we're about to exceed the remote's max request ID
		if (this.#remoteMaxRequestId !== undefined && id >= this.#remoteMaxRequestId) {
			throw new Error(`TOO_MANY_REQUESTS: Request ID ${id} >= remote max ${this.#remoteMaxRequestId}`)
		}

		this.#nextRequestId += incr
		return id
	}

	/**
	 * Sets the remote's maximum request ID. Per spec:
	 * "The Maximum Request ID MUST only increase within a session, and receipt of a
	 * MAX_REQUEST_ID message with an equal or smaller Request ID value is a PROTOCOL_VIOLATION."
	 * 
	 * Note: The id parameter is the "Maximum Request ID + 1" (first invalid ID).
	 * @param id The new maximum request ID for the session plus 1
	 */
	setRemoteMaxRequestId(id: bigint) {
		// Validate that MAX_REQUEST_ID only increases
		if (this.#remoteMaxRequestId !== undefined && id <= this.#remoteMaxRequestId) {
			throw new Error(`PROTOCOL_VIOLATION: MAX_REQUEST_ID must only increase (received ${id}, current ${this.#remoteMaxRequestId})`)
		}
		this.#remoteMaxRequestId = id
	}
}

export class Decoder {
	r: Reader

	constructor(r: Reader) {
		this.r = r
	}

	private async messageType(): Promise<ControlMessageType> {
		const t = await this.r.getNumberVarInt()
		return t as ControlMessageType
	}

	async message(): Promise<MessageWithType> {
		const t = await this.messageType()
		const advertisedLength = await this.r.getU16()
		if (advertisedLength > this.r.byteLength) {
			console.error(
				`message: ${ControlMessageType.toString(t)} length mismatch: advertised ${advertisedLength} > ${this.r.byteLength} received`,
			)
			// NOTE(itzmanish): should we have a timeout and retry few times even if timeout is reached?
			await this.r.waitForBytes(advertisedLength)
		}
		const rawPayload = await this.r.read(advertisedLength)
		const payload = new ImmutableBytesBuffer(rawPayload)

		let res: MessageWithType
		switch (t) {
			case ControlMessageType.RequestsBlocked:
				res = {
					type: t,
					message: RequestsBlocked.deserialize(payload),
				}
				break
			case ControlMessageType.GoAway:
				res = {
					type: t,
					message: GoAway.deserialize(payload),
				}
				break
			case ControlMessageType.Subscribe:
				res = {
					type: t,
					message: Subscribe.deserialize(payload),
				}
				break
			case ControlMessageType.SubscribeOk:
				res = {
					type: t,
					message: SubscribeOk.deserialize(payload),
				}
				break
			case ControlMessageType.SubscribeError:
				res = {
					type: t,
					message: SubscribeError.deserialize(payload),
				}
				break
			case ControlMessageType.Unsubscribe:
				res = {
					type: t,
					message: Unsubscribe.deserialize(payload),
				}
				break
			case ControlMessageType.SubscribeUpdate:
				res = {
					type: t,
					message: SubscribeUpdate.deserialize(payload),
				}
				break
			case ControlMessageType.Publish:
				res = {
					type: t,
					message: Publish.deserialize(payload),
				}
				break
			case ControlMessageType.PublishDone:
				res = {
					type: t,
					message: PublishDone.deserialize(payload),
				}
				break
			case ControlMessageType.PublishOk:
				res = {
					type: t,
					message: PublishOk.deserialize(payload),
				}
				break
			case ControlMessageType.PublishError:
				res = {
					type: t,
					message: PublishError.deserialize(payload),
				}
				break
			case ControlMessageType.PublishNamespace:
				res = {
					type: t,
					message: PublishNamespace.deserialize(payload),
				}
				break
			case ControlMessageType.PublishNamespaceOk:
				res = {
					type: t,
					message: PublishNamespaceOk.deserialize(payload),
				}
				break
			case ControlMessageType.PublishNamespaceDone:
				res = {
					type: t,
					message: PublishNamespaceDone.deserialize(payload),
				}
				break
			case ControlMessageType.PublishNamespaceError:
				res = {
					type: t,
					message: PublishNamespaceError.deserialize(payload),
				}
				break
			case ControlMessageType.Fetch:
				res = {
					type: t,
					message: Fetch.deserialize(payload),
				}
				break
			case ControlMessageType.FetchCancel:
				res = {
					type: t,
					message: FetchCancel.deserialize(payload),
				}
				break
			case ControlMessageType.FetchOk:
				res = {
					type: t,
					message: FetchOk.deserialize(payload),
				}
				break
			case ControlMessageType.FetchError:
				res = {
					type: t,
					message: FetchError.deserialize(payload),
				}
				break
			case ControlMessageType.SubscribeNamespace:
				res = {
					type: t,
					message: SubscribeNamespace.deserialize(payload),
				}
				break
			case ControlMessageType.SubscribeNamespaceOk:
				res = {
					type: t,
					message: SubscribeNamespaceOk.deserialize(payload),
				}
				break
			case ControlMessageType.SubscribeNamespaceError:
				res = {
					type: t,
					message: SubscribeNamespaceError.deserialize(payload),
				}
				break
			case ControlMessageType.MaxRequestId:
				res = {
					type: t,
					message: MaxRequestId.deserialize(payload),
				}
				break
			default:
				throw new Error(`unknown message kind: ${t}`)
		}

		return res

	}
}

export class Encoder {
	w: Writer

	constructor(w: Writer) {
		this.w = w
	}

	message(m: MessageWithType): Uint8Array {
		const { message } = m
		switch (m.type) {
			case ControlMessageType.Subscribe:
				return Subscribe.serialize(message as Subscribe)
			case ControlMessageType.SubscribeOk:
				return SubscribeOk.serialize(message as SubscribeOk)
			case ControlMessageType.SubscribeError:
				return SubscribeError.serialize(message as SubscribeError)
			case ControlMessageType.SubscribeUpdate:
				return SubscribeUpdate.serialize(message as SubscribeUpdate)
			case ControlMessageType.SubscribeNamespace:
				return SubscribeNamespace.serialize(message as SubscribeNamespace)
			case ControlMessageType.SubscribeNamespaceOk:
				return SubscribeNamespaceOk.serialize(message as SubscribeNamespaceOk)
			case ControlMessageType.SubscribeNamespaceError:
				return SubscribeNamespaceError.serialize(message as SubscribeNamespaceError)
			case ControlMessageType.Unsubscribe:
				return Unsubscribe.serialize(message as Unsubscribe)
			case ControlMessageType.Publish:
				return Publish.serialize(message as Publish)
			case ControlMessageType.PublishDone:
				return PublishDone.serialize(message as PublishDone)
			case ControlMessageType.PublishOk:
				return PublishOk.serialize(message as PublishOk)
			case ControlMessageType.PublishError:
				return PublishError.serialize(message as PublishError)
			case ControlMessageType.PublishNamespace:
				return PublishNamespace.serialize(message as PublishNamespace)
			case ControlMessageType.PublishNamespaceOk:
				return PublishNamespaceOk.serialize(message as PublishNamespaceOk)
			case ControlMessageType.PublishNamespaceError:
				return PublishNamespaceError.serialize(message as PublishNamespaceError)
			case ControlMessageType.PublishNamespaceDone:
				return PublishNamespaceDone.serialize(message as PublishNamespaceDone)
			case ControlMessageType.Fetch:
				return Fetch.serialize(message as Fetch)
			case ControlMessageType.FetchCancel:
				return FetchCancel.serialize(message as FetchCancel)
			case ControlMessageType.FetchOk:
				return FetchOk.serialize(message as FetchOk)
			case ControlMessageType.FetchError:
				return FetchError.serialize(message as FetchError)
			case ControlMessageType.MaxRequestId:
				return MaxRequestId.serialize(message as MaxRequestId)
			case ControlMessageType.GoAway:
				return GoAway.serialize(message as GoAway)
			case ControlMessageType.RequestsBlocked:
				return RequestsBlocked.serialize(message as RequestsBlocked)
			default:
				throw new Error(`unknown message kind in encoder`)
		}
	}

	async send(payload: Uint8Array) {
		await this.w.write(payload)
	}
}

