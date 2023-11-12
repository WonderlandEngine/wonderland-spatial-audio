import {Component, WonderlandEngine} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {
    _audioContext,
    AudioListener,
    getAudioData,
    audioBuffers,
} from './audio-listener.js';

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

    static onRegister(engine: WonderlandEngine) {
        engine.registerComponent(AudioListener);
    }

    /**
     * Maximum volume a source can have. From 0 to 1 (0% to 100%).
     */
    @property.float(1.0)
    maxVolume!: number;

    /** Path to the audio file that should be played. */
    @property.string()
    audioFile!: string;

    /** Whether to loop the sound. */
    @property.bool(false)
    loop!: boolean;

    /** Whether to autoplay the sound. */
    @property.bool(false)
    autoplay!: boolean;

    /** Select the panning method.
     *
     * @warning Enabling HRTF (Head-Related Transfer Function) is computationally more intensive than regular panning!
     */
    @property.enum(['none', 'panning', 'hrtf'], 2)
    spatial!: number;

    /**
     * Set this property if the object will never move.
     * Disabling position updates each frame saves CPU time.
     */
    @property.bool(false)
    isStationary!: boolean;

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

    private pannerNode: PannerNode = new PannerNode(_audioContext);
    private audioNode: AudioBufferSourceNode = new AudioBufferSourceNode(_audioContext);
    private gainNode: GainNode = new GainNode(_audioContext);
    private isLoaded: Promise<void> | undefined = undefined;
    private _isPlaying = false;
    private pannerOptions: PannerOptions = {};
    private time = 0;
    private hrtf: boolean = true;

    /**
     * Initializes the audio source component.
     * If `autoplay` is enabled, the audio will start playing if the file is loaded.
     */
    async start() {
        if (this.audioFile === '') {
            console.warn(`wl-audio-source: No valid filename provided!`);
            return;
        }
        this.gainNode = new GainNode(_audioContext, {
            gain: this.maxVolume,
        });
        this.gainNode.connect(_audioContext.destination);
        this.isLoaded = getAudioData(this.audioFile);
        switch (this.spatial) {
            case 0:
                this.play = this.playNonPanned;
                break;
            case 1:
                this.play = this.playPanned;
                this.hrtf = false;
                break;
            default:
                this.play = this.playPanned;
        }
        if (this.autoplay) {
            await this.isLoaded;
            this.play();
        }
    }

    private async playPanned() {
        try {
            if (this.isLoaded === undefined || this._isPlaying) return;
            await this.isLoaded;
            this.updateSettings();
            this.audioNode = new AudioBufferSourceNode(_audioContext, {
                buffer: await audioBuffers[this.audioFile],
                loop: this.loop,
            });
            this.pannerNode = new PannerNode(_audioContext, this.pannerOptions);
            this.audioNode.connect(this.pannerNode).connect(this.gainNode);
            // Make sure to free up WebAudio resources when the audio finishes playing.
            this.audioNode.addEventListener('ended', () => {
                this.audioNode.disconnect();
                this.pannerNode.disconnect();
                this.update = undefined;
                this._isPlaying = false;
            });
            if (!this.isStationary) {
                this.update = this._update.bind(this);
            }
            this.audioNode.start();
            this._isPlaying = true;
        } catch (e) {
            console.warn(e);
        }
    }

    private async playNonPanned() {
        try {
            if (this.isLoaded === undefined || this._isPlaying) return;
            await this.isLoaded;
            this.audioNode = new AudioBufferSourceNode(_audioContext, {
                buffer: await audioBuffers[this.audioFile],
                loop: this.loop,
            });
            this.audioNode.connect(this.gainNode);
            this.audioNode.addEventListener('ended', () => {
                this._isPlaying = false;
            });
            this.audioNode.start();
            this._isPlaying = true;
        } catch (e) {
            console.warn(e);
        }
    }

    /**
     * Plays the audio associated with this audio source.
     *
     * @note This function gets the implementation assigned in the `start()` method, depending on panning preferences.
     */
    async play() {}

    /**
     * Stops the audio associated with this audio source.
     */
    stop() {
        if (this._isPlaying) this.audioNode.stop();
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

    private _update(dt: number) {
        this.object.getPositionWorld(posVec);
        this.object.getForwardWorld(oriVec);

        this.time = _audioContext.currentTime + dt;
        this.pannerNode.positionX.linearRampToValueAtTime(posVec[0], this.time);
        this.pannerNode.positionY.linearRampToValueAtTime(posVec[2], this.time);
        this.pannerNode.positionZ.linearRampToValueAtTime(-posVec[1], this.time);
        this.pannerNode.orientationX.linearRampToValueAtTime(oriVec[0], this.time);
        this.pannerNode.orientationY.linearRampToValueAtTime(oriVec[2], this.time);
        this.pannerNode.orientationZ.linearRampToValueAtTime(-oriVec[1], this.time);
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
            panningModel: this.hrtf ? 'HRTF' : 'equalpower',
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
