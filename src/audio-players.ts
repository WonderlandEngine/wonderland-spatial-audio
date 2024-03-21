import {_audioContext} from './audio-listener.js';
import {Channel, AudioManager, PlayConfig, PlayState} from './audio-manager.js';

/* Ramp times of 0 cause a click, 5 ms should be sufficient */
export const MIN_RAMP_TIME = 5 / 1000;
/* Needed because WebAudio ramp function doesn't accept 0 as valid volume */
export const MIN_VOLUME = 0.001;

export const DEF_VOL = 1.0;

const DEFAULT_PANNER_CONFIG: PannerOptions = {
    coneInnerAngle: 360,
    coneOuterAngle: 0,
    coneOuterGain: 0,
    distanceModel: 'exponential' as DistanceModelType,
    maxDistance: 10000,
    refDistance: 1.0,
    rolloffFactor: 1.0,
    panningModel: 'HRTF',
    positionX: 0,
    positionY: 0,
    positionZ: 1,
    orientationX: 0,
    orientationY: 0,
    orientationZ: 1,
};

class PlayableNode {
    public _gainNode = new GainNode(_audioContext);
    public _pannerNode = new PannerNode(_audioContext, DEFAULT_PANNER_CONFIG);
    public _audioNode = new AudioBufferSourceNode(_audioContext);
    public _pannerOptions = DEFAULT_PANNER_CONFIG;
    public _isPlaying: boolean = false;

    constructor() {}

    _reset() {
        this._isPlaying = false;
        this._audioNode.onended = null;
        this._audioNode.stop();
        this._audioNode.disconnect();
        this._pannerNode.disconnect();
        this._audioNode = new AudioBufferSourceNode(_audioContext);
    }
}

export class BufferPlayer extends PlayableNode {
    public bufferId = -1;
    private readonly _audioManager: AudioManager;

    /**
     * Constructs a BufferPlayer.
     *
     * @warning This is for internal use only. BufferPlayer's should only be created and used inside the AudioManager.
     * @param audioManager Manager that manages this player.
     */
    constructor(audioManager: AudioManager) {
        super();
        this._audioManager = audioManager;
    }

    play(audioBuffers: AudioBuffer[], id: number, config?: PlayConfig) {
        if (this._isPlaying) {
            this.stop();
        }
        this.bufferId = id;
        switch (config?.channel) {
            case Channel.MUSIC:
                this._gainNode.connect(this._audioManager['_musicGain']);
                break;
            case Channel.SFX:
                this._gainNode.connect(this._audioManager['_sfxGain']);
                break;
            default:
                this._gainNode.connect(this._audioManager['_masterGain']);
        }
        this._gainNode.gain.value = config?.volume || DEF_VOL;
        const randomIndex = Math.floor(Math.random() * audioBuffers.length);
        this._audioNode.buffer = audioBuffers[randomIndex];
        this._audioNode.loop = config?.loop || false;
        if (config?.position) {
            const position = config.position;
            this._pannerOptions.positionX = position[0];
            this._pannerOptions.positionY = position[2];
            this._pannerOptions.positionZ = -position[1];
            /* This is a workaround! We cant re-use panner nodes because they don't update fast enough when
             reconnecting */
            this._pannerNode = new PannerNode(_audioContext, this._pannerOptions);
            this._audioNode.connect(this._pannerNode).connect(this._gainNode);
        } else {
            this._audioNode.connect(this._gainNode);
        }
        this._audioNode.start();
        this._audioNode.onended = () => this.stopAndFree();
        this._isPlaying = true;
    }

    /**
     * Same as stop() but additionally calls free on the audio manager, so that it is available again.
     */
    stopAndFree() {
        this.stop();
        this._audioManager._freeUpBusyPlayer(this.bufferId);
    }

    /**
     * Stops current playback and sends notification on the audio managers emitter.
     */
    stop() {
        if (!this._isPlaying) return;
        this._reset();
        this._gainNode.disconnect();
        this._audioManager.emitter.notify({id: this.bufferId, state: PlayState.STOPPED});
    }
}

export class OneShotPlayer extends PlayableNode {
    private readonly _audioManager: AudioManager;
    /**
     * Constructs a OneShotPlayer.
     *
     * @warning This is for internal use only. OneShotPlayers's should only be created and used inside the AudioManager.
     * @param audioManager Manager that manages this player.
     */
    constructor(audioManager: AudioManager) {
        super();
        this._audioManager = audioManager;
        this._gainNode.connect(this._audioManager['_sfxGain']);
    }

    async play(
        audioBuffer: AudioBuffer,
        vol: number,
        position?: Float32Array
    ): Promise<void> {
        if (this._isPlaying) {
            this.stop();
            this._audioManager['_hasOneShotStopped'] = true;
        }
        this._gainNode.gain.value = Math.max(MIN_VOLUME, vol);
        this._audioNode.buffer = audioBuffer;
        if (!position) {
            this._audioNode.connect(this._gainNode);
        } else {
            this._pannerOptions.positionX = position[0];
            this._pannerOptions.positionY = position[2];
            this._pannerOptions.positionZ = -position[1];
            /* This is a workaround!. We cant re-use panner nodes because they don't update fast enough when
             reconnecting */
            this._pannerNode = new PannerNode(_audioContext, this._pannerOptions);
            this._audioNode.connect(this._pannerNode).connect(this._gainNode);
        }
        this._audioNode.onended = () => this.stop();
        this._audioNode.start();
        this._isPlaying = true;
    }

    stop() {
        if (!this._isPlaying) return;
        this._reset();
    }
}
