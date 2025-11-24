import { Client } from "../transport/client"
import { Broadcast, BroadcastConfig } from "../contribute"
import { Connection } from "../transport/connection"

export interface PublisherOptions {
	url: string
	namespace: string[]
	media: MediaStream
	video?: VideoEncoderConfig
	audio?: AudioEncoderConfig
	fingerprintUrl?: string
}

export class PublisherApi extends EventTarget {
	private client: Client
	private connection?: Connection
	private broadcast?: Broadcast
	private opts: PublisherOptions

	constructor(opts: PublisherOptions) {
		super()
		this.opts = opts
		this.client = new Client({
			url: opts.url,
			fingerprint: opts.fingerprintUrl,
		})
	}

	async publish(): Promise<void> {
		if (!this.connection) {
			this.connection = await this.client.connect()
			this.connection.onMigration = async (sessionUri) => {
				console.log("dispatching reconnect event from publisher")
				this.dispatchEvent(new CustomEvent("reconnect", { detail: { uri: sessionUri } }))
			}
		}

		const bcConfig: BroadcastConfig = {
			connection: this.connection,
			namespace: this.opts.namespace,
			media: this.opts.media,
			video: this.opts.video,
			audio: this.opts.audio,
		}

		this.broadcast = new Broadcast(bcConfig)
	}

	async stop(goingaway: boolean = false): Promise<void> {
		if (this.broadcast) {
			this.broadcast.close(goingaway)
			const err = await this.broadcast.closed()
			if (err) {
				console.error("Error in broadcast closed:", err)
			}
		}
		if (this.connection) {
			if (goingaway) {
				this.connection.close(0x4, "going away")
			} else {
				this.connection.close()
			}
			await this.connection.closed()
		}
	}
}