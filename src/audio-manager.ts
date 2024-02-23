import {_audioContext} from './audio-listener.js';

const preloadedBuffers: {[key: string]: [Promise<AudioBuffer>, number]} = {};

/** AudioManager loads and manages audiofiles from which PlayableNodes are created
 * @example
 * ```
 * start() {
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
    /**
     * Asynchronously loads an audio file and returns a Promise that resolves with a PlayableNode.
     *
     * @note Make sure to load files on `start()`, so that Nodes are ready when they are needed.
     *
     * @param file - The path or URL of the audio file to be loaded.
     * @returns A Promise that resolves with a PlayableNode representing the loaded audio.
     * @throws If there is an error during the loading process, a rejection with an error message is returned.
     */
    async load(file: string): Promise<PlayableNode> {
        try {
            /* Return when a instance of this file already is being loaded */
            const [bufferPromise, referenceCount] = preloadedBuffers[file] || [
                undefined,
                0,
            ];
            if (bufferPromise !== undefined) {
                preloadedBuffers[file][1] += 1;
                return bufferPromise.then(() => new PlayableNode(file));
            }
            const response = await fetch(file);

            if (!response.ok) {
                return Promise.reject(`Failed to fetch audio data from ${file}`);
            }

            /* Create promise that resolves once decoding is complete */
            const decodingPromise = new Promise<AudioBuffer>((resolve, reject) => {
                response
                    .arrayBuffer()
                    .then((buffer) => _audioContext.decodeAudioData(buffer))
                    .then((decodedBuffer) => resolve(decodedBuffer))
                    .catch((error) => reject(error));
            });

            preloadedBuffers[file] = [decodingPromise, 1];

            /* Return a promise that resolves with a PlayableNode when decoding is complete */
            return decodingPromise.then(() => new PlayableNode(file));
        } catch (error) {
            return Promise.reject(`audio-manager: Error in load() for file ${file}`);
        }
    },
};

async function remove(file: string) {
    const [bufferPromise, referenceCount] = preloadedBuffers[file] || [undefined, 0];
    if (await bufferPromise) {
        if (referenceCount <= 1) delete preloadedBuffers[file];
        else preloadedBuffers[file][1] -= 1;
    }
}

async function unlockAudioContext(): Promise<void> {
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
    private source: string;
    private _isPlaying: boolean = false;
    private gainNode: GainNode = new GainNode(_audioContext);
    private pannerNode: PannerNode | undefined;
    private audioNode: AudioBufferSourceNode = new AudioBufferSourceNode(_audioContext);
    private _destroy: boolean = false;

    /** Whether to loop the audio */
    public loop: boolean = false;

    /** Whether to enable HRTF over regular panning */
    public HRTF: boolean = false;

    constructor(src: string) {
        this.source = src;
        this.gainNode.connect(_audioContext.destination);
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
                await unlockAudioContext();
            }
            this.audioNode = new AudioBufferSourceNode(_audioContext, {
                buffer: await preloadedBuffers[this.source][0],
                loop: this.loop,
            });
            if (posVec !== undefined) {
                this.pannerNode = new PannerNode(_audioContext, {
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
                this.audioNode.connect(this.pannerNode).connect(this.gainNode);
            } else {
                this.audioNode.connect(this.gainNode);
            }
            this.audioNode.addEventListener('ended', this.stop);
            this.audioNode.start();
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
            this.audioNode.removeEventListener('ended', this.stop);
            this.audioNode.stop();
        }
        if (this.audioNode !== undefined) {
            this.audioNode.disconnect();
        }
        if (this.pannerNode !== undefined) {
            this.pannerNode.disconnect();
        }
        this._isPlaying = false;
        if (this._destroy) {
            remove(this.source);
            this.gainNode.disconnect();
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
        this.gainNode.gain.value = v;
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
        if (this.isPlaying) {
            this._destroy = true;
        } else {
            remove(this.source);
            this.gainNode.disconnect();
        }

        /* Remove ability to re-trigger the sound */
        this.play = this.removePlay.bind(this);
        this.destroy = () => {};
    }

    private async removePlay(): Promise<void> {}
}
