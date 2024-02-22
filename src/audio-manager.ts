import {
    _audioContext,
    audioBuffers,
} from './audio-listener.js';

export enum SpatializationType {
    HRFT,
    EqualPower,
}

class AudioManager {
    private preloadedBuffers: {[key: string]: [Promise<AudioBuffer>, number]} = {};

    async load(file: string): Promise<PlayableNode> {
        try {
            /* Return when a instance of this file already being loaded */
            const [bufferPromise, referenceCount] = this.preloadedBuffers[file] || [
                undefined,
                0,
            ];
            if (bufferPromise !== undefined) {
                this.preloadedBuffers[file][1] += 1;
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

            this.preloadedBuffers[file] = [decodingPromise, 1];

            /* Return a promise that resolves with a PlayableNode when decoding is complete */
            return decodingPromise.then(() => new PlayableNode(file));
        } catch (error) {
            return Promise.reject(`audio-manager: Error in load() for file ${file}`);
        }
    }

    // @todo: This function should only be used internally by PlayableNode.
    async remove(file: string) {
        const [bufferPromise, referenceCount] = this.preloadedBuffers[file] || [
            undefined,
            0,
        ];
        if (await bufferPromise) {
            if (referenceCount <= 1) delete this.preloadedBuffers[file];
            else this.preloadedBuffers[file][1] -= 1;
        }
    }
}

class PlayableNode {
    private source: string;
    private _isPlaying: boolean = false;
    private gainNode: GainNode = new GainNode(_audioContext);
    private pannerNode: PannerNode | undefined;
    private audioNode: AudioBufferSourceNode = new AudioBufferSourceNode(_audioContext);

    public loop: boolean = false;

    constructor(src: string) {
        this.source = src;
        this.gainNode.connect(_audioContext.destination);
    }

    async play(): Promise<void> {
        try {
            if (this.isPlaying) {
                this.stop();
            }
            this.audioNode = new AudioBufferSourceNode(_audioContext, {
                buffer: await audioBuffers[this.source],
                loop: this.loop,
            });
            this.audioNode.connect(this.gainNode);
            if (_audioContext.state === 'suspended') {
                await _audioContext.resume();
            }
            this.audioNode.addEventListener('ended', this.stop);
            this.audioNode.start();
            this._isPlaying = true;
        } catch (e) {
            console.warn(e);
        }
    }

    async playSpatialHRTF(posVec: Float32Array): Promise<void> {
        try {
            if (this.isPlaying) {
                this.stop();
            }
            this.audioNode = new AudioBufferSourceNode(_audioContext, {
                buffer: await audioBuffers[this.source],
                loop: this.loop,
            });
            this.pannerNode = new PannerNode(_audioContext, {
                coneInnerAngle: 360,
                coneOuterAngle: 0,
                coneOuterGain: 0,
                distanceModel: 'exponential' as DistanceModelType,
                maxDistance: 10000,
                refDistance: 1.0,
                rolloffFactor: 1.0,
                panningModel: 'HRTF',
                positionX: posVec[0],
                positionY: posVec[2],
                positionZ: -posVec[1],
                orientationX: 0,
                orientationY: 0,
                orientationZ: 1,
            });
            this.audioNode.connect(this.pannerNode).connect(this.gainNode);
            if (_audioContext.state === 'suspended') {
                await _audioContext.resume();
            }
            this.audioNode.addEventListener('ended', this.stop);
            this.audioNode.start();
            this._isPlaying = true;
        } catch (e) {
            console.warn(e);
        }
    }

    async playSpatialPanned(posVec: Float32Array): Promise<void> {
        try {
            if (this.isPlaying) {
                this.stop();
            }
            this.audioNode = new AudioBufferSourceNode(_audioContext, {
                buffer: await audioBuffers[this.source],
                loop: this.loop,
            });
            this.pannerNode = new PannerNode(_audioContext, {
                coneInnerAngle: 360,
                coneOuterAngle: 0,
                coneOuterGain: 0,
                distanceModel: 'exponential' as DistanceModelType,
                maxDistance: 10000,
                refDistance: 1.0,
                rolloffFactor: 1.0,
                panningModel: 'equalpower',
                positionX: posVec[0],
                positionY: posVec[2],
                positionZ: -posVec[1],
                orientationX: 0,
                orientationY: 0,
                orientationZ: 1,
            });
            this.audioNode.connect(this.pannerNode).connect(this.gainNode);
            if (_audioContext.state === 'suspended') {
                await _audioContext.resume();
            }
            this.audioNode.addEventListener('ended', this.stop);
            this.audioNode.start();
            this._isPlaying = true;
        } catch (e) {
            console.warn(e);
        }
    }

    /**
     * Stops the audio associated with this audio source.
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
    }

    /**
     * Checks if the audio node is currently playing.
     */
    get isPlaying(): boolean {
        return this._isPlaying;
    }

    set volume(v: number) {
        // @todo: Check value
        this.gainNode.gain.value = v;
    }

    destroy() {
        this.stop();
        audioManager.remove(this.source);
    }
}

const audioManager: AudioManager = new AudioManager();

export {audioManager};
