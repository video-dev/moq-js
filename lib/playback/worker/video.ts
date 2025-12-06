import { Frame, Component } from "./timeline"
import * as MP4 from "../../media/mp4"
import * as Message from "./message"

interface DecoderConfig {
	codec: string
	description?: ArrayBuffer | Uint8Array | DataView
	codedWidth?: number
	codedHeight?: number
	displayAspectWidth?: number
	displayAspectHeight?: number
	colorSpace?: {
		primaries?: "bt709" | "bt470bg" | "smpte170m"
		transfer?: "bt709" | "smpte170m" | "iec61966-2-1"
		matrix?: "rgb" | "bt709" | "bt470bg" | "smpte170m"
	}
	hardwareAcceleration?: "no-preference" | "prefer-hardware" | "prefer-software"
	optimizeForLatency?: boolean
}

// Wrapper for VideoFrame with original timestamp
interface FrameWithTimestamp {
	frame: VideoFrame
	originalTimestamp: number
}

export class Renderer {
	#canvas: OffscreenCanvas
	#timeline: Component

	#decoder!: VideoDecoder
	#queue: TransformStream<Frame, FrameWithTimestamp>

	#decoderConfig?: DecoderConfig
	#waitingForKeyframe: boolean = true
	#paused: boolean
	#hasSentWaitingForKeyFrameEvent: boolean = false

	// Frame timing for proper playback rate
	#playbackStartTime: number | null = null
	#firstFrameTimestamp: number | null = null

	// Map to store original timestamps for frames (with memory leak protection)
	#frameTimestamps: Map<number, number> = new Map()
	#MAX_TIMESTAMP_MAP_SIZE = 100 // Prevent memory leaks

