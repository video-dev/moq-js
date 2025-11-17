import { Subscribe, GroupOrder, FilterType } from "./subscribe"
import { SubscribeOk } from "./subscribe_ok"
import { SubscribeError } from "./subscribe_error"
import { SubscribeUpdate } from "./subscribe_update"
import { SubscribeNamespace } from "./subscribe_namespace"
import { SubscribeNamespaceOk } from "./subscribe_namespace_ok"
import { SubscribeNamespaceError } from "./subscribe_namespace_error"
import { Unsubscribe } from "./unsubscribe"
import { Publish } from "./publish"
import { PublishOk } from "./publish_ok"
import { PublishError } from "./publish_error"
import { PublishDone } from "./publish_done"
import { PublishNamespace } from "./publish_namespace"
import { PublishNamespaceOk } from "./publish_namespace_ok"
import { PublishNamespaceError } from "./publish_namespace_error"
import { PublishNamespaceDone } from "./publish_namespace_done"
import { Fetch } from "./fetch"
import { FetchOk } from "./fetch_ok"
import { FetchError } from "./fetch_error"
import { FetchCancel } from "./fetch_cancel"
import { GoAway } from "./go_away"
import { ClientSetup } from "./client_setup"
import { ServerSetup } from "./server_setup"
import { MaxRequestId } from "./max_request_id"


enum Version {
    DRAFT_00 = 0xff000000,
    DRAFT_01 = 0xff000001,
    DRAFT_02 = 0xff000002,
    DRAFT_03 = 0xff000003,
    DRAFT_04 = 0xff000004,
    DRAFT_05 = 0xff000005,
    DRAFT_06 = 0xff000006,
    DRAFT_07 = 0xff000007,
    DRAFT_14 = 0xff00000e,
    KIXEL_00 = 0xbad00,
    KIXEL_01 = 0xbad01,
}

// Discriminated union where data type matches the control message type
type MessageWithType =
    | { type: ControlMessageType.Publish; message: Publish }
    | { type: ControlMessageType.PublishOk; message: PublishOk }
    | { type: ControlMessageType.PublishError; message: PublishError }
    | { type: ControlMessageType.PublishDone; message: PublishDone }
    | { type: ControlMessageType.PublishNamespace; message: PublishNamespace }
    | { type: ControlMessageType.PublishNamespaceOk; message: PublishNamespaceOk }
    | { type: ControlMessageType.PublishNamespaceError; message: PublishNamespaceError }
    | { type: ControlMessageType.PublishNamespaceDone; message: PublishNamespaceDone }
    | { type: ControlMessageType.Fetch; message: Fetch }
    | { type: ControlMessageType.FetchOk; message: FetchOk }
    | { type: ControlMessageType.FetchError; message: FetchError }
    | { type: ControlMessageType.FetchCancel; message: FetchCancel }
    | { type: ControlMessageType.Subscribe; message: Subscribe }
    | { type: ControlMessageType.SubscribeOk; message: SubscribeOk }
    | { type: ControlMessageType.SubscribeError; message: SubscribeError }
    | { type: ControlMessageType.SubscribeUpdate; message: SubscribeUpdate }
    | { type: ControlMessageType.SubscribeNamespace; message: SubscribeNamespace }
    | { type: ControlMessageType.SubscribeNamespaceOk; message: SubscribeNamespaceOk }
    | { type: ControlMessageType.SubscribeNamespaceError; message: SubscribeNamespaceError }
    | { type: ControlMessageType.Unsubscribe; message: Unsubscribe }
    | { type: ControlMessageType.GoAway; message: GoAway }
    | { type: ControlMessageType.MaxRequestId; message: MaxRequestId }

type Message = Subscriber | Publisher

// Sent by subscriber
type Subscriber = Subscribe | SubscribeUpdate | SubscribeNamespace |
    Unsubscribe | PublishOk | PublishError |
    PublishNamespaceOk | PublishNamespaceError | Fetch | FetchCancel

// Sent by publisher
type Publisher = SubscribeOk | SubscribeError
    | SubscribeNamespaceOk | SubscribeNamespaceError |
    PublishDone | Publish | PublishNamespace | PublishNamespaceDone
    | FetchOk | FetchError

