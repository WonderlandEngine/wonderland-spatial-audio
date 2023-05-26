/// <reference types="webxr" />
import { Component, Emitter, Object3D } from '@wonderlandengine/api';
interface XRHitTestResult {
    createAnchor?: () => Promise<XRAnchor>;
}
interface XRAnchor {
    anchorSpace: XRSpace;
    requestPersistentHandle?: () => Promise<string>;
}
/**
 * Sets the location of the object to the location of an XRAnchor
 *
 * Create anchors using the `Anchor.create()` static function.
 *
 * Example for use with cursor:
 * ```js
 * cursorTarget.onClick.add((object, cursor, originalEvent) => {
 *     /* Only events in XR will have a frame attached *\/
 *     if(!originalEvent.frame) return;
 *     Anchor.create(anchorObject, {uuid: id, persist: true}, originalEvent.frame);
 * });
 * ```
 */
export declare class Anchor extends Component {
    #private;
    static TypeName: string;
    persist: boolean;
    /** Unique identifier to load a persistent anchor from, or empty/null if unknown */
    uuid: string | null;
    /** The xrAnchor, if created */
    xrAnchor: XRAnchor | null;
    /** Emits events when the anchor is created either by being restored or newly created */
    onCreate: Emitter<[Anchor]>;
    /** Whether the anchor is currently being tracked */
    visible: boolean;
    /** Emits an event when this anchor starts tracking */
    onTrackingFound: Emitter<[Anchor]>;
    /** Emits an event when this anchor stops tracking */
    onTrackingLost: Emitter<[Anchor]>;
    /** XRFrame to use for creating the anchor */
    xrFrame: XRFrame | null;
    /** XRHitTestResult to use for creating the anchor */
    xrHitResult: XRHitTestResult | null;
    /** Retrieve all anchors of the current scene */
    static getAllAnchors(): Anchor[];
    /**
     * Create a new anchor
     *
     * @param o Object to attach the component to
     * @param params Parameters for the anchor component
     * @param frame XRFrame to use for anchor cration, if null, will use the current frame if available
     * @param hitResult Optional hit-test result to create the anchor with
     * @returns Promise for the newly created anchor component
     */
    static create(o: Object3D, params: any, frame?: XRFrame, hitResult?: XRHitTestResult): Promise<[Anchor]> | null;
    start(): void;
    update(): void;
    onDestroy(): void;
}
export {};
