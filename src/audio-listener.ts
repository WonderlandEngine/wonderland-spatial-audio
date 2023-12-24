import {Component} from '@wonderlandengine/api';

const SAMPLE_RATE = 48000;
const tempVec: Float32Array = new Float32Array(3);
const tempVec2: Float32Array = new Float32Array(3);
export const audioBuffers: {[key: string]: Promise<AudioBuffer>} = {};

/**
 * Variables
 */
let _audioContext: AudioContext = null!;
if (window.AudioContext !== undefined) {
    _audioContext = new AudioContext({
        latencyHint: 'interactive',
        sampleRate: SAMPLE_RATE,
    });
}

export {_audioContext};

export async function getAudioData(file: string) {
    try {
        if (await audioBuffers[file]) return;

        const response = await fetch(file);

        if (!response.ok) {
            console.error(`wl-listener: Failed to fetch audio data from ${file}`)
            return
        }

        const buffer = await response.arrayBuffer();
        audioBuffers[file] = _audioContext.decodeAudioData(buffer);
    } catch (error) {
        console.error(`wl-listener: Error in getAudioData for file ${file}`);
        return
    }
}
/**
 * Represents a Wonderland audio listener component.
 * Updates the position and orientation of a WebAudio listener instance.
 *
 * @note Only one listener should be active at a time.
 */
export class AudioListener extends Component {
    static TypeName = 'audio-listener';
    static Properties = {};

    /**
     * The WebAudio listener instance associated with this component.
     */
    private readonly listener = _audioContext.listener;

    /**
     * The time in which the last position update will be done.
     */
    private time: number = 0;

    start() {
        /* Check if recommended functions are supported */
        if ('positionX' in this.listener) {
            /* supported */
            this.update = this._updateRecommended.bind(this);
        } else {
            /* unsupported */
            this.update = this._updateDeprecated.bind(this);
        }
    }

    _updateDeprecated() {
        /* Set the position of the listener */
        this.object.getPositionWorld(tempVec);
        this.listener.setPosition(tempVec[0], tempVec[2], -tempVec[1]);

        /* Set the orientation of the listener */
        this.object.getForwardWorld(tempVec);
        this.object.getUpWorld(tempVec2);
        this.listener.setOrientation(
            tempVec[0],
            tempVec[2],
            -tempVec[1],
            tempVec2[0],
            tempVec2[2],
            -tempVec2[1]
        );
    }
    _updateRecommended(dt: number) {
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
