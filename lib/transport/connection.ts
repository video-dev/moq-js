import * as Control from "./control"
import { Objects } from "./objects"
import { asError } from "../common/error"
import { ControlStream } from "./stream"

import { Publisher } from "./publisher"
import { Subscriber } from "./subscriber"

export type MigrationState = "none" | "in_progress" | "done"

export class Connection {
	#migrationState: MigrationState = "none"
	// The established WebTransport session.
	#quic: WebTransport

	// Use to receive/send control messages.
	#controlStream: ControlStream

	// Use to receive/send objects.
	#objects: Objects

	// Module for contributing tracks.
	#publisher: Publisher

	// Module for distributing tracks.
	#subscriber: Subscriber

	// Async work running in the background
	#running: Promise<void>

	constructor(quic: WebTransport, stream: ControlStream, objects: Objects) {
		this.#quic = quic
		this.#controlStream = stream
		this.#objects = objects

		this.#publisher = new Publisher(this.#controlStream, this.#objects)
		this.#subscriber = new Subscriber(this.#controlStream, this.#objects)

		this.#running = this.#run()
	}

	// Callback, should be set when creating connection in the client
	onMigration: (sessionUri?: string) => Promise<{ quic: WebTransport, control: ControlStream, objects: Objects }> = async () => {
		throw new Error("not implemented")
	}

	close(code = 0, reason = "") {
		this.#quic.close({ closeCode: code, reason })
	}

	async #run(): Promise<void> {
		await Promise.all([this.#runControl(), this.#runObjects()])
	}

	publish_namespace(namespace: string[]) {
		return this.#publisher.publish_namespace(namespace)
	}

	publishedNamespaces() {
		return this.#subscriber.publishedNamespaces()
	}

	subscribe(namespace: string[], track: string) {
		return this.#subscriber.subscribe(namespace, track)
	}

	unsubscribe(track: string) {
		return this.#subscriber.unsubscribe(track)
	}

	subscribed() {
		return this.#publisher.subscribed()
	}

	async #runControl() {
		// Receive messages until the connection is closed.
		try {
			console.log("starting control loop")
			for (; ;) {
				const msg = await this.#controlStream.recv()
				await this.#recv(msg)
			}
		} catch (e) {
			console.error("Error in control stream:", e)
			throw e
		}
	}

	async #runObjects() {
		try {
			console.log("starting object loop")
			for (; ;) {
				const obj = await this.#objects.recv()
				console.log("object loop got obj", obj)
				if (!obj) break

				await this.#subscriber.recvObject(obj)
			}
		} catch (e) {
			console.error("Error in object stream:", e)
			throw e
		}
	}

	async #recv(msg: Control.MessageWithType) {
		if (msg.type === Control.ControlMessageType.GoAway) {
			await this.#handleGoAway(msg.message)
		} else if (Control.isPublisher(msg.type)) {
			await this.#subscriber.recv(msg)
		} else {
			await this.#publisher.recv(msg)
		}
	}

	async #handleGoAway(msg: Control.GoAway) {
		console.log("preparing for migration, got go_away message:", msg)
		if (this.#migrationState === "in_progress") {
			throw new Error("go away received twice")
		}
		this.#migrationState = "in_progress"
		await this.#subscriber.startMigration()
		await this.#publisher.startMigration()

		// FIXME(itzmanish): is this how we close the quic connection for go_away?
		this.#quic.close({ closeCode: 0, reason: "going_away" })

		const { quic, control, objects } = await this.onMigration(msg.session_uri)
		this.#quic = quic
		this.#controlStream = control
		this.#objects = objects
		this.#migrationState = "done"

		await this.#publisher.migrationDone(control, objects)
		await this.#subscriber.migrationDone(control, objects)
	}

	async migrateSession(quic: WebTransport, control: ControlStream, objects: Objects) {
		this.#quic = quic
		this.#controlStream = control
		this.#objects = objects
	}

	async closed(): Promise<Error> {
		try {
			await this.#running
			return new Error("closed")
		} catch (e) {
			return asError(e)
		}
	}
}