function isSubscriber(m: ControlMessageType): boolean {
    return (
        m == ControlMessageType.Subscribe ||
        m == ControlMessageType.SubscribeUpdate ||
        m == ControlMessageType.Unsubscribe ||
        m == ControlMessageType.PublishOk ||
        m == ControlMessageType.PublishError ||
        m == ControlMessageType.PublishNamespaceOk ||
        m == ControlMessageType.PublishNamespaceError
    )
}

function isPublisher(m: ControlMessageType): boolean {
    return (
        m == ControlMessageType.SubscribeOk ||
        m == ControlMessageType.SubscribeError ||
        m == ControlMessageType.PublishDone ||
        m == ControlMessageType.Publish ||
        m == ControlMessageType.PublishNamespace ||
        m == ControlMessageType.PublishNamespaceDone
    )
}

export enum ControlMessageType {
    ReservedSetupV00 = 0x1,
    GoAway = 0x10,
    MaxRequestId = 0x15,
    RequestsBlocked = 0x1a,

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
    SubscribeNamespace = 0x11,
    SubscribeNamespaceOk = 0x12,
    SubscribeNamespaceError = 0x13,
    Fetch = 0x16,
    FetchCancel = 0x17,
    FetchOk = 0x18,
    FetchError = 0x19,

    ClientSetup = 0x20,
    ServerSetup = 0x21,
}

export namespace ControlMessageType {
    export function toString(t: ControlMessageType): string {
        switch (t) {
            case ControlMessageType.ReservedSetupV00: return "ReservedSetupV00"
            case ControlMessageType.GoAway: return "GoAway"
            case ControlMessageType.MaxRequestId: return "MaxRequestId"
            case ControlMessageType.RequestsBlocked: return "RequestsBlocked"
            case ControlMessageType.SubscribeUpdate: return "SubscribeUpdate"
            case ControlMessageType.Subscribe: return "Subscribe"
            case ControlMessageType.SubscribeOk: return "SubscribeOk"
            case ControlMessageType.SubscribeError: return "SubscribeError"
            case ControlMessageType.Unsubscribe: return "Unsubscribe"
            case ControlMessageType.PublishDone: return "PublishDone"
            case ControlMessageType.Publish: return "Publish"
            case ControlMessageType.PublishOk: return "PublishOk"
            case ControlMessageType.PublishError: return "PublishError"
            case ControlMessageType.PublishNamespace: return "PublishNamespace"
            case ControlMessageType.PublishNamespaceOk: return "PublishNamespaceOk"
            case ControlMessageType.PublishNamespaceError: return "PublishNamespaceError"
            case ControlMessageType.PublishNamespaceDone: return "PublishNamespaceDone"
            case ControlMessageType.SubscribeNamespace: return "SubscribeNamespace"
            case ControlMessageType.SubscribeNamespaceOk: return "SubscribeNamespaceOk"
            case ControlMessageType.SubscribeNamespaceError: return "SubscribeNamespaceError"
            case ControlMessageType.Fetch: return "Fetch"
            case ControlMessageType.FetchCancel: return "FetchCancel"
            case ControlMessageType.FetchOk: return "FetchOk"
            case ControlMessageType.FetchError: return "FetchError"
            case ControlMessageType.ClientSetup: return "ClientSetup"
            case ControlMessageType.ServerSetup: return "ServerSetup"
        }
    }
}


export {
    Subscribe,
    SubscribeOk,
    SubscribeError,
    SubscribeUpdate,
    SubscribeNamespace,
    SubscribeNamespaceOk,
    SubscribeNamespaceError,
    Unsubscribe,
    Publish,
    PublishOk,
    PublishError,
    PublishDone,
    PublishNamespace,
    PublishNamespaceOk,
    PublishNamespaceError,
    PublishNamespaceDone,
    Fetch,
    FetchOk,
    FetchError,
    FetchCancel,
    GoAway,
    MaxRequestId,
    ClientSetup,
    ServerSetup,

    Version,
    isSubscriber,
    isPublisher,
    MessageWithType,
    Message,
    GroupOrder,
    FilterType,
}