/// <reference types="webxr" />
import { Component, Emitter } from '@wonderlandengine/api';
/**
 * Sets up a [WebXR Device API "Hit Test"](https://immersive-web.github.io/hit-test/)
 * and places the object to the hit location.
 *
 * **Requirements:**
 *  - Specify `'hit-test'` in the required or optional features on the AR button in your html file.
 *    See [Wastepaperbin AR](/showcase/wpb-ar) as an example.
 */
export declare class HitTestLocation extends Component {
    static TypeName: string;
    tempScaling: Float32Array;
    visible: boolean;
    xrHitTestSource: XRHitTestSource | null;
    /** Reference space for creating the hit test when the session starts */
    xrReferenceSpace: XRReferenceSpace | null;
    /**
     * For maintaining backwards compatibility: Whether to scale the object to 0 and back.
     * @deprecated Use onHitLost and onHitFound instead.
     */
    scaleObject: boolean;
    /** Emits an event when the hit test switches from visible to invisible */
    onHitLost: Emitter<[HitTestLocation]>;
    /** Emits an event when the hit test switches from invisible to visible */
    onHitFound: Emitter<[HitTestLocation]>;
    onSessionStartCallback: ((s: XRSession) => void) | null;
    onSessionEndCallback: (() => void) | null;
    start(): void;
    onActivate(): void;
    onDeactivate(): void;
    update(): void;
    getHitTestResults(frame?: XRFrame | null): XRHitTestResult[];
    onXRSessionStart(session: XRSession): void;
    onXRSessionEnd(): void;
}