	constructor(config: Message.ConfigVideo, timeline: Component) {
		this.#canvas = config.canvas
		this.#timeline = timeline
		this.#paused = false

		this.#queue = new TransformStream({
			start: this.#start.bind(this),
			transform: this.#transform.bind(this),
		})

		this.#run().catch(console.error)
	}

	pause() {
		this.#paused = true
		this.#decoder.flush().catch((err) => {
			console.error(err)
		})
		this.#waitingForKeyframe = true
		// Reset timing on pause so next play starts fresh
		this.#playbackStartTime = null
		this.#firstFrameTimestamp = null
	}

	play() {
		this.#paused = false
		// Reset timing on play to start fresh
		this.#playbackStartTime = null
		this.#firstFrameTimestamp = null
	}

	async #run() {
		const reader = this.#timeline.frames.pipeThrough(this.#queue).getReader()

		for (;;) {
			const { value: frameWithTimestamp, done } = await reader.read()
			if (this.#paused) continue
			if (done) break

			const frame = frameWithTimestamp.frame
			const frameTimestampMs = frameWithTimestamp.originalTimestamp

			// Initialize timing on first frame
			if (this.#firstFrameTimestamp === null || this.#playbackStartTime === null) {
				this.#firstFrameTimestamp = frameTimestampMs
				this.#playbackStartTime = performance.now()
			}

			// Calculate when this frame should be displayed
			const frameOffsetMs = frameTimestampMs - this.#firstFrameTimestamp
			const targetDisplayTime = this.#playbackStartTime + frameOffsetMs

			// Use requestAnimationFrame with timestamp for smoother playback
			self.requestAnimationFrame(() => {
				// Check if still not paused (could have paused during wait)
				if (this.#paused) {
					frame.close()
					return
				}

				// Check if we should skip this frame (too late)
				const now = performance.now()
				const lateness = now - targetDisplayTime

				// If we're more than 50ms late, skip this frame
				if (lateness > 50) {
					frame.close()
					return
				}

				this.#canvas.width = frame.displayWidth
				this.#canvas.height = frame.displayHeight

				const ctx = this.#canvas.getContext("2d")
				if (!ctx) throw new Error("failed to get canvas context")

				ctx.drawImage(frame, 0, 0, frame.displayWidth, frame.displayHeight) // TODO respect aspect ratio
				frame.close()
			})
		}
	}

	#start(controller: TransformStreamDefaultController<FrameWithTimestamp>) {
		this.#decoder = new VideoDecoder({
			output: (frame: VideoFrame) => {
				// Retrieve the original timestamp from our map
				const originalTimestamp = this.#frameTimestamps.get(frame.timestamp)
				if (originalTimestamp !== undefined) {
					// Wrap frame with original timestamp
					controller.enqueue({
						frame: frame,
						originalTimestamp: originalTimestamp,
					})
					// Clean up the map entry
					this.#frameTimestamps.delete(frame.timestamp)
				} else {
					// Fallback: use the frame's timestamp converted to milliseconds
					controller.enqueue({
						frame: frame,
						originalTimestamp: frame.timestamp / 1000,
					})
				}
			},
			error: console.error,
		})
	}

	#transform(frame: Frame) {
		if (this.#decoder.state === "closed" || this.#paused) {
			console.warn("Decoder is closed or paused. Skipping frame.")
			return
		}

		const { sample, track } = frame

		// Reset the decoder on video track change
		if (this.#decoderConfig && this.#decoder.state == "configured") {
			if (MP4.isVideoTrack(track)) {
				const configMismatch =
					this.#decoderConfig.codec !== track.codec ||
					this.#decoderConfig.codedWidth !== track.video.width ||
					this.#decoderConfig.codedHeight !== track.video.height

				if (configMismatch) {
					this.#decoder.reset()
					this.#decoderConfig = undefined
				}
			}
		}

		// Configure the decoder with the first frame
		if (this.#decoder.state !== "configured") {
			const desc = sample.description
			const box = desc.avcC ?? desc.hvcC ?? desc.vpcC ?? desc.av1C
			if (!box) throw new Error(`unsupported codec: ${track.codec}`)

			const buffer = new MP4.Stream(undefined, 0, MP4.Stream.BIG_ENDIAN)
			box.write(buffer)
			const description = new Uint8Array(buffer.buffer, 8) // Remove the box header.

			if (!MP4.isVideoTrack(track)) throw new Error("expected video track")

			this.#decoderConfig = {
				codec: track.codec,
				codedHeight: track.video.height,
				codedWidth: track.video.width,
				description,
				// optimizeForLatency: true
			}

			this.#decoder.configure(this.#decoderConfig)
			if (!frame.sample.is_sync) {
				this.#waitingForKeyframe = true
			} else {
				this.#waitingForKeyframe = false
			}
		}

		//At the start of decode , VideoDecoder seems to expect a key frame after configure() or flush()
		if (this.#decoder.state == "configured") {
			if (this.#waitingForKeyframe && !frame.sample.is_sync) {
				console.warn("Skipping non-keyframe until a keyframe is found.")
				if (!this.#hasSentWaitingForKeyFrameEvent) {
					self.postMessage({ type: "waitingforkeyframe" })
					this.#hasSentWaitingForKeyFrameEvent = true
				}
				return
			}

			// On arrival of a keyframe, allow decoding and stop waiting for a keyframe.
			if (frame.sample.is_sync) {
				this.#waitingForKeyframe = false
				this.#hasSentWaitingForKeyFrameEvent = false
			}

			// Calculate timestamp in seconds for the chunk (standard WebCodecs unit)
			const timestampSeconds = frame.sample.dts / frame.track.timescale

			// Store the original timestamp (in milliseconds) so we can retrieve it later
			const timestampMs = timestampSeconds * 1000

			// Prevent memory leak: if map gets too large, clear oldest entries
			if (this.#frameTimestamps.size >= this.#MAX_TIMESTAMP_MAP_SIZE) {
				const firstKey = this.#frameTimestamps.keys().next().value
				if (firstKey !== undefined) {
					this.#frameTimestamps.delete(firstKey)
				}
			}

			this.#frameTimestamps.set(timestampSeconds, timestampMs)

			const chunk = new EncodedVideoChunk({
				type: frame.sample.is_sync ? "key" : "delta",
				data: frame.sample.data,
				timestamp: timestampSeconds,
			})

			this.#decoder.decode(chunk)
		}
	}
}
