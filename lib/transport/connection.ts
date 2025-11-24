import * as Control from "./control"
import { Objects } from "./objects"
import { asError } from "../common/error"
import { ControlStream } from "./stream"

import { Publisher } from "./publisher"
import { Subscriber } from "./subscriber"
import { sleep } from "./utils"

export type MigrationState = "none" | "going_away" | "in_progress" | "done"

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
	onMigration: (sessionUri?: string) => Promise<void> = async () => {
		throw new Error("not implemented")
	}

	get migrationState() {
		return this.#migrationState
	}

	close(code = 0, reason = "") {
		this.#quic.close({ closeCode: code, reason })
	}

	async #run(): Promise<void> {
		await Promise.all([this.#runControl(), this.#runObjects()])
	}

	async closePublisher(sendGoAway: boolean = true) {
		if (sendGoAway) {
			await this.#controlStream.send({
				type: Control.ControlMessageType.GoAway,
				message: {
					session_uri: "",
				},
			})
		}
		this.#migrationState = "going_away"
		this.#subscriber.migrationState = "going_away"
		this.#publisher.migrationState = "going_away"
		while (this.#publisher.activeSubscribersCount > 0) {
			// Wait for all subscribers to close
			await sleep(100)
		}
		console.log("no more active publisher", this.#publisher);
		return this.#publisher.close()
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
				console.log("control loop got msg", msg)
				await this.#recv(msg)
			}
		} catch (e: any) {
			if (e.message === "close()") {
				console.warn("closing the connection: ", e)
				return
			}
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
		} catch (e: any) {
			if (e.message === "close()") {
				console.warn("closing the connection: ", e)
				return
			}
			console.error("Error in object stream:", e)
			throw e
		}
	}

	async #recv(msg: Control.MessageWithType) {
		if (msg.type === Control.ControlMessageType.GoAway) {
			this.#handleGoAway(msg.message)
		} else if (msg.type === Control.ControlMessageType.MaxRequestId) {
			await this.#handleMaxRequestId(msg.message)
		} else if (Control.isPublisher(msg.type)) {
			await this.#subscriber.recv(msg)
		} else {
			await this.#publisher.recv(msg)
		}
	}

	async #handleMaxRequestId(msg: Control.MaxRequestId) {
		this.#controlStream.setRemoteMaxRequestId(msg.id)
	}

	async #handleGoAway(msg: Control.GoAway) {
		console.log("preparing for migration, got go_away message:", msg)
		if (this.#migrationState === "in_progress") {
			throw new Error("go away received twice")
		}
		this.#migrationState = "in_progress"
		await this.#subscriber.startMigration()
		await this.#publisher.startMigration()

		while (this.#subscriber.activeSubscribersCount > 0) {
			await sleep(100)
		}
		console.log("active subscribers count", this.#publisher.activeSubscribersCount, this.#subscriber.activeSubscribersCount)

		this.#migrationState = "done"
		this.onMigration(msg.session_uri)
		console.log("should close the quic session now ")
	}

	async migrateSession(quic: WebTransport, control: ControlStream, objects: Objects) {
		this.#quic = quic
		this.#controlStream = control
		this.#objects = objects

		await this.#publisher.migrationDone(control, objects)
		await this.#subscriber.migrationDone(control, objects)

		this.#running = this.#run()
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
