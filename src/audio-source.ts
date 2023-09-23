import { Component } from '@wonderlandengine/api';
import { _audioContext, registerNewSource, createPlayableNode, removeSource, updateSourcePosition } from './audio-node-manager.js';
import { property } from '@wonderlandengine/api/decorators.js';

/**
 * Constants
 */
const posVec = new Float32Array(3);
const oriVec = new Float32Array(3);
const distanceModels = ['linear', 'exponential', 'inverse'];

/**
 * Represents an audio source in the Wonderland Engine, allowing playback of audio files.
 */
export class AudioSource extends Component {
    /**
     * The type name for this component.
     */
    static TypeName = 'audio-source';

    @property.float(1.0)
    maxVolume!: number;

    /** Path to the audio file that should be played. */
    @property.string()
    audioFile!: string;

    /** Enable HRTF (Head-Related Transfer Function) on top of regular 3D panning.
     * @warning this feature is computationally intensive! */
    @property.bool(false)
    HRTF!: boolean;

    /**
     * Set this property if the object will never move.
     * Disabling position updates each frame saves CPU time.
     */
    @property.bool(false)
    isStationary!: boolean;

    /** Whether to loop the sound. */
    @property.bool(false)
    loop!: boolean;

    /** Whether to autoplay the sound. */
    @property.bool(false)
    autoplay!: boolean;

    /** The distance model used for spatial audio. */
    @property.enum(['linear', 'inverse', 'exponential'], 'exponential')
    distanceModel!: DistanceModelType;

    /** The maximum distance for audio falloff. */
    @property.float(10000)
    maxDistance!: number;

    /** The reference distance for audio falloff. */
    @property.float(1.0)
    refDistance!: number;

    /** The rolloff factor for audio falloff. */
    @property.float(1.0)
    rolloffFactor!: number;

    /** The inner angle of the audio cone. */
    @property.float(360)
    coneInnerAngle!: number;

    /** The outer angle of the audio cone. */
    @property.float(0)
    coneOuterAngle!: number;

    /** The outer gain of the audio cone. */
    @property.float(0)
    coneOuterGain!: number;

    private audioID = -1;
    private sourceNode: AudioBufferSourceNode = _audioContext.createBufferSource();
    private gainNode: GainNode = _audioContext.createGain();
    private isLoaded: Promise<number> | undefined = undefined;
    private _isPlaying = false;
    private pannerOptions: PannerOptions = {};

    /**
     * Initializes the audio source component.
     * If `autoplay` is enabled, the audio will start playing if the file is loaded.
     */
    async start() {
        if (this.audioFile === '') {
            console.warn(`wl-audio-source: No valid filename provided!`);
            return;
        }
        this.isLoaded = registerNewSource(this.audioFile);
        this.gainNode.gain.value = this.maxVolume;
        if (this.autoplay) {
            await this.isLoaded;
            this.play();
        }
    }

    /**
     * Plays the audio associated with this audio source.
     */
    async play() {
        try {
            if (this.isLoaded === undefined || this._isPlaying) return;
            this.audioID = await this.isLoaded;
            this.updateSettings();
            this.sourceNode = await createPlayableNode(this.audioID, this.pannerOptions, this.loop, this.gainNode);
            if (!this.isStationary) {
                this.update = this._update.bind(this);
            }
            this.sourceNode.start();

            this._isPlaying = true;

            this.sourceNode.addEventListener('ended', () => {
                /* Don't update while the audio is not playing */
                this.update = undefined;
                this._isPlaying = false;
            });
        } catch (e) {
            console.warn(e);
        }
    }

    /**
     * Stops the audio associated with this audio source.
     */
    stop() {
        if (this._isPlaying) this.sourceNode.stop();
    }

    /**
     * Checks if the audio source is currently playing.
     */
    get isPlaying(): boolean {
        return this._isPlaying;
    }

    /**
     * Called when the component is deactivated.
     * Stops the audio playback.
     */
    onDeactivate() {
        this.stop();
    }

    /**
     * Called when the component is destroyed.
     * Stops the audio playback and removes the audio source.
     */
    onDestroy() {
        this.stop();
        removeSource(this.audioID);
    }

    private _update(dt: number) {
        this.object.getPositionWorld(posVec);
        this.object.getForwardWorld(oriVec);
        updateSourcePosition(this.audioID, posVec, oriVec, dt);
    }

    private updateSettings() {
        this.object.getPositionWorld(posVec);
        this.object.getForwardWorld(oriVec);
        this.pannerOptions = {
            coneInnerAngle: this.coneInnerAngle,
            coneOuterAngle: this.coneOuterAngle,
            coneOuterGain: this.coneOuterGain,
            distanceModel: this.distanceModelSelector(),
            maxDistance: this.maxDistance,
            refDistance: this.refDistance,
            rolloffFactor: this.rolloffFactor,
            panningModel: this.HRTF ? 'HRTF' : 'equalpower',
            positionX: posVec[0],
            positionY: posVec[2],
            positionZ: -posVec[1],
            orientationX: oriVec[0],
            orientationY: oriVec[2],
            orientationZ: -oriVec[1],
        };
    }

    private distanceModelSelector(): DistanceModelType {
        if (distanceModels.includes(this.distanceModel)) {
            return this.distanceModel as DistanceModelType;
        }
        return 'exponential';
    }
}

