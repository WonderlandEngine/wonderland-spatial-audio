/**
 * Play audio samples with correct panning and hrtf convolution.
 *
 * @version 1.0
 * @license MIT
 * @author Timohty Hale
 *
 */
import { Object3D } from "@wonderlandengine/api";
import { HRTFContainer, HRTFPanner, cartesianToInteraural } from "./hrtf.ts";
import { vec3 } from "gl-matrix";

const tempVec: Float32Array = new Float32Array(3);

/**
 * Manages the audio resources of one wonderland project.
 *
 * @note Use the getAudioMixer() function to get access to it.
 */
export class AudioMixer {
  private readonly INIT_GAIN: number = 0.3;
  private readonly audioContext: AudioContext;
  private readonly hrtfContainer: HRTFContainer;
  private listener: Object3D | undefined;
  private sources: [AudioBuffer, HRTFPanner, GainNode][];
  private audioNodes: (AudioBufferSourceNode | undefined)[];

  /**
   * Create a new AudioMixer instance.
   *
   * Use the exported 'getAudioMixer()' function to access the AudioMixer.
   *
   */
  constructor() {
    this.audioContext = new AudioContext({
      latencyHint: "interactive",
      sampleRate: 44100,
    });
    this.hrtfContainer = new HRTFContainer();
    this.audioNodes = [];
    this.sources = [];
  }

  /**
   * Sets the listener object in the AudioMixer.
   *
   * @param object The listener that receives the audio.
   */
  public setListener(object: Object3D): void {
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
  public async addSource(
    audioFile: string,
    position: Float32Array
  ): Promise<number> {
    const audioData: AudioBuffer = await this.getAudioData(audioFile);
    const gainNode: GainNode = this.audioContext.createGain();
    gainNode.gain.value = this.INIT_GAIN;
    const panner: HRTFPanner = new HRTFPanner(
      this.audioContext,
      gainNode,
      this.hrtfContainer
    );

    const sourceId: number = this.sources.length;
    this.sources.push([audioData, panner, gainNode]);

    await this.hrtfContainer.hrirLoaded;

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
  public updatePosition(sourceId: number, position: Float32Array): boolean {
    if (sourceId >= this.sources.length || this.listener == undefined) {
      return false;
    }

    /* Figure out relative object position to the listener */
    const relativePosition = new Float32Array(3);
    this.listener.transformPointInverseWorld(relativePosition, position);
    const cords = cartesianToInteraural(
      relativePosition[0],
      relativePosition[2],
      relativePosition[1]
    );

    /* Update the panners position */
    this.sources[sourceId][1].update(cords.azimuth, cords.elevation);

    /* Change the volume by the distance */
    this.listener.getPositionWorld(tempVec);
    const distance = Math.abs(vec3.distance(tempVec, position));
    const rolloffFactor = 0.5;
    const refDistance = 1.0;
    const vol =
      refDistance /
      (refDistance +
        rolloffFactor * (Math.max(distance, refDistance) - refDistance));
    this.sources[sourceId][2].gain.value = vol;
    return true;
  }

  /**
   * Play a specific source.
   *
   * @param sourceId ID of the source that is supposed to be played
   * @returns {AudioBufferSourceNode} on success. Undefined otherwise.
   */
  public playAudio(sourceId: number): AudioBufferSourceNode | undefined {
    if (sourceId >= this.sources.length) {
      return;
    }
    const audioNode: AudioBufferSourceNode =
      this.audioContext.createBufferSource();
    this.audioNodes[sourceId] = audioNode;
    audioNode.connect(this.sources[sourceId][2]);
    audioNode.buffer = this.sources[sourceId][0];
    audioNode.addEventListener(
      "ended",
      () => (this.audioNodes[sourceId] = undefined)
    );
    audioNode.start();

    return audioNode;
  }

  /**
   * Stop a specific source.
   *
   * @param sourceId ID of the source that is supposed to stop playing.
   */
  public stopAudio(sourceId: number): void {
    const audioNode = this.audioNodes[sourceId];
    if (audioNode !== undefined && this.isPlaying(sourceId)) audioNode.stop();
  }

  /**
   *
   * @param sourceId ID of the source of interest.
   * @returns {true} if the source is playing.
   */
  public isPlaying(sourceId: number): boolean {
    return this.audioNodes[sourceId] !== undefined;
  }

  private async getAudioData(file: string): Promise<AudioBuffer> {
    const response = await fetch(file);
    const buffer = await response.arrayBuffer();
    return this.audioContext.decodeAudioData(buffer);
  }

  public getNumOfSources(): number {
    return this.sources.length;
  }
}

let audioMixer: AudioMixer;

export function getAudioMixer() {
  if (audioMixer == undefined) {
    audioMixer = new AudioMixer();
  }
  return audioMixer;
}
