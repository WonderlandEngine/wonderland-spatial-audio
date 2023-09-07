import { Component } from '@wonderlandengine/api';
import { _audioContext } from './audio-node-manager.js';

const tempVec: Float32Array = new Float32Array(3);

/**
 * Represents a Wonderland audio listener component.
 * Updates the position and orientation of a WebAudio listener instance.
 *
 * @note Only one listener should be active at a time.
 */
export class WlListener extends Component {
    static TypeName = 'wl-listener';
    static Properties = {};

    /**
     * The WebAudio listener instance associated with this component.
     */
    private readonly listener: AudioListener = _audioContext.listener;

    /**
     * The time in which the last position update will be done.
     */
    private time: number = 0;

    update(dt: number) {
        this.time = _audioContext.currentTime + dt;
        /* Set the position of the listener */
        this.object.getPositionWorld(tempVec);
        this.listener.positionX.linearRampToValueAtTime(tempVec[0], this.time);
        this.listener.positionY.linearRampToValueAtTime(tempVec[2], this.time);
        this.listener.positionZ.linearRampToValueAtTime(-tempVec[1], this.time);

        /* Set the facing direction of the listener */
        this.object.getForwardWorld(tempVec);
        this.listener.forwardX.linearRampToValueAtTime(tempVec[0], this.time);
        this.listener.forwardY.linearRampToValueAtTime(tempVec[2], this.time);
        this.listener.forwardZ.linearRampToValueAtTime(-tempVec[1], this.time);

        /* Set the head orientation of the listener */
        this.object.getUpWorld(tempVec);
        this.listener.upX.linearRampToValueAtTime(tempVec[0], this.time);
        this.listener.upY.linearRampToValueAtTime(tempVec[2], this.time);
        this.listener.upZ.linearRampToValueAtTime(-tempVec[1], this.time);
    }
}
