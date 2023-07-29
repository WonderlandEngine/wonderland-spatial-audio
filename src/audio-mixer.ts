/**
 * Play audio samples with correct panning and hrtf convolution.
 *
 * @version 1.0
 * @license MIT
 * @author Timohty Hale
 *
 */
import {Object3D} from '@wonderlandengine/api';
import {HRTFPanner, cartesianToInteraural, loadHrir} from './hrtf.ts';
import {vec3} from 'gl-matrix';

/**
 * Constants
 */
const tempVec: Float32Array = new Float32Array(3);
const HRTF_BIN: string = './hrtf_128.bin';
const INIT_GAIN = 0.3;

// @todo: Automate this so it just reads all audiofiles in the deploy folder
const allAudioFiles = [
    'sfx/1.wav',
    'sfx/2.wav',
    'sfx/3.wav',
    'sfx/4.wav',
    'sfx/welcome.wav',
    'sfx/click.wav',
    'sfx/unclick.wav',
];

export const CONV_FREQ: number = 150;

let _audioContext: AudioContext = null!;
if (window.AudioContext !== undefined) {
    _audioContext = new AudioContext({
        latencyHint: 'interactive',
        sampleRate: 44100,
    });
}

export {_audioContext};
/**
 * Manages the audio resources of one wonderland project.
 *
 * @note Use the getAudioMixer() function to get access to it.
 */
export class AudioMixer {
    private listener: Object3D | undefined;
    private readonly sources: [number, HRTFPanner, GainNode][];
    private readonly audioNodes: (AudioBufferSourceNode | undefined)[];
    private readonly isLoaded: Promise<boolean>;
    private readonly lowPass: BiquadFilterNode;
    private readonly audioFiles: [string, AudioBuffer][];
    private readonly audioIsLoaded: Promise<boolean>;

    /**
     * Create a new AudioMixer instance.
     *
     * Use the exported 'getAudioMixer()' function to access the AudioMixer.
     *
     */
    constructor() {
        this.isLoaded = loadHrir(HRTF_BIN);

        /* Low frequencies do not get convoluted with Hrir,
         * so every source gets passed through the same LowPass filter */
        this.lowPass = _audioContext.createBiquadFilter();
        this.lowPass.type = 'lowpass';
        this.lowPass.frequency.value = CONV_FREQ;
        this.lowPass.connect(_audioContext.destination);

        this.audioNodes = [];
        this.sources = [];
        this.audioFiles = [];
        this.audioIsLoaded = this.loadAllAudios();
    }

    private async loadAllAudios(): Promise<boolean> {
        for (let i = 0; i < allAudioFiles.length; i++) {
            const buf = await this.getAudioData(allAudioFiles[i]);
            this.audioFiles.push([allAudioFiles[i], buf]);
        }

        return true;
    }

    /**
     * Sets the listener object in the AudioMixer.
     *
     * @param object The listener that receives the audio
     *
     */
    setListener(object: Object3D): void {
        this.listener = object;
    }

    /**
     * Adds a audio source to the mixer.
     *
     * @note Keep track of the returned ID to update the sources position,
     * play or stop it.
     *
     * @param {string} audioFile Path to the audio sample
     * @param {Float32Array} position current position world of the emmitter
     * @param volume Max volume the sound can reach
     * @returns {Promise<number>} The ID that identifies the source
     */
    async addSource(
        audioFile: string,
        position: Float32Array,
        volume: number
    ): Promise<number> {
        /* Avoid adding duplicate audiofiles */
        await this.audioIsLoaded;
        let bufferIndex = 0;
        for (let i = 0; i < this.audioFiles.length; i++) {
            if (this.audioFiles[i][0] === audioFile) {
                bufferIndex = i;
            }
        }
        const gainNode: GainNode = _audioContext.createGain();
        gainNode.connect(this.lowPass);
        gainNode.gain.value = INIT_GAIN;
        const panner = new HRTFPanner(gainNode, volume);

        const sourceId = this.sources.length;
        this.sources.push([bufferIndex, panner, gainNode]);

        await this.isLoaded;

        /* Set initial panning */
        this.updatePosition(sourceId, position);
        return sourceId;
    }

    /**
     * Update the position of a source.
     *
     * @note This is also nesecarry if the listener position changes.
     *
     * @param sourceId ID of the source that needs updating
     * @param position Position to where it moved to
     * @returns true if update succeeded, false otherwise
     */
    updatePosition(sourceId: number, position: Float32Array): boolean {
        if (
            sourceId >= this.sources.length ||
            this.listener === undefined ||
            !this.isPlaying(sourceId)
        ) {
            return false;
        }

        /* Figure out relative object position to the listener */
        this.listener.transformPointInverseWorld(tempVec, position);
        const cords = cartesianToInteraural(tempVec[0], tempVec[2], tempVec[1]);

        /* Update the panners position */
        this.listener.getPositionWorld(tempVec);
        const distance = Math.abs(vec3.distance(tempVec, position));
        this.sources[sourceId][1].update(cords.azimuth, cords.elevation, distance);

        return true;
    }

    /**
     * Play a specific source.
     *
     * @param sourceId ID of the source that is supposed to be played
     * @returns {AudioBufferSourceNode} on success. Undefined otherwise.
     */
    playAudio(sourceId: number): AudioBufferSourceNode | undefined {
        if (sourceId >= this.sources.length) {
            return;
        }
        const audioNode: AudioBufferSourceNode = _audioContext.createBufferSource();
        this.audioNodes[sourceId] = audioNode;
        audioNode.connect(this.sources[sourceId][2]);
        // @todo: this is terrible to understand
        audioNode.buffer = this.audioFiles[this.sources[sourceId][0]][1];
        audioNode.addEventListener('ended', () => (this.audioNodes[sourceId] = undefined));
        audioNode.start();

        return audioNode;
    }

    /**
     * Stop a specific source.
     *
     * @param sourceId ID of the source that is supposed to stop playing.
     */
    stopAudio(sourceId: number): void {
        const audioNode = this.audioNodes[sourceId];
        if (audioNode !== undefined && this.isPlaying(sourceId)) audioNode.stop();
    }

    /**
     * Start playing a specific source.
     *
     * @param sourceId ID of the source of interest.
     * @returns {true} if the source is playing.
     */
    isPlaying(sourceId: number): boolean {
        return this.audioNodes[sourceId] !== undefined;
    }

    private async getAudioData(file: string): Promise<AudioBuffer> {
        const response = await fetch(file);
        const buffer = await response.arrayBuffer();
        return _audioContext.decodeAudioData(buffer);
    }

    get sourcesCount(): number {
        return this.sources.length;
    }
}

let audioMixer: AudioMixer;

export function getAudioMixer() {
    if (audioMixer === undefined) {
        audioMixer = new AudioMixer();
    }
    return audioMixer;
}
