import {_audioContext} from './audio-listener.js';

const RAMP_TIME = 20 / 1000;

/**
 * AudioManager loads and manages audio files from which PlayableNodes are created.
 *
 * @example
 * ```js
 * async start() {
 *      this.audio = await audioManager.load('click.wav');
 * }
 * onPress() {
 *      this.audio.play();
 * }
 * // if not needed any longer
 * this.audio.destroy();
 * ```
 */
export class AudioManager {
    private _bufferCache: Map<string, [AudioBuffer, number]> = new Map();

    /**
     * Creates a PlayableNode from provided audio file.
     *
     * @param source Path to the file from which to create a PlayableNode.
     */
    async load(source: string): Promise<PlayableNode> {
        return new PlayableNode(source, await this._add(source), this);
    }

    /**
     * Adds the specified file to cache.
     * @param source Path to the file that should be added to cache.
     * @warning This is for internal use only, use at own risk!
     */
    async _add(source: string): Promise<AudioBuffer> {
        if (this._bufferCache.has(source)) {
            const [audioBuffer, referenceCount] = this._bufferCache.get(source)!;
            this._bufferCache.set(source, [audioBuffer, referenceCount + 1]);
            return audioBuffer;
        }

        const response = await fetch(source);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await _audioContext.decodeAudioData(arrayBuffer);

        this._bufferCache.set(source, [audioBuffer, 1]);
        return audioBuffer;
    }

    /**
     * Removes the specified file from cache.
     *
     * @param source Path to the file that should be evicted from cache.
     * @warning This is for internal use only, use at own risk!
     */
    _remove(source: string) {
        if (!this._bufferCache.has(source)) {
            return;
        }
        const [, referenceCount] = this._bufferCache.get(source)!;
        if (referenceCount > 1) {
            const [audioBuffer, referenceCount] = this._bufferCache.get(source)!;
            this._bufferCache.set(source, [audioBuffer, referenceCount - 1]);
        } else {
            this._bufferCache.delete(source);
        }
    }

    /**
     * Unlocks the WebAudio AudioContext.
     *
     * @returns a promise that fulfills when the audioContext resumes.
     * @note WebAudio AudioContext only resumes on user interaction.
     * @warning This is for internal use only, use at own risk!
     */
    async _unlockAudioContext(): Promise<void> {
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
}

/**
 * Represents a playable audio node that can be used to play audio panned or without panning.
 *
 * @note Use the `destroy()` method if audio is not going to be used anymore, to avoid unused audio files
 * clogging up memory.
 */
class PlayableNode {
    /** Whether to loop the audio. */
    public loop: boolean = false;

    /** Whether to enable HRTF over regular panning. */
    public HRTF: boolean = false;

    private _audioBuffer: AudioBuffer;
    private _audioManager: AudioManager;
    private _source: string;
    private _isPlaying: boolean = false;
    private _gainNode: GainNode = new GainNode(_audioContext);
    private _pannerNode: PannerNode | undefined;
    private _audioNode: AudioBufferSourceNode = new AudioBufferSourceNode(_audioContext);
    private _destroy: boolean = false;

    /**
     * Constructs a PlayableNode.
     *
     * @warning This is for internal use only. PlayableNode's should only be created via the AudioManager's `load()`
     * function.
     * @param src Path to the audio file.
     * @param audioBuffer Buffer of the decoded src.
     * @param audioManager Manager that created the associated AudioBuffer.
     */
    constructor(src: string, audioBuffer: AudioBuffer, audioManager: AudioManager) {
        this._audioBuffer = audioBuffer;
        this._audioManager = audioManager;
        this._source = src;
        this._gainNode.connect(_audioContext.destination);
    }

    /**
     * Asynchronously plays the loaded audio. If the audio is already playing, it stops the current playback and
     * starts from the beginning.
     * If the audio context is in a suspended state, it attempts to unlock the audio context before playing and will
     * continue after the user has interacted with the website.
     *
     * @param posVec - An optional parameter representing the 3D spatial position of the audio src.
     *                 If provided, the audio will be spatialized using a PannerNode based on the given position vector.
     * @returns A Promise that resolves once the audio playback starts.
     */
    async play(posVec?: Float32Array): Promise<void> {
        if (this._destroy) {
            throw 'playable-node: play() was called on destroyed node!';
        }
        if (this._isPlaying) {
            this.stop();
        } else if (_audioContext.state === 'suspended') {
            await this._audioManager._unlockAudioContext();
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
                positionX: posVec![0],
                positionY: posVec![2],
                positionZ: -posVec![1],
                orientationX: 0,
                orientationY: 0,
                orientationZ: 1,
            });
            this._audioNode.connect(this._pannerNode!).connect(this._gainNode);
        } else {
            this._audioNode.connect(this._gainNode);
        }
        this._audioNode.addEventListener('ended', this.stop);
        this._audioNode.start();
        this._isPlaying = true;
    }

    /**
     * This is an alternative to the regular `play()` function, with advanced customization options for the distance
     * model and directional fall-off.
     *
     * @param pannerOptions Sets the options for the WebAudio PannerNode.
     * @returns A Promise that resolves once the audio playback starts.
     */
    async playWithAdvancedConfig(pannerOptions: PannerOptions): Promise<void> {
        if (this._destroy) {
            throw 'playable-node: play() was called on destroyed node!';
        }
        if (this._isPlaying) {
            this.stop();
        } else if (_audioContext.state === 'suspended') {
            await this._audioManager._unlockAudioContext();
        }
        this._audioNode = new AudioBufferSourceNode(_audioContext, {
            buffer: this._audioBuffer,
            loop: this.loop,
        });
        this._pannerNode = new PannerNode(_audioContext, pannerOptions);
        this._audioNode.connect(this._pannerNode!).connect(this._gainNode);
        this._audioNode.addEventListener('ended', this.stop);
        this._audioNode.start();
        this._isPlaying = true;
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
            this._audioManager._remove(this._source);
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
     * Sets the volume of this PlayableNode.
     */
    set volume(v: number) {
        const time = _audioContext.currentTime + RAMP_TIME;
        this._gainNode.gain.exponentialRampToValueAtTime(v, time);
    }

    /**
     * Free's up the audio resources after Node stopped playing.
     */
    destroy() {
        if (this._isPlaying) {
            this._destroy = true;
        } else {
            this._audioManager._remove(this._source);
            this._gainNode.disconnect();
        }

        this.destroy = () => {};
    }
}

export const globalAudioManager = new AudioManager();
