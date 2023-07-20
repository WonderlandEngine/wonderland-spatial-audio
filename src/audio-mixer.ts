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
    private sources: [AudioBuffer, HRTFPanner, GainNode, number, DelayNode][];
    private audioNodes: (AudioBufferSourceNode | undefined)[];
    private isLoaded: Promise<boolean>;
    private lowPass: BiquadFilterNode;

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
    }

    /**
     * Sets the listener object in the AudioMixer.
     *
     * @param object The listener that receives the audio.
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
     * @param {Float32Array} position current position world of the emmitter.
     * @returns {Promise<number>} The ID that identifies the source.
     */
    async addSource(audioFile: string, position: Float32Array, vol: number): Promise<number> {
        const audioData: AudioBuffer = await this.getAudioData(audioFile);
        const gainNode: GainNode = _audioContext.createGain();
        let delayNode = _audioContext.createDelay();
        delayNode.connect(gainNode);
        gainNode.connect(this.lowPass);
        gainNode.gain.value = INIT_GAIN;
        const panner = new HRTFPanner(gainNode);

        const sourceId = this.sources.length;
        this.sources.push([audioData, panner, gainNode, vol, delayNode]);

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
        if (sourceId >= this.sources.length || this.listener === undefined) {
            return false;
        }

        /* Figure out relative object position to the listener */
        this.listener.transformPointInverseWorld(tempVec, position);
        const cords = cartesianToInteraural(
            tempVec[0],
            tempVec[2],
            tempVec[1]
        );

        /* Update the panners position */
        this.sources[sourceId][1].update(cords.azimuth, cords.elevation);

        /* Change the volume by the distance */
        this.listener.getPositionWorld(tempVec);
        const distance = Math.abs(vec3.distance(tempVec, position));
        const delay = distance / 340;
        this.sources[sourceId][4].delayTime.setValueAtTime(delay, _audioContext.currentTime);
        const rolloffFactor = 0.5;
        const refDistance = 1.0;
        const vol =
            refDistance /
            (refDistance + rolloffFactor * (Math.max(distance, refDistance) - refDistance));
        this.sources[sourceId][2].gain.value = vol * this.sources[sourceId][3];
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
        audioNode.connect(this.sources[sourceId][4]);
        audioNode.buffer = this.sources[sourceId][0];
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

    private calcDelay(pos: Float32Array): number {
        return 1;
    }
}

let audioMixer: AudioMixer;

export function getAudioMixer() {
    if (audioMixer === undefined) {
        audioMixer = new AudioMixer();
    }
    return audioMixer;
}
