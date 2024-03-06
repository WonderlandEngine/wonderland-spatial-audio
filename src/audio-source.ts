import {Component, WonderlandEngine} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {_audioContext, AudioListener} from './audio-listener.js';
import {globalAudioManager} from './audio-manager.js';

/**
 * Constants
 */
const posVec = new Float32Array(3);
const oriVec = new Float32Array(3);
const distanceModels = ['linear', 'exponential', 'inverse'];

/**
 * Represents an audio src in the Wonderland Engine, allowing playback of audio files.
 */
export class AudioSource extends Component {
    /**
     * The type name for this component.
     */
    static TypeName = 'audio-source';

    static onRegister(engine: WonderlandEngine) {
        engine.registerComponent(AudioListener);
    }

    /** Path to the audio file that should be played. */
    @property.string()
    src!: string;
    /**
     * Maximum volume a src can have. From 0 to 1 (0% to 100%).
     */
    @property.float(1.0)
    volume!: number;

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
    @property.enum(['none', 'panning', 'hrtf'], 1)
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

    private _pannerNode: PannerNode = new PannerNode(_audioContext);
    private _audioNode: AudioBufferSourceNode = new AudioBufferSourceNode(_audioContext);
    private _gainNode: GainNode = new GainNode(_audioContext);
    private _audioBuffer: Promise<AudioBuffer> | undefined;
    private _isPlaying = false;
    private _pannerOptions: PannerOptions = {};
    private _time = 0;
    private _hrtf: boolean = true;

    /**
     * Initializes the audio src component.
     * If `autoplay` is enabled, the audio will start playing if the file is loaded.
     */
    async start() {
        if (this.src === '') {
            console.warn(`audio-source: No valid filename provided!`);
            return;
        }
        this._gainNode = new GainNode(_audioContext, {
            gain: this.volume,
        });
        this._gainNode.connect(_audioContext.destination);
        this._audioBuffer = globalAudioManager._add(this.src);
        if (this.autoplay) {
            this.play();
        }
    }

    /**
     * Plays the audio associated with this audio src.
     *
     * @note This function gets the implementation assigned in the `start()` method, depending on panning preferences.
     */
    async play() {
        if (this._audioBuffer === undefined) return;
        if (this.isPlaying) {
            this.stop();
        } else if (_audioContext.state === 'suspended') {
            await globalAudioManager._unlockAudioContext();
        }
        this._audioNode = new AudioBufferSourceNode(_audioContext, {
            buffer: await this._audioBuffer,
            loop: this.loop,
        });
        /* "+0" is necessary here to allow backwards compatability with howler,
         * where spatial was either true or false */
        // @ts-ignore
        switch (this.spatial + 0) {
            case 0:
                this._audioNode.connect(this._gainNode);
                break;
            case 1:
                this._hrtf = false;
            /* Fallthrough is wanted here, since the steps are the same otherwise. */
            default:
                this._updateSettings();
                this._pannerNode = new PannerNode(_audioContext, this._pannerOptions);
                this._audioNode.connect(this._pannerNode).connect(this._gainNode);
                if (!this.isStationary) {
                    this.update = this._update.bind(this);
                }
        }
        this._gainNode.gain.value = this.volume;
        this._audioNode.addEventListener('ended', this.stop);
        this._audioNode.start();
        this._isPlaying = true;
    }

    /**
     * Stops the audio associated with this audio src.
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
        this.update = undefined;
        this._isPlaying = false;
    }

    /**
     * Checks if the audio src is currently playing.
     */
    get isPlaying(): boolean {
        return this._isPlaying;
    }

    /**
     * Sets the volume of this AudioSource gradually, while it is playing.
     *
     * @param v - Volume in float values 0.0 to 1.0.
     * @param rampTime - Time until the volume has reached the specified value in seconds.
     * @warning Setting the rampTime to 0 will produce a click. To avoid this, specify at least 0.005 sec (5 ms).
     */
    changeVolumeDuringPlayback(v: number, rampTime: number) {
        this.volume = v;
        const time = _audioContext.currentTime + rampTime;
        this._gainNode.gain.exponentialRampToValueAtTime(v, time);
    }

    /**
     * Sets a new audio src.
     *
     * @param src Path to the audio file.
     * @warning Changing the src will stop current playback.
     */
    // @todo: How do i write setters for wl properties?
    changeSource(src: string) {
        if (src === '') {
            console.warn(`audio-source: No valid filename provided!`);
            return;
        }
        if (this._isPlaying) this.stop();
        globalAudioManager._remove(this.src);
        this._audioBuffer = globalAudioManager._add(src);
        this.src = src;
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
     * Stops the audio playback and removes the src from the AudioManager.
     */
    onDestroy() {
        this.stop();
        globalAudioManager._remove(this.src);
    }

    private _update(dt: number) {
        this.object.getPositionWorld(posVec);
        this.object.getForwardWorld(oriVec);

        this._time = _audioContext.currentTime + dt;
        this._pannerNode.positionX.linearRampToValueAtTime(posVec[0], this._time);
        this._pannerNode.positionY.linearRampToValueAtTime(posVec[2], this._time);
        this._pannerNode.positionZ.linearRampToValueAtTime(-posVec[1], this._time);
        this._pannerNode.orientationX.linearRampToValueAtTime(oriVec[0], this._time);
        this._pannerNode.orientationY.linearRampToValueAtTime(oriVec[2], this._time);
        this._pannerNode.orientationZ.linearRampToValueAtTime(-oriVec[1], this._time);
    }

    private _updateSettings() {
        this.object.getPositionWorld(posVec);
        this.object.getForwardWorld(oriVec);
        this._pannerOptions = {
            coneInnerAngle: this.coneInnerAngle,
            coneOuterAngle: this.coneOuterAngle,
            coneOuterGain: this.coneOuterGain,
            distanceModel: this._distanceModelSelector(),
            maxDistance: this.maxDistance,
            refDistance: this.refDistance,
            rolloffFactor: this.rolloffFactor,
            panningModel: this._hrtf ? 'HRTF' : 'equalpower',
            positionX: posVec[0],
            positionY: posVec[2],
            positionZ: -posVec[1],
            orientationX: oriVec[0],
            orientationY: oriVec[2],
            orientationZ: -oriVec[1],
        };
    }

    private _distanceModelSelector(): DistanceModelType {
        if (distanceModels.includes(this.distanceModel)) {
            return this.distanceModel as DistanceModelType;
        }
        return 'exponential';
    }
}
