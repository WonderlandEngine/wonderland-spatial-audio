import {_audioContext} from './audio-listener.js';

const _bufferCache: Map<string, [AudioBuffer, number]> = new Map();

function _remove(source: string) {
    if (_bufferCache.has(source)) {
        const [, referenceCount] = _bufferCache.get(source)!;
        if (referenceCount > 1) {
            const [audioBuffer, referenceCount] = _bufferCache.get(source)!;
            _bufferCache.set(source, [audioBuffer, referenceCount - 1]);
        } else {
            _bufferCache.delete(source);
        }
    }
}

/** AudioManager loads and manages audiofiles from which PlayableNodes are created
 * @example
 * ```
 * async start() {
 *      this.audio = await AudioManager.load('click.wav');
 * }
 * onPress() {
 *      this.audio.play();
 * }
 * // if not needed any longer
 * this.audio.destroy();
 * ```
 */
export const AudioManager = {
    async load(source: string): Promise<PlayableNode> {
        if (_bufferCache.has(source)) {
            const [audioBuffer, referenceCount] = _bufferCache.get(source)!;
            _bufferCache.set(source, [audioBuffer, referenceCount + 1]);
            return new PlayableNode(source, audioBuffer);
        }

        try {
            const response = await fetch(source);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await _audioContext.decodeAudioData(arrayBuffer);

            _bufferCache.set(source, [audioBuffer, 1]);
            return new PlayableNode(source, audioBuffer);
        } catch (error) {
            throw error;
        }
    },
};

/* AudioContext only unlocks on user interaction, so we wait until the user interacted and the resume */
async function _unlockAudioContext(): Promise<void> {
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
 * Represents a playable audio node that can be used to play audio panned or without panning.
 *
 * @note Use the `destroy()` method if audio is not going to be used anymore, to avoid unused audio files
 * clogging up memory
 */
class PlayableNode {
    /** Whether to loop the audio */
    public loop: boolean = false;

    /** Whether to enable HRTF over regular panning */
    public HRTF: boolean = false;

    private _audioBuffer: AudioBuffer;
    private _source: string;
    private _isPlaying: boolean = false;
    private _gainNode: GainNode = new GainNode(_audioContext);
    private _pannerNode: PannerNode | undefined;
    private _audioNode: AudioBufferSourceNode = new AudioBufferSourceNode(_audioContext);
    private _destroy: boolean = false;

    constructor(src: string, audioBuffer: AudioBuffer) {
        this._audioBuffer = audioBuffer;
        this._source = src;
        this._gainNode.connect(_audioContext.destination);
    }

    /**
     * Asynchronously plays the loaded audio. If the audio is already playing, it stops the current playback and starts anew.
     * If the audio context is in a suspended state, it attempts to unlock the audio context before playing and will
     * continue after the user has interacted with the website.
     *
     * @param posVec - An optional parameter representing the 3D spatial position of the audio source.
     *                 If provided, the audio will be spatialized using a PannerNode based on the given position vector.
     * @returns A Promise that resolves once the audio playback starts.
     * @throws - If there is an error during the playback process, a warning is logged to the console.
     */
    async play(posVec?: Float32Array): Promise<void> {
        try {
            if (this.isPlaying) {
                this.stop();
            }
            if (_audioContext.state === 'suspended') {
                await _unlockAudioContext();
            }
            this._audioNode = new AudioBufferSourceNode(_audioContext, {
                buffer: this._audioBuffer,
                loop: this.loop,
            });
            if (posVec !== undefined) {
                this._pannerNode = new PannerNode(_audioContext, {
                    coneInnerAngle: 360,
                    coneOuterAngle: 0,
                    coneOuterGain: 0,
                    distanceModel: 'exponential' as DistanceModelType,
                    maxDistance: 10000,
                    refDistance: 1.0,
                    rolloffFactor: 1.0,
                    panningModel: this.HRTF ? 'HRTF' : 'equalpower',
                    positionX: posVec[0],
                    positionY: posVec[2],
                    positionZ: -posVec[1],
                    orientationX: 0,
                    orientationY: 0,
                    orientationZ: 1,
                });
                this._audioNode.connect(this._pannerNode).connect(this._gainNode);
            } else {
                this._audioNode.connect(this._gainNode);
            }
            this._audioNode.addEventListener('ended', this.stop);
            this._audioNode.start();
            this._isPlaying = true;
        } catch (e) {
            console.warn(e);
        }
    }

    /**
     * Stops the playback, and if set to destroy, removes associated audio file.
     */
    stop() {
        if (this.isPlaying) {
            this._audioNode.removeEventListener('ended', this.stop);
            this._audioNode.stop();
        }
        if (this._audioNode !== undefined) {
            this._audioNode.disconnect();
        }
        if (this._pannerNode !== undefined) {
            this._pannerNode.disconnect();
        }
        this._isPlaying = false;
        if (this._destroy) {
            _remove(this._source);
            this._gainNode.disconnect();
        }
    }

    /**
     * Checks if the audio node is currently playing.
     */
    get isPlaying(): boolean {
        return this._isPlaying;
    }

    /**
     * Sets the volume of this PlayableNode
     */
    set volume(v: number) {
        this._gainNode.gain.value = v;
    }

    /**
     * Free's up the audio resources after Node stopped playing.
     *
     * @example
     * ```
     * this.audio.play() // plays entire audio file
     * this.destroy()    // frees resources
     * this.audio.play() // does nothing
     * ```
     */
    destroy() {
        if (this._isPlaying) {
            this._destroy = true;
        } else {
            _remove(this._source);
            this._gainNode.disconnect();
        }

        /* Remove ability to re-trigger the sound */
        this.play = this._removePlay.bind(this);
        this.destroy = () => {};
    }

    private async _removePlay(): Promise<void> {}
}
