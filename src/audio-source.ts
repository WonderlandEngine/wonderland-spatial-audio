import {Component, Emitter, WonderlandEngine} from '@wonderlandengine/api';
import {property} from '@wonderlandengine/api/decorators.js';
import {_audioContext, AudioListener, _unlockAudioContext} from './audio-listener.js';
import {PlayConfig, PlayStateWithID, AudioChannel, IAudioManager, AudioManager, EmptyAudioManager, PlayState} from './audio-manager.js';
import {MIN_RAMP_TIME, MIN_VOLUME, BufferPlayer} from './audio-players.js';

// TODO (Timothy): list
// - Add something to audio manager that will notifiy state change and let someone know easily
// - Make lookup easier for currently active unique ids (Keep a list of currently playing or something?)
// - Add ability to configure entire panner options in audio manager 

export enum PanningType {
    None,
    Regular,
    Hrtf,
}

/**
 * Constants
 */
const posVec = new Float32Array(3);
const oriVec = new Float32Array(3);
const distanceModels = ['linear', 'exponential', 'inverse'];

let idCounter = 0;
const loadedPaths = new Map<string, number>();

const sourceAudioManager: IAudioManager = window.AudioContext
    ? new AudioManager()
    : new EmptyAudioManager();

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
     * Volume of the audio source.
     *
     * @remarks This will only take effect audio that has not started playing yet. Is the audio already playing, use
     * setVolumeDuringPlayback()
     * @see setVolumeDuringPlayback
     */
    @property.float(1.0)
    set volume(v: number) {
        if (this.isPlaying) {
            const volume = Math.max(MIN_VOLUME, v);
            const time = _audioContext.currentTime + MIN_RAMP_TIME;
            for (const player of sourceAudioManager._playerCache) {
                if (player.playId == this._uniqueAudioID) {
                    player._gainNode.gain.linearRampToValueAtTime(volume, time);
                    break;
                }
            }
        } 
        this._volume = v;
    }


    /** Whether to loop the sound. */
    @property.bool(false)
    loop!: boolean;

    /** Whether to autoplay the sound. */
    @property.bool(false)
    autoplay!: boolean;

    /**
     * Select the panning method.
     *
     * @warning Enabling HRTF (Head-Related Transfer Function) is computationally more intensive than regular panning!
     */
    @property.enum(['none', 'panning', 'hrtf'], PanningType.Regular)
    spatial!: PanningType;

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


    /**
     * The emitter will notify all subscribers when a state change occurs.
     * @see PlayState
     */
    readonly emitter = new Emitter<[PlayState]>();

    private _pannerOptions: PannerOptions = {};
    private _buffer!: AudioBuffer;
    private _time = 0;
    private _audioID = -1;
    private _uniqueAudioID = -1;
    private _channel = AudioChannel.Master;
    private _volume = 1;
    private _isPlaying = false;
    private _currentPlayer: BufferPlayer | undefined = undefined;

    /**
     * Initializes the audio src component.
     * If `autoplay` is enabled, the audio will start playing as soon as the file is loaded.
     *
     * @throws If no audio source path was provided.
     */
    async start() {
        if (this.src !== '') {
            // TODO (Timothy): Make sure this is not ruined by async
            loadedPaths.set(this.src, idCounter);
            this._audioID = idCounter;
            idCounter++;
            await sourceAudioManager.load(this.src, this._audioID);
        }

        // TODO (Timothy): This is very bad since it will get a message for each audio that changes state -> N^2
        sourceAudioManager.emitter.add((data: PlayStateWithID) => {
            if (data.id !== this._uniqueAudioID) return
            switch (data.state) {
            case PlayState.Playing:
                this._isPlaying = true;
            case PlayState.Stopped:
                this._isPlaying = false;
                this.update = undefined
                break;
            case PlayState.Paused:
                this._isPlaying = false;
            default:
            }
        })
        this.emitter.notify(PlayState.Ready);
        if (this.autoplay && this._audioID !== -1) {
            this._uniqueAudioID = sourceAudioManager.autoplay(this._audioID);
        }
    }

    // TODO (Timothy): Add documentation, @deprecated am param
    setAudioChannel(am: AudioManager | undefined, channel: AudioChannel) {
        this.stop();
        this._channel = channel;
    }

    /**
     * Plays the audio associated with this audio src.
     *
     * @remarks Is this audio-source currently playing, playback will be restarted.
     */
    async play() {
        if (_audioContext.state === 'suspended') {
            await _unlockAudioContext();
        }

        const playConfig: PlayConfig = {
            volume: this.volume,
            loop: this.loop,
            priority: true, // AudioSource should prob never stop playing randomly
            channel: this._channel,
            // TODO (Timothy): Add offset when implemented resume feature
        }

        if (this.spatial) {
            this._updateSettings();
            playConfig.pannerOptions = this._pannerOptions;
            if (!this.isStationary) {
                this.update = this._update.bind(this);
                for (const player of sourceAudioManager._playerCache) {
                    if (player.playId === this._uniqueAudioID) {
                        this._currentPlayer = player;
                        break;
                    }
                }
            }
        } 


        this._uniqueAudioID = sourceAudioManager.play(this._audioID, playConfig);
        this.emitter.notify(PlayState.Playing);
    }

    /**
     * Stops the audio associated with this audio src.
     */
    stop() {
        sourceAudioManager.stop(this._uniqueAudioID)
        this.emitter.notify(PlayState.Stopped);
    }

    /**
     * Checks if the audio src is currently playing.
     */
    get isPlaying(): boolean {
        return this._isPlaying;
    }

    /**
     * Changes the volume during playback.
     * @param v Volume that source should have.
     * @param t Optional parameter that specifies the time it takes for the volume to reach its specified value in
     * seconds (Default is 0).
     */
    setVolumeDuringPlayback(v: number, t = 0) {
        if (this.isPlaying) {
            const volume = Math.max(MIN_VOLUME, v);
            const time = _audioContext.currentTime + Math.max(MIN_RAMP_TIME, t);
            for (const player of sourceAudioManager._playerCache) {
                if (player.playId == this._uniqueAudioID) {
                    player._gainNode.gain.linearRampToValueAtTime(volume, time);
                    break;
                }
            }
        } 
        this._volume = v;
    }

    /**
     * Change out the source.
     *
     * @param path Path to the audio file.
     */
    async changeAudioSource(path: string) {
        this.stop()
        this.src = path;
        let id = loadedPaths.get(path);
        if (id === undefined) {
            loadedPaths.set(path, idCounter);
            id = idCounter;
            idCounter++;
            await sourceAudioManager.load(path, id);
        }

        this._audioID = id;
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
     * Stops the audio playback and removes the src from cache.
     */
    onDestroy() {
        this.stop();
        // TODO (Timothy): Add something to audio manager to remvoe sources? 
    }

    private _update(dt: number) {
        this.object.getPositionWorld(posVec);
        this.object.getForwardWorld(oriVec);
        this._currentPlayer?.updatePannerNode(dt, posVec, oriVec);
    }

    /**
     * @deprecated Use {@link #volume} instead
     */
    set maxVolume(v: number) {
        this.volume = v;
    }

    /**
     * @deprecated Use {@link #volume} instead
     */
    get maxVolume() {
        return this._volume;
    }

    get volume() {
        return this._volume;
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
            panningModel: this.spatial === PanningType.Hrtf ? 'HRTF' : 'equalpower',
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
