import {Component, Emitter, WonderlandEngine} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {_audioContext, AudioListener} from './audio-listener.js';
import {
    AudioManager,
    globalAudioManager,
    PlayableNode,
    PlayState,
} from './audio-manager.js';

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

    /** Volume of the audio source */
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

    private _pannerOptions: PannerOptions = {};
    private _playableNode!: PlayableNode;

    /**
     * Initializes the audio src component.
     * If `autoplay` is enabled, the audio will start playing if the file is loaded.
     */
    async start() {
        await globalAudioManager.load([this.src], this._id); // @todo: Add type
        this._playableNode = globalAudioManager.getPlayableNode(this._id);
        this._playableNode.volume = this.volume;
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
        const p = this._playableNode;
        p.loop = this.loop;
        if (!this.spatial) {
            p.play();
            return;
        }
        this._updateSettings();
        p.play(this._pannerOptions);
        if (!this.isStationary) {
            this.update = this._update.bind(this);
        }
    }

    async playWithCrossfadeTransition(node: AudioSource | PlayableNode, duration: number) {
        const source = node instanceof AudioSource ? node['_playableNode'] : node;
        const p = this._playableNode;
        p.loop = this.loop;
        if (!this.spatial) {
            p.playWithCrossfadeTransition(source, duration);
            return;
        }
        this._updateSettings();
        p.playWithCrossfadeTransition(source, duration, this._pannerOptions);
        if (this.isStationary) {
            return;
        }
        if (node instanceof AudioSource) {
            /* The update function still needs to be disabled after playback */
            node.emitter.once((state) => {
                if (state == (PlayState.ENDED || PlayState.STOPPED)) {
                    node.stop();
                }
            });
        }
        this.update = this._update.bind(this);
    }

    /**
     * Stops the audio associated with this audio src.
     */
    stop() {
        this._playableNode.stop();
        this.update = undefined;
    }

    /**
     * Checks if the audio src is currently playing.
     */
    get isPlaying(): boolean {
        return this._playableNode.isPlaying;
    }

    get emitter(): Emitter<[PlayState]> {
        return this._playableNode.emitter;
    }

    changeVolumeRampTime(t: number) {
        this._playableNode.volumeRampTime = t;
    }

    changeVolume(v: number) {
        this._playableNode.volume = v;
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
        this._playableNode.destroy();
    }

    private _update(dt: number) {
        this.object.getPositionWorld(posVec);
        this.object.getForwardWorld(oriVec);
        this._playableNode.updatePosition(dt, posVec, oriVec);
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
            panningModel: this.spatial == 2 ? 'HRTF' : 'equalpower',
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
