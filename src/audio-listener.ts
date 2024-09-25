import {Component} from '@wonderlandengine/api';

const SAMPLE_RATE = 48000;
/* 5ms for now, so it definitely takes less than one frame */
const FADE_DURATION = 5 / 1000;
const tempVec = new Float32Array(3);
const tempVec2 = new Float32Array(3);

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

/**
 * Unlocks the WebAudio AudioContext.
 *
 * @returns a promise that fulfills when the audioContext resumes.
 * @remarks WebAudio AudioContext only resumes on user interaction.
 * @warning This is for internal use only, use at own risk!
 */
export async function _unlockAudioContext(): Promise<void> {
    return new Promise<void>((resolve) => {
        const unlockHandler = () => {
            _audioContext.resume().then(() => {
                window.removeEventListener('click', unlockHandler);
                window.removeEventListener('touch', unlockHandler);
                window.removeEventListener('keydown', unlockHandler);
                window.removeEventListener('mousedown', unlockHandler);
                resolve();
            });
        };

        window.addEventListener('click', unlockHandler);
        window.addEventListener('touch', unlockHandler);
        window.addEventListener('keydown', unlockHandler);
        window.addEventListener('mousedown', unlockHandler);
    });
}

/**
 * Represents a Wonderland audio listener component.
 * Updates the position and orientation of a WebAudio listener instance.
 *
 * @remarks Only one listener should be active at a time.
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
    private time = 0;

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
    _updateRecommended() {
        this.time = _audioContext.currentTime + FADE_DURATION;
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
