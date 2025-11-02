import * as Stream from "./stream"
import * as Control from "./control"
import { Objects } from "./objects"
import { Connection } from "./connection"
import { debug } from "./utils"
import { ClientSetup, ControlMessageType, ServerSetup } from "./control"
import { ImmutableBytesBuffer } from "./buffer"

export interface ClientConfig {
	url: string
	// If set, the server fingerprint will be fetched from this URL.
	// This is required to use self-signed certificates with Chrome (May 2023)
	fingerprint?: string
}

export class Client {
	#fingerprint: Promise<WebTransportHash | undefined>

	readonly config: ClientConfig

	constructor(config: ClientConfig) {
		this.config = config

		this.#fingerprint = this.#fetchFingerprint(config.fingerprint).catch((e) => {
			console.warn("failed to fetch fingerprint: ", e)
			return undefined
		})
	}

	async connect(): Promise<Connection> {
		// Helper function to make creating a promise easier
		const options: WebTransportOptions = {}

		const fingerprint = await this.#fingerprint
		if (fingerprint) options.serverCertificateHashes = [fingerprint]

		const quic = new WebTransport(this.config.url, options)
		await quic.ready

		const stream = await quic.createBidirectionalStream({ sendOrder: Number.MAX_SAFE_INTEGER })

		const writer = new Stream.Writer(stream.writable)
		const reader = new Stream.Reader(new Uint8Array(), stream.readable)

		const msg: Control.ClientSetup = {
			versions: [Control.Version.DRAFT_14],
			params: new Map(),
		}
		await writer.write(Control.ClientSetup.serialize(msg))

		// Receive the setup message.
		// TODO verify the SETUP response.
		const server = await this.readServerSetup(reader)

		if (server.version != Control.Version.DRAFT_14) {
			throw new Error(`unsupported server version: ${server.version}`)
		}

		const control = new Control.Stream(reader, writer)
		const objects = new Objects(quic)

		return new Connection(quic, control, objects)
	}

	async #fetchFingerprint(url?: string): Promise<WebTransportHash | undefined> {
		if (!url) return

		// TODO remove this fingerprint when Chrome WebTransport accepts the system CA
		const response = await fetch(url)
		const hexString = await response.text()

		const hexBytes = new Uint8Array(hexString.length / 2)
		for (let i = 0; i < hexBytes.length; i += 1) {
			hexBytes[i] = parseInt(hexString.slice(2 * i, 2 * i + 2), 16)
		}

		return {
			algorithm: "sha-256",
			value: hexBytes,
		}
	}

	async readServerSetup(reader: Stream.Reader): Promise<ServerSetup> {
		const type: ControlMessageType = await reader.u53()
		if (type !== ControlMessageType.ServerSetup) throw new Error(`server SETUP type must be ${ControlMessageType.ServerSetup}, got ${type}`)

		const advertisedLength = await reader.u16()
		const bufferLen = reader.getByteLength()
		if (advertisedLength !== bufferLen) {
			throw new Error(`server SETUP message length mismatch: ${advertisedLength} != ${bufferLen}`)
		}

		const payload = await reader.read(advertisedLength)
		const bufReader = new ImmutableBytesBuffer(payload)
		const msg = ServerSetup.deserialize(bufReader)

		return msg
	}

	async readClientSetup(reader: Stream.Reader): Promise<ClientSetup> {
		const type: ControlMessageType = await reader.u53()
		if (type !== ControlMessageType.ClientSetup) throw new Error(`client SETUP type must be ${ControlMessageType.ClientSetup}, got ${type}`)

		const advertisedLength = await reader.u16()
		const bufferLen = reader.getByteLength()
		if (advertisedLength !== bufferLen) {
			throw new Error(`client SETUP message length mismatch: ${advertisedLength} != ${bufferLen}`)
		}

		const payload = await reader.read(advertisedLength)
		const bufReader = new ImmutableBytesBuffer(payload)
		return ClientSetup.deserialize(bufReader)
	}
}
