import {_audioContext} from './audio-listener.js';
import {Emitter} from '@wonderlandengine/api';

/* Ramp times of 0 cause a click, 5 ms should be sufficient */
const MIN_RAMP_TIME = 5 / 1000;
/* Needed because WebAudio ramp function doesn't accept 0 as valid volume */
const MIN_VOLUME = 0.001;

/**
 * The PlayableNode emits PlayStates when its state changes.
 *
 * @example
 * ```js
 * this.audio.emitter.add((state) => {
 *      console.log('Node state has changed');
 *      if (state === PlayState.PLAYING) {
 *          console.log('Node started playing');
 *      }
 * });
 * ```
 */
export enum PlayState {
    /* The source is ready to be played */
    READY,
    /* The source has started playing */
    PLAYING,
    /* The source has been stopped */
    STOPPED,
    /* The source has reached the end of playback */
    ENDED,
}

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
export class PlayableNode {
    /** Whether to loop the audio. */
    public loop: boolean = false;

    /** Whether to enable HRTF over regular panning. */
    public HRTF: boolean = false;

    private _audioBuffer: AudioBuffer;
    private _audioManager: AudioManager;
    private _source: string;
    private _isPlaying: boolean = false;
    private _volume: number = 1.0;
    private _gainNode: GainNode = new GainNode(_audioContext, {
        gain: this._volume,
    });
    private _pannerNode: PannerNode | undefined;
    private _audioNode: AudioBufferSourceNode = new AudioBufferSourceNode(_audioContext);
    private _destroy: boolean = false;
    private _rampTime: number = MIN_RAMP_TIME;
    // @todo: Find out how costly this is to have per node
    private _emitter: Emitter<[PlayState]> = new Emitter<[PlayState]>();

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
        this._emitter.notify(PlayState.READY);
    }

    /**
     * Plays the audio associated with the PlayableNode. If the node is already playing,
     * it stops the current playback before starting from the beginning. If the Web Audio API
     * context is in a 'suspended' state, it unlocks the audio context before starting
     * the playback.
     *
     * @async
     * @param {Float32Array | PannerOptions} [config] - Optional configuration for audio playback.
     *     If not provided, the audio plays without panning.
     *     - If a Float32Array is provided, it is used as position coordinates for a PannerNode.
     *     - If a PannerOptions object is provided, it configures the PannerNode accordingly.
     *       see Readme for all PannerOptions settings {@link https://github.com/WonderlandEngine/wonderland-spatial-audio/blob/main/README.md}
     *
     * @throws Throws an error if the PlayableNode is destroyed, or if the
     *     configuration is invalid.
     *
     * @returns {Promise<void>} - A promise resolving when the audio playback starts.
     *
     * @example
     * // Basic usage without configuration
     * playableNode.play();
     *
     * // Usage with position configuration
     * const position = new Float32Array([1.0, 2.0, 3.0]);
     * playableNode.play(position);
     *
     * // Usage with PannerOptions configuration
     * const pannerConfig = {
     *   coneInnerAngle: 360,
     *   coneOuterAngle: 0,
     *   // ... other PannerOptions properties
     *   positionX: 1.0,
     *   positionY: 2.0,
     *   positionZ: 3.0,
     * };
     * playableNode.play(pannerConfig);
     */
    async play(config?: Float32Array | PannerOptions): Promise<void> {
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
        if (config === undefined) {
            this._audioNode.connect(this._gainNode);
        } else {
            if (config instanceof Float32Array) {
                this._pannerNode = new PannerNode(_audioContext, {
                    coneInnerAngle: 360,
                    coneOuterAngle: 0,
                    coneOuterGain: 0,
                    distanceModel: 'exponential' as DistanceModelType,
                    maxDistance: 10000,
                    refDistance: 1.0,
                    rolloffFactor: 1.0,
                    panningModel: this.HRTF ? 'HRTF' : 'equalpower',
                    positionX: config![0],
                    positionY: config![2],
                    positionZ: -config![1],
                    orientationX: 0,
                    orientationY: 0,
                    orientationZ: 1,
                });
                this._audioNode.connect(this._pannerNode!).connect(this._gainNode);
            } else if (isPannerOptions(config)) {
                this._pannerNode = new PannerNode(_audioContext, config as PannerOptions);
                this._audioNode.connect(this._pannerNode!).connect(this._gainNode);
            } else {
                throw 'playable-node: Invalid configuration for play()';
            }
        }
        this._audioNode.addEventListener('ended', () => {
            this._handleEndedEvent();
            /* If node was stopped, isPlaying will be false already */
            if (this._isPlaying) {
                this._isPlaying = false;
                this._emitter.notify(PlayState.ENDED);
            }
        });
        this._audioNode.start();
        this._isPlaying = true;
        this._emitter.notify(PlayState.PLAYING);
    }

    private _handleEndedEvent() {
        if (this._audioNode) {
            this._audioNode.disconnect();
        }
        if (this._pannerNode) {
            this._pannerNode.disconnect();
        }
        if (this._destroy) {
            this._audioManager._remove(this._source);
            this._gainNode.disconnect();
        }
    }

    /**
     * Stops the playback, and if set to destroy, removes associated audio file.
     */
    stop() {
        this._isPlaying = false;
        /* This triggers the 'ended' listener and frees the resources */
        this._audioNode.stop();
        this._emitter.notify(PlayState.STOPPED);
    }

    /**
     * Analog to `play()`, but cross-fades with a given node. Stops the playback of given node after transition.
     *
     * @param node Node to transition from.
     * @param duration Time it takes for crossfade to complete in seconds.
     * @param config Optional parameter to specify panning position.
     */
    playWithCrossfadeTransition(
        node: PlayableNode,
        duration: number,
        config?: Float32Array | PannerOptions
    ) {
        duration = Math.max(MIN_RAMP_TIME, duration);
        this.stop();
        this._gainNode.gain.value = MIN_VOLUME;
        this.play(config);
        const time = _audioContext.currentTime + duration;
        this._gainNode.gain.linearRampToValueAtTime(this._volume, time);
        node['_gainNode'].gain.linearRampToValueAtTime(MIN_VOLUME, time);
        setTimeout(() => {
            node.stop();
            /* Reset node volume to specified setting, avoiding rampTime */
            node['_gainNode'].gain.value = node.volume;
        }, duration * 1000);
    }

    get emitter(): Emitter<[PlayState]> {
        return this._emitter;
    }

    /**
     * Checks if the audio node is currently playing.
     */
    get isPlaying(): boolean {
        return this._isPlaying;
    }

    /**
     * Sets the time it takes for the volume to reach its specified value when it is playing.
     *
     * @param t Time in seconds.
     */
    set volumeRampTime(t: number) {
        this._rampTime = Math.max(MIN_RAMP_TIME, t);
    }

    /**
     * Sets the volume of this PlayableNode.
     *
     * @note Volume will ramp up with the in `volumeRampTime()` specified time (Default is 5ms).
     * @param v Volume to set the current node.
     */
    set volume(v: number) {
        this._volume = Math.max(MIN_VOLUME, v);
        const time = _audioContext.currentTime + this._rampTime;
        this._gainNode.gain.linearRampToValueAtTime(this._volume, time);
    }

    get volume(): number {
        return this._volume;
    }

    updatePosition(dt: number, posVec: Float32Array, oriVec: Float32Array) {
        if (!this._pannerNode) return;
        const time = _audioContext.currentTime + dt;
        this._pannerNode.positionX.linearRampToValueAtTime(posVec[0], time);
        this._pannerNode.positionY.linearRampToValueAtTime(posVec[2], time);
        this._pannerNode.positionZ.linearRampToValueAtTime(-posVec[1], time);
        this._pannerNode.orientationX.linearRampToValueAtTime(oriVec[0], time);
        this._pannerNode.orientationY.linearRampToValueAtTime(oriVec[2], time);
        this._pannerNode.orientationZ.linearRampToValueAtTime(-oriVec[1], time);
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

function isPannerOptions(obj: any): obj is PannerOptions {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        typeof obj.coneInnerAngle === 'number' &&
        typeof obj.coneOuterAngle === 'number' &&
        typeof obj.coneOuterGain === 'number' &&
        typeof obj.distanceModel === 'string' &&
        typeof obj.maxDistance === 'number' &&
        typeof obj.refDistance === 'number' &&
        typeof obj.rolloffFactor === 'number' &&
        typeof obj.panningModel === 'string' &&
        typeof obj.positionX === 'number' &&
        typeof obj.positionY === 'number' &&
        typeof obj.positionZ === 'number' &&
        typeof obj.orientationX === 'number' &&
        typeof obj.orientationY === 'number' &&
        typeof obj.orientationZ === 'number'
    );
}
